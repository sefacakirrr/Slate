/**
 * Extracts #hashtag tokens from markdown content, respecting exclusion zones
 * (fenced code blocks, inline code, URLs). Returns a deduplicated, lowercase
 * array of tag names (without the leading #).
 */
export function extractTags(content: string): string[] {
  if (!content) return []

  const cleaned = stripExclusions(content)

  const TAG_RE = /(?:^|[\s\p{P}])#([a-zA-ZÀ-ɏ][a-zA-Z0-9À-ɏ_-]{1,63})(?=$|[\s\p{P}])/gmu

  const tags = new Set<string>()
  for (const m of cleaned.matchAll(TAG_RE)) {
    const tag = m[1].toLowerCase()
    if (tag.length >= 2 && tag.length <= 64) {
      tags.add(tag)
    }
  }

  return [...tags]
}

/**
 * Removes fenced code blocks, inline code spans, and URLs from the content
 * so that # characters inside them are never scanned for tags.
 */
function stripExclusions(content: string): string {
  let result = content

  // 1. Fenced code blocks (``` or ~~~, with optional language tag)
  result = result.replace(/^(`{3,}|~{3,}).*?\n[\s\S]*?^\1\s*$/gm, '')

  // 2. Inline code (backtick spans: `...` or ``...``)
  result = result.replace(/`{1,2}[^`]*?`{1,2}/g, '')

  // 3. URLs (http/https with fragments)
  result = result.replace(/https?:\/\/[^\s)>\]]+/g, '')

  return result
}
