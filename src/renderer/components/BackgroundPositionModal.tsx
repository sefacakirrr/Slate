import { Minus, Move, Plus, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  imageDataUrl: string
  initialPosition: number
  initialScale: number
  onConfirm: (position: number, scale: number) => void
  onCancel: () => void
}

export function BackgroundPositionModal({
  imageDataUrl,
  initialPosition,
  initialScale,
  onConfirm,
  onCancel,
}: Props) {
  const [position, setPosition] = useState(initialPosition)
  const [scale, setScale] = useState(initialScale)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ y: number; startPos: number }>({ y: 0, startPos: 50 })

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
      dragStart.current = { y: e.clientY, startPos: position }
    },
    [position],
  )

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const height = container.offsetHeight
      const deltaY = e.clientY - dragStart.current.y
      const deltaPct = (deltaY / height) * 100
      const newPos = Math.max(0, Math.min(100, dragStart.current.startPos + deltaPct))
      setPosition(newPos)
    }
    const handleUp = () => setDragging(false)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScale((s) => Math.max(100, Math.min(300, s - e.deltaY * 0.5)))
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm(position, scale)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel, onConfirm, position, scale])

  const zoomIn = () => setScale((s) => Math.min(300, s + 10))
  const zoomOut = () => setScale((s) => Math.max(100, s - 10))
  const reset = () => { setPosition(50); setScale(100) }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <Move className="size-4 text-slate-400" />
          <span className="text-sm font-medium text-white">Adjust Background</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(position, scale)}
            className="rounded-md bg-accent-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-accent-600"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="relative mx-6 mt-4 mb-4 flex-1 overflow-hidden rounded-xl border border-slate-600/50">
        <div
          ref={containerRef}
          role="application"
          className={`absolute inset-0 bg-no-repeat transition-[background-size] duration-100 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            backgroundImage: `url(${imageDataUrl})`,
            backgroundSize: `${scale}%`,
            backgroundPosition: `center ${position}%`,
          }}
          onMouseDown={handleMouseDown}
        />

        {/* Drag hint — fades out while dragging */}
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${dragging ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="flex flex-col items-center gap-1 rounded-xl bg-black/60 px-5 py-3 backdrop-blur-sm">
            <Move className="size-5 text-white/80" />
            <span className="text-xs text-white/80">Drag to reposition</span>
            <span className="text-[10px] text-white/50">Scroll to zoom</span>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between border-t border-slate-700/50 px-6 py-3">
        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= 100}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-white disabled:opacity-30"
          >
            <Minus className="size-4" />
          </button>
          <div className="w-20 text-center text-xs text-slate-300">
            {Math.round(scale)}%
          </div>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= 300}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-white disabled:opacity-30"
          >
            <Plus className="size-4" />
          </button>

          <label className="ml-4 flex items-center gap-1">
            <input
              type="range"
              min="100"
              max="300"
              step="5"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-28 accent-accent-500"
            />
          </label>
        </div>

        {/* Reset + position info */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Position: {Math.round(position)}%
          </span>
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
