import { execFile } from 'node:child_process'

/** One entry of the Windows Recycle Bin, as reported by the Shell COM object. */
export type RecycleBinItem = {
  /** Display name (original filename; Explorer may hide the extension). */
  name: string
  /** Folder the item was deleted from (absolute). */
  deletedFrom: string
  /** Path of the stored item inside `$Recycle.Bin` (the `$R…` entry). */
  path: string
  isFolder: boolean
}

/**
 * Minimum shape of a match string, so a bug can never turn `purgeRecycleBin`
 * into "empty the user's whole Recycle Bin".
 */
const SAFE_MATCH = /^slate-e2e-[a-z0-9-]{4,}$/

function powershell(script: string, env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`powershell failed: ${err.message}\n${stderr}`))
        else resolve(stdout)
      },
    )
  })
}

// The match string travels via an env var, never interpolated into the script.
const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$match = $env:SLATE_RB_MATCH
$bin = (New-Object -ComObject Shell.Application).NameSpace(10)
$out = @()
foreach ($i in $bin.Items()) {
  $from = [string]$i.ExtendedProperty('System.Recycle.DeletedFrom')
  if ($i.Name.Contains($match) -or $from.Contains($match)) {
    $out += [pscustomobject]@{ name = [string]$i.Name; deletedFrom = $from; path = [string]$i.Path; isFolder = [bool]$i.IsFolder }
  }
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 3
`

/**
 * Recycle Bin items whose name or deleted-from folder contains `match`
 * (e.g. the test-run id). Windows only.
 */
export async function listRecycleBin(match: string): Promise<RecycleBinItem[]> {
  if (!SAFE_MATCH.test(match)) throw new Error(`unsafe Recycle Bin match: ${match}`)
  const raw = (await powershell(LIST_SCRIPT, { SLATE_RB_MATCH: match })).trim()
  if (raw === '') return []
  const parsed = JSON.parse(raw) as RecycleBinItem[] | RecycleBinItem
  return Array.isArray(parsed) ? parsed : [parsed]
}

/**
 * Polls until a Recycle Bin item matching `match` and `predicate` shows up
 * (the Shell listing can lag a second or two behind `shell.trashItem`).
 */
export async function waitForRecycleBinItem(
  match: string,
  predicate: (item: RecycleBinItem) => boolean,
  timeoutMs = 15_000,
): Promise<RecycleBinItem> {
  const deadline = Date.now() + timeoutMs
  let last: RecycleBinItem[] = []
  while (Date.now() < deadline) {
    last = await listRecycleBin(match)
    const hit = last.find(predicate)
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(
    `Recycle Bin item not found for "${match}" within ${timeoutMs}ms. Matching items: ${JSON.stringify(last)}`,
  )
}

const PURGE_SCRIPT = `
$ErrorActionPreference = 'Stop'
$match = $env:SLATE_RB_MATCH
$bin = (New-Object -ComObject Shell.Application).NameSpace(10)
$n = 0
foreach ($i in @($bin.Items())) {
  $from = [string]$i.ExtendedProperty('System.Recycle.DeletedFrom')
  if (-not ($i.Name.Contains($match) -or $from.Contains($match))) { continue }
  $r = [string]$i.Path
  $leaf = Split-Path -Leaf $r
  if (-not $leaf.StartsWith('$R')) { continue }
  $meta = Join-Path (Split-Path -Parent $r) ('$I' + $leaf.Substring(2))
  Remove-Item -LiteralPath $r -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $meta -Force -ErrorAction SilentlyContinue
  $n++
}
Write-Output $n
`

/**
 * Permanently removes Recycle Bin items whose name or deleted-from folder
 * contains `match` (deletes the `$R…` data and its `$I…` metadata entry).
 * Refuses anything but a `slate-e2e-…` match string. Returns how many.
 */
export async function purgeRecycleBin(match: string): Promise<number> {
  if (!SAFE_MATCH.test(match)) throw new Error(`unsafe Recycle Bin match: ${match}`)
  const out = await powershell(PURGE_SCRIPT, { SLATE_RB_MATCH: match })
  return Number.parseInt(out.trim(), 10) || 0
}
