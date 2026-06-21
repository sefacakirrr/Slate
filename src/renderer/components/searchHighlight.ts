/**
 * Snippet match markers. These MUST mirror `SNIPPET_MARK_OPEN`/`SNIPPET_MARK_CLOSE`
 * in `main/services/SearchService.ts`: that service wraps each matched term in
 * these private-use code points, and the renderer can't import the main-process
 * constants (Node boundary) — `@shared/types` is types-only — so the contract is
 * duplicated here on purpose. They are private-use-area code points, so they
 * never collide with real note text or markdown punctuation.
 */
const MARK_OPEN = String.fromCharCode(0xe000)
const MARK_CLOSE = String.fromCharCode(0xe001)

/** One run of snippet text, flagged as a matched term or plain context. */
export type SnippetSegment = { text: string; highlight: boolean }

/**
 * Splits a result snippet into highlighted (matched-term) and plain segments by
 * the marker code points, so the panel can render `<mark>` spans without ever
 * injecting HTML. Tolerant of an unbalanced trailing open marker (renders the
 * remainder plain) and of a snippet with no markers (one plain segment). Empty
 * segments are dropped so the caller never renders empty nodes.
 */
export function splitSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = []
  let i = 0

  while (i < snippet.length) {
    const open = snippet.indexOf(MARK_OPEN, i)
    if (open === -1) {
      push(segments, snippet.slice(i), false)
      break
    }
    push(segments, snippet.slice(i, open), false)

    const close = snippet.indexOf(MARK_CLOSE, open + 1)
    if (close === -1) {
      // Unbalanced (shouldn't happen) — show the rest as plain context.
      push(segments, snippet.slice(open + 1), false)
      break
    }
    push(segments, snippet.slice(open + 1, close), true)
    i = close + 1
  }

  return segments
}

function push(segments: SnippetSegment[], text: string, highlight: boolean): void {
  if (text !== '') segments.push({ text, highlight })
}
