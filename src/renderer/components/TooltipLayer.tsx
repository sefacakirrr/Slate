import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * App-wide hover tooltip. Mounted once per renderer root (see main.tsx).
 *
 * Native `title` tooltips only appear after the pointer rests perfectly still,
 * are reset by re-renders, and misbehave on tiny buttons, draggable rows and
 * `-webkit-app-region` areas. This layer takes over every `[title]` /
 * `[data-tooltip]` element through document-level event delegation, so no
 * per-button wiring is needed:
 *
 * - On hover, the element's `title` is moved into `data-tooltip` (suppressing
 *   the native tooltip) and restored on leave, so React's view of the DOM and
 *   the element's accessible name are unchanged outside the hover.
 * - Shows after a short rest; instantly when moving between targets.
 * - Hides on leave, pointerdown, keydown, wheel, scroll, drag, window blur, and
 *   when the element is removed or hidden.
 *
 * Opt out with `data-no-tooltip` (on the element or an ancestor). Form fields
 * and anything inside the CodeMirror content keep their native behavior.
 */

const SELECTOR = '[title], [data-tooltip]'
const SKIP_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-tooltip]'
const SHOW_DELAY_MS = 350
/** Moving to another target within this window after a hide shows instantly. */
const WARM_WINDOW_MS = 300
const VIEWPORT_MARGIN = 8
const GAP = 6
const WATCH_INTERVAL_MS = 200

interface Active {
  el: HTMLElement
  /** We moved `title` → `data-tooltip` and must restore it on leave. */
  movedTitle: boolean
  /** We added `aria-label` and must remove it on leave. */
  addedAria: boolean
  /** Hidden by click/key/scroll: stay hidden until the pointer leaves. */
  suppressed: boolean
}

interface TipState {
  text: string
  rect: DOMRect
  animate: boolean
}

function findTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  if (node.closest('.cm-content')) return null
  const el = node.closest(SELECTOR)
  if (!(el instanceof HTMLElement)) return null
  if (el.closest(SKIP_SELECTOR)) return null
  if (!readText(el)) return null
  return el
}

function readText(el: HTMLElement): string {
  return (el.getAttribute('title') ?? el.getAttribute('data-tooltip') ?? '').trim()
}

function hasAccessibleName(el: HTMLElement): boolean {
  return (
    el.hasAttribute('aria-label') ||
    el.hasAttribute('aria-labelledby') ||
    (el.textContent ?? '').trim().length > 0
  )
}

function isShown(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active: Active | null = null
    let showTimer: number | undefined
    let watchTimer: number | undefined
    let observer: MutationObserver | null = null
    let visible = false
    let lastHiddenAt = 0

    /** Move any (re)appearing native `title` into `data-tooltip`. */
    const absorbTitle = (a: Active): void => {
      const title = a.el.getAttribute('title')
      if (title === null) return
      a.el.removeAttribute('title')
      if (title.trim()) {
        a.el.setAttribute('data-tooltip', title)
        a.movedTitle = true
      }
    }

    const show = (animate: boolean): void => {
      if (!active || active.suppressed) return
      const text = readText(active.el)
      if (!text || !isShown(active.el)) return
      visible = true
      setTip({ text, rect: active.el.getBoundingClientRect(), animate })
    }

    const hideTip = (): void => {
      window.clearTimeout(showTimer)
      showTimer = undefined
      if (visible) {
        visible = false
        lastHiddenAt = performance.now()
      }
      setTip(null)
    }

    /** Hide but keep the target, so it doesn't re-show until re-entered. */
    const suppress = (): void => {
      if (!active) return
      active.suppressed = true
      hideTip()
    }

    const deactivate = (): void => {
      hideTip()
      window.clearInterval(watchTimer)
      watchTimer = undefined
      observer?.disconnect()
      observer = null
      const a = active
      active = null
      if (!a) return
      if (a.movedTitle && !a.el.hasAttribute('title')) {
        const text = a.el.getAttribute('data-tooltip')
        a.el.removeAttribute('data-tooltip')
        if (text !== null) a.el.setAttribute('title', text)
      }
      if (a.addedAria) a.el.removeAttribute('aria-label')
    }

    const activate = (el: HTMLElement): void => {
      const wasVisible = visible
      deactivate()
      const a: Active = { el, movedTitle: false, addedAria: false, suppressed: false }
      active = a
      if (!hasAccessibleName(el)) {
        el.setAttribute('aria-label', readText(el))
        a.addedAria = true
      }
      absorbTitle(a)

      // Titles can change while hovered (e.g. Maximize ↔ Restore).
      observer = new MutationObserver(() => {
        if (active !== a) return
        absorbTitle(a)
        if (visible) show(false)
      })
      observer.observe(el, { attributes: true, attributeFilter: ['title', 'data-tooltip'] })

      // Safety net for leaves we never get an event for: element removed or
      // hidden, or the pointer slipping into a drag region.
      watchTimer = window.setInterval(() => {
        if (active !== a) return
        if (!isShown(a.el) || !a.el.matches(':hover')) deactivate()
      }, WATCH_INTERVAL_MS)

      const warm = wasVisible || performance.now() - lastHiddenAt < WARM_WINDOW_MS
      if (warm) show(false)
      else showTimer = window.setTimeout(() => show(true), SHOW_DELAY_MS)
    }

    const onPointerOver = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return
      const el = findTarget(e.target)
      if (el === active?.el) return
      if (el) activate(el)
      else if (active && !(e.target instanceof Node && active.el.contains(e.target))) deactivate()
    }

    const onPointerOut = (e: PointerEvent): void => {
      if (!active) return
      const to = e.relatedTarget
      if (to instanceof Node && active.el.contains(to)) return
      deactivate()
    }

    const onBlur = (): void => deactivate()

    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('pointerout', onPointerOut, true)
    document.addEventListener('pointerdown', suppress, true)
    document.addEventListener('keydown', suppress, true)
    document.addEventListener('wheel', suppress, { capture: true, passive: true })
    document.addEventListener('scroll', suppress, true)
    document.addEventListener('dragstart', suppress, true)
    window.addEventListener('blur', onBlur)
    return () => {
      deactivate()
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('pointerout', onPointerOut, true)
      document.removeEventListener('pointerdown', suppress, true)
      document.removeEventListener('keydown', suppress, true)
      document.removeEventListener('wheel', suppress, true)
      document.removeEventListener('scroll', suppress, true)
      document.removeEventListener('dragstart', suppress, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Position after render, once the tooltip's own size is known: centered
  // below the target, flipped above if it doesn't fit, clamped to the viewport.
  useLayoutEffect(() => {
    const node = tipRef.current
    if (!tip || !node) return
    const { width, height } = node.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const { rect } = tip
    let left = rect.left + rect.width / 2 - width / 2
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - width - VIEWPORT_MARGIN))
    let top = rect.bottom + GAP
    if (top + height > vh - VIEWPORT_MARGIN) top = rect.top - GAP - height
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - height - VIEWPORT_MARGIN))
    node.style.left = `${Math.round(left)}px`
    node.style.top = `${Math.round(top)}px`
    node.style.visibility = 'visible'
    if (tip.animate) {
      node.animate(
        [
          { opacity: 0, transform: 'translateY(-2px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 120, easing: 'ease-out' },
      )
    }
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      className="pointer-events-none fixed z-[10000] max-w-[280px] whitespace-pre-line rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs leading-snug text-slate-200 shadow-lg [overflow-wrap:anywhere] light:border-slate-200 light:bg-white light:text-slate-700"
    >
      {tip.text}
    </div>,
    document.body,
  )
}
