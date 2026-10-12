/**
 * Heuristic code-language detector for pasted text (no dependencies).
 *
 * It is deliberately conservative: a false negative just means a paste lands
 * as plain text (what happened before this feature), while a false positive
 * wraps someone's prose in a code fence. So text must first pass a prose gate
 * (mostly code-looking lines, almost no sentence-like lines), and then one
 * language must clearly out-score the others.
 *
 * Returned ids are names/aliases `@codemirror/language-data` resolves via
 * `LanguageDescription.matchLanguageName`, so the fence gets highlighted.
 */

export type DetectedLanguage = { language: string; score: number }

type Feature = [re: RegExp, weight: number, cap?: number]

/** Minimum score the winner needs, and how far it must lead the runner-up. */
const MIN_SCORE = 5
const MIN_LEAD = 2

const BASH_COMMANDS =
  'git|npm|npx|yarn|pnpm|bun|cd|ls|mkdir|rm|rmdir|cp|mv|curl|wget|docker|docker-compose|kubectl|helm|apt|apt-get|brew|pip|pip3|echo|export|chmod|chown|cat|grep|sed|awk|ssh|scp|tar|make|source|node|python|python3|cargo|rustup|dotnet|systemctl|touch|unzip|find|xargs|terraform|aws|az|gcloud|sudo|ln|head|tail|kill|ps|nvm|deno|set|unset|alias'
const BASH_LINE_RE = new RegExp(`^(\\$\\s+)?(sudo\\s+)?(${BASH_COMMANDS})(\\s+\\S+)*\\s*$`)

const HTML_TAGS =
  'html|head|body|div|span|p|a|ul|ol|li|table|thead|tbody|tr|td|th|section|nav|header|footer|main|article|aside|button|form|input|label|select|option|img|h[1-6]|script|style|link|meta|br|hr|strong|em|textarea|iframe|svg|template'

const FEATURES: Record<string, Feature[]> = {
  javascript: [
    [/\b(const|let|var)\s+[\w$]+\s*=/g, 2],
    [/\bfunction\s*[\w$]*\s*\(/g, 2],
    [/=>\s*[{(\w'"`[]/g, 1.5],
    [/\bconsole\.(log|error|warn|info)\(/g, 3],
    [/\brequire\(['"]/g, 3],
    [/^\s*import\s+[\w{}*,\s$]+\s+from\s+['"]/gm, 3],
    [/^\s*export\s+(default|const|function|class|async)\b/gm, 3],
    [/\b(document|window)\.\w+/g, 2],
    [/===|!==/g, 2],
    [/\bawait\s+[\w$.]+\(|\.then\(/g, 1],
    [/\bmodule\.exports\b/g, 3],
  ],
  // Added on top of the JavaScript score (TypeScript is a superset).
  typescript: [
    [
      /[\w)]\??:\s*(string|number|boolean|any|void|unknown|never|object)(\[\])?\s*([;,)=|{}]|$)/gm,
      3,
    ],
    [/^\s*(export\s+)?interface\s+\w+/gm, 3],
    [/^\s*(export\s+)?type\s+\w+(<[^>]*>)?\s*=/gm, 3],
    [/\bas\s+(const|string|number|any|unknown)\b/g, 2],
    [/^\s*import\s+type\s/gm, 3],
    [/\b(private|public|protected)\s+readonly\s+\w+/g, 2],
    [/^\s*(export\s+)?enum\s+\w+\s*\{/gm, 2],
    [/\w<(string|number|boolean|[A-Z]\w*)(\[\])?>\(/g, 2],
  ],
  python: [
    [/^\s*(async\s+)?def\s+\w+\s*\(.*\)\s*(->\s*[^:]+)?:\s*$/gm, 4],
    [/^\s*class\s+\w+(\(.*\))?:\s*$/gm, 4],
    [/^\s*import\s+[\w.]+(\s+as\s+\w+)?(\s*,\s*[\w.]+)*\s*$/gm, 3],
    [/^\s*from\s+[\w.]+\s+import\s+[\w*(]/gm, 4],
    [/^\s*(if|elif|for|while|with|try|except|finally|else)\b[^\n]*:\s*$/gm, 1.5],
    [/^\s*elif\s/gm, 3],
    [/\bself\.\w+/g, 2],
    [/\bprint\(/g, 1],
    [/\b(None|True|False)\b/g, 1],
    [/__name__\s*==\s*['"]__main__['"]/g, 5],
    [/\bf["'][^"'\n]*\{/g, 1],
  ],
  sql: [
    [/\bSELECT\b[\s\S]+?\bFROM\b/g, 4],
    [/^\s*select\b[\s\S]+?\bfrom\s+[\w.]+/gim, 2],
    [/\bINSERT\s+INTO\b/gi, 4],
    [/\bUPDATE\s+[\w.]+\s+SET\b/gi, 4],
    [/\bDELETE\s+FROM\b/gi, 4],
    [/\bCREATE\s+(TABLE|INDEX|VIEW|DATABASE|UNIQUE\s+INDEX|OR\s+REPLACE)\b/gi, 4],
    [/\b(ALTER|DROP)\s+TABLE\b/gi, 4],
    [/\b(WHERE|GROUP BY|ORDER BY|INNER JOIN|LEFT JOIN|RIGHT JOIN|HAVING|LIMIT|VALUES)\b/g, 1.5],
    [/\b(VARCHAR|INTEGER|PRIMARY KEY|NOT NULL|FOREIGN KEY|REFERENCES|AUTO_INCREMENT)\b/gi, 2],
  ],
  bash: [
    [/^#!\/(usr\/)?bin\/(env\s+)?(ba|z)?sh\b/gm, 6],
    [new RegExp(`^\\s*(\\$\\s+)?(sudo\\s+)?(${BASH_COMMANDS})(\\s|$)`, 'gm'), 2, 5],
    [/^\s*(if\s+\[\[?|then\s*$|fi\s*$|done\s*$|do\s*$|esac\s*$|elif\s+\[)/gm, 3],
    [/\|\s*(grep|awk|sed|xargs|sort|uniq|head|tail|wc|cut|tr)\b/g, 3],
    [/\s--?[a-z][\w-]*/g, 0.5],
    [/\$\{\w+\}|\$\(\w/g, 2],
    [/^\s*[A-Z_][A-Z0-9_]*=\S/gm, 1],
  ],
  powershell: [
    [
      /\b(Get|Set|New|Remove|Add|Write|Invoke|Start|Stop|Test|Import|Export|Select|Where|ForEach|Out|Format|Copy|Move|Clear|Read|Restart|Install|Update)-[A-Z][A-Za-z]+/g,
      4,
    ],
    [/\$env:\w+/g, 4],
    [/\$_\b|\$PSScriptRoot|\$true\b|\$false\b|\$null\b/g, 3],
    [/\s-(eq|ne|gt|lt|ge|le|like|match|notmatch|contains|and|or|not)\s/g, 2],
    [/\[(string|int|bool|switch|array|hashtable|pscustomobject)\]/gi, 2],
    [/^\s*param\s*\(/gim, 3],
    [/\s-[A-Z][a-zA-Z]+\b/g, 1],
  ],
  java: [
    [/\bpublic\s+(abstract\s+)?(static\s+)?(final\s+)?(class|interface|enum)\s+\w+/g, 2],
    [/\bpublic\s+static\s+void\s+main\s*\(\s*String/g, 6],
    [/\bSystem\.(out|err)\.print(ln|f)?\(/g, 5],
    [/^\s*import\s+(static\s+)?javax?\.[\w.*]+;/gm, 5],
    [/^\s*import\s+(static\s+)?[a-z][\w]*(\.[\w*]+)+;\s*$/gm, 2],
    [/^\s*package\s+[\w.]+;\s*$/gm, 4],
    [/@(Override|Autowired|Test|Entity|Service|Component|RestController)\b/g, 3],
    [/\b(String|Integer|Long|Boolean)\s+\w+\s*[=;,)]/g, 2],
    [/\bString\[\]/g, 2],
    [/\bthrows\s+\w+/g, 3],
    [/\b(private|protected|public)\s+(static\s+)?(final\s+)?[\w<>[\]]+\s+\w+\s*[;=(]/g, 1.5],
    [/\bfinal\s+\w+/g, 1],
  ],
  csharp: [
    [
      /\bpublic\s+(abstract\s+)?(static\s+)?(sealed\s+)?(partial\s+)?(class|interface|enum|record)\s+\w+/g,
      2,
    ],
    [/^\s*using\s+System(\.[\w.]+)?;/gm, 5],
    [/^\s*using\s+[A-Z][\w.]*;\s*$/gm, 2],
    [/^\s*namespace\s+[\w.]+\s*[{;]?\s*$/gm, 3],
    [/\bConsole\.(WriteLine|Write|ReadLine)\(/g, 5],
    [/\{\s*get;\s*((private|init|protected)\s+)?set;\s*\}|\{\s*get;\s*\}/g, 5],
    [/\basync\s+Task\b|\bTask<[\w<>]+>/g, 3],
    [
      /\[(HttpGet|HttpPost|Fact|Test|TestMethod|Serializable|ApiController|Route|Required)[\](]/g,
      4,
    ],
    [
      /\b(private|protected|public|internal)\s+(static\s+)?(readonly\s+)?[\w<>[\]?]+\s+\w+\s*[;=(]/g,
      1.5,
    ],
    [/\b(string|bool)\s+\w+\s*[=;,)]/g, 2],
    [/\bvar\s+\w+\s*=\s*new\b/g, 2],
  ],
  go: [
    [/^\s*package\s+\w+\s*$/gm, 4],
    [/^\s*func\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/gm, 4],
    [/:=/g, 2],
    [/\bfmt\.(Print|Println|Printf|Sprintf|Errorf|Fprintf)\(/g, 5],
    [/\berr\s*!=\s*nil\b/g, 5],
    [/^\s*import\s*\(\s*$/gm, 3],
    [/^\s*import\s+"[\w/.-]+"/gm, 3],
    [/\b(chan|defer)\s|\bgo\s+func\b/g, 2],
  ],
  rust: [
    [/^\s*(pub(\(crate\))?\s+)?(async\s+)?fn\s+\w+(<[^>]*>)?\s*\(/gm, 4],
    [/\blet\s+mut\s+\w+/g, 4],
    [/\b(println|print|eprintln|vec|format|panic|assert|assert_eq|write|writeln|todo)!\s*[([]/g, 4],
    [/^\s*use\s+[\w:]+(::\{[^}]*\}|::\w+|::\*)\s*;/gm, 4],
    [/^\s*impl(<[^>]*>)?\s+[\w<>]+/gm, 4],
    [/->\s*(Result|Option|Self|&?'?\w*\s*str|String|i32|i64|u8|u32|u64|usize|bool|Vec)\b/g, 3],
    [/&str\b|&mut\s/g, 3],
    [/#\[(derive|test|cfg)\b/g, 5],
    [/\bmatch\s+[\w.&]+\s*\{/g, 2],
  ],
  php: [
    [/<\?php/g, 8],
    [/\$this->/g, 5],
    [/\bfunction\s+\w+\s*\(\s*(\??[\w\\]+\s+)?\$\w+/g, 4],
    [/^\s*(namespace|use)\s+[A-Z]\w*(\\\w+)+;/gm, 5],
    [/\$\w+\s*=\s*[^=]/g, 1],
    [/\$\w+->\w+/g, 2],
    [/\barray\(/g, 1],
  ],
  css: [
    [
      new RegExp(
        `^\\s*([.#][\\w-]+|(${HTML_TAGS}|\\*|:root|@font-face)([.#:\\[][^{\\n]*)?)(\\s*[,>+~]?\\s*[.#:]?[\\w-]+(\\([^)]*\\))?)*\\s*\\{\\s*$`,
        'gm',
      ),
      3,
    ],
    [
      /^\s*(color|background(-color|-image)?|margin(-\w+)?|padding(-\w+)?|font(-\w+)?|display|position|width|height|border(-\w+)*|top|left|right|bottom|flex(-\w+)?|grid(-[\w-]+)?|justify-content|align-items|z-index|opacity|transition|transform|overflow(-[xy])?|text-[\w-]+|line-height|box-shadow|cursor|content|max-width|min-width|max-height|min-height|gap|--[\w-]+)\s*:\s*[^;\n]+;\s*$/gm,
      2,
      5,
    ],
    [/@(media|import|keyframes|font-face|supports)\b/g, 3],
    [/!important\b/g, 2],
    [/\b\d+(\.\d+)?(px|rem|em|vh|vw)\b/g, 0.5],
  ],
  html: [
    [/<!DOCTYPE\s+html/gi, 8],
    [new RegExp(`<(${HTML_TAGS})(\\s[^>]*)?/?>`, 'gi'), 2, 5],
    [new RegExp(`</(${HTML_TAGS})>`, 'gi'), 2, 5],
    [/\s(class|id|href|src|style|onclick|type|rel)=["']/g, 1],
  ],
  xml: [
    [/^\s*<\?xml\s/g, 8],
    [/<([A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*(\s+[\w:.-]+="[^"]*")*\s*\/?>/g, 1, 6],
    [/<\/[\w:.-]+>/g, 1, 6],
    [/\sxmlns(:\w+)?=/g, 4],
  ],
  yaml: [
    [/^\s*(-\s+)?[a-z_][\w.-]*:(\s+[^\s#][^\n]*)?$/gm, 1, 10],
    [/^\s{2,}[a-z_][\w.-]*:/gm, 2],
    [/^---\s*$/gm, 1],
  ],
  cpp: [
    [/^\s*#include\s*[<"]/gm, 6],
    [/\bstd::/g, 4],
    [/\bint\s+main\s*\(/g, 3],
    [/\b(cout|cin|endl|nullptr)\b/g, 3],
    [/\bprintf\(/g, 1],
  ],
}

const COMMENT_RE = /^(\/\/|#|--\s|\/\*|\*\/|<!--|;;|REM\s)/
const MARKDOWN_PREFIX_RE = /^([-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*|#{1,6}\s+)/
const SYMBOL_RE = /[{}[\]();=<>$\\|&`]/g
const STRONG_CODE_LINE_RES = [
  BASH_LINE_RE,
  /^(import|from|package|using|use)\s+[\w.:\\]+/,
  /^[a-z_][\w.-]*:(\s|$)/, // yaml key
  /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|JOIN|LEFT|INNER|ORDER|GROUP|VALUES)\b/,
  /^(def|class|fn|func|pub|impl|elif|else|end|fi|done|esac|then|return|break|continue|pass)\b/,
  /^(if|for|while|with|try|except|finally|elif|else)\b.*:$/,
  /^(for|while|until|select)\s.*;\s*do$/,
  /^(if|elif)\s+\[.*\]\s*(;\s*then)?$/,
  /^[\w$.[\]'"]+\s*[-+*/%]?=\s*\S/, // assignment
  /^<\/?[A-Za-z!?]/,
]

type LineKind = 'blank' | 'comment' | 'code' | 'prose' | 'other'

function classifyLine(line: string): LineKind {
  const trimmed = line.trim()
  if (trimmed === '') return 'blank'
  if (COMMENT_RE.test(trimmed) || /^\s+\*(\s|\/|$)/.test(line)) return 'comment'
  if (/^\|.*\|$/.test(trimmed)) return 'other' // markdown table row
  const s = trimmed.replace(MARKDOWN_PREFIX_RE, '')
  const words = s.match(/\p{L}[\p{L}'’-]*/gu) ?? []
  const symbols = (s.match(SYMBOL_RE) ?? []).length
  // A capitalised line ending in sentence punctuation is prose, whatever else it contains.
  if (words.length >= 4 && /^[\p{Lu}"'“]/u.test(s) && /[.!?…]["'”]?$/u.test(s)) return 'prose'
  if (
    symbols >= 2 ||
    /[;{}]\s*$/.test(s) ||
    /[\w$]\([^)]*\)/.test(s) ||
    STRONG_CODE_LINE_RES.some((re) => re.test(s))
  ) {
    return 'code'
  }
  if (words.length >= 3 && symbols === 0) return 'prose'
  return 'other'
}

/** True when `text` reads like code rather than prose/markdown. */
function passesProseGate(lines: string[]): boolean {
  let code = 0
  let prose = 0
  let other = 0
  for (const line of lines) {
    const kind = classifyLine(line)
    if (kind === 'code') code++
    else if (kind === 'prose') prose++
    else if (kind === 'other') other++
  }
  const counted = code + prose + other
  if (counted === 0) return false
  return prose / counted <= 0.2 && code / counted >= 0.6
}

function scoreFeatures(text: string, features: Feature[]): number {
  let score = 0
  for (const [re, weight, cap = 3] of features) {
    re.lastIndex = 0
    const matches = text.match(re)
    re.lastIndex = 0
    if (matches) score += weight * Math.min(matches.length, cap)
  }
  return score
}

function tryJson(text: string): boolean {
  if (!/^[[{]/.test(text) || !/[\]}]$/.test(text)) return false
  try {
    const value: unknown = JSON.parse(text)
    if (Array.isArray(value)) return value.length > 0
    return typeof value === 'object' && value !== null && Object.keys(value).length > 0
  } catch {
    return false
  }
}

/** CRLF → LF, and drop leading/trailing blank lines. */
export function normalizeCode(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '')
}

export function detectLanguage(raw: string): DetectedLanguage | null {
  const text = normalizeCode(raw)
  if (text.trim() === '') return null
  const lines = text.split('\n')
  const nonEmpty = lines.filter((l) => l.trim() !== '')

  // A single line must be long to be worth a block (short ones paste inline).
  const singleLine = nonEmpty.length < 2
  if (singleLine && text.trim().length < 40) return null

  if (tryJson(text.trim())) return { language: 'json', score: 100 }

  if (!passesProseGate(lines)) return null

  const trimmed = text.trim()
  const startsWithTag = /^</.test(trimmed) && />$/.test(trimmed)

  const scores: { language: string; score: number }[] = []
  const js = scoreFeatures(text, FEATURES.javascript)
  const tsExtra = scoreFeatures(text, FEATURES.typescript)
  const jsx =
    /<[A-Za-z][\w.]*(\s+[\w-]+=\{|\s*\/?>)[\s\S]*(<\/[A-Za-z][\w.]*>|\/>)/.test(text) &&
    /\breturn\s*\(?\s*</.test(text)
  if (tsExtra > 0) scores.push({ language: jsx ? 'tsx' : 'typescript', score: js + tsExtra })
  else scores.push({ language: jsx ? 'jsx' : 'javascript', score: js })

  for (const lang of [
    'python',
    'sql',
    'bash',
    'powershell',
    'java',
    'csharp',
    'go',
    'rust',
    'php',
    'css',
    'cpp',
  ]) {
    scores.push({ language: lang, score: scoreFeatures(text, FEATURES[lang]) })
  }

  // Markup only counts when the whole paste is markup.
  scores.push({ language: 'html', score: startsWithTag ? scoreFeatures(text, FEATURES.html) : 0 })
  scores.push({ language: 'xml', score: startsWithTag ? scoreFeatures(text, FEATURES.xml) : 0 })

  // YAML only when nearly every line is a `key:` or `- item` line.
  const yamlLines = nonEmpty.filter((l) => !/^\s*#/.test(l))
  const yamlKeyish = yamlLines.filter((l) =>
    /^\s*(-\s+)?[a-z_][\w.-]*:(\s+[^\n;{]*[^\s;{,])?\s*$/.test(l),
  ).length
  const yamlItems = yamlLines.filter((l) => /^\s*-\s+\S/.test(l)).length
  // Keys alone could be prose notes ("todo: buy milk"), so also require
  // nesting, a document marker, or mostly single-token values (ports, names).
  const yamlValues = yamlLines
    .map((l) => /^\s*(?:-\s+)?[a-z_][\w.-]*:\s*(.*)$/.exec(l)?.[1])
    .filter((v): v is string => v !== undefined)
  const simpleValues = yamlValues.filter(
    (v) => v === '' || !/\s/.test(v.trim()) || /^["'[{]/.test(v),
  ).length
  const yamlStructured =
    /^\s{2,}(-\s+)?[a-z_][\w.-]*:/m.test(text) ||
    /^---\s*$/m.test(text) ||
    (yamlValues.length > 0 && simpleValues / yamlValues.length >= 0.75)
  const yamlOk =
    yamlStructured &&
    yamlKeyish >= 2 &&
    yamlKeyish / yamlLines.length >= 0.5 &&
    (yamlKeyish + yamlItems) / yamlLines.length >= 0.85
  scores.push({ language: 'yaml', score: yamlOk ? scoreFeatures(text, FEATURES.yaml) : 0 })

  scores.sort((a, b) => b.score - a.score)
  const [best, second] = scores
  if (best.score < MIN_SCORE) return null
  if (best.score - second.score < MIN_LEAD) return null
  return best
}
