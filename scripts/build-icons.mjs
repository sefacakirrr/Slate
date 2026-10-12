/**
 * Builds every app icon asset from one SVG source.
 *
 *   node scripts/build-icons.mjs <icon.svg> [--out-dir <dir>]
 *   node scripts/build-icons.mjs <a.svg> <b.svg> ... --preview <sheet.png>
 *
 * Outputs (default out-dir = repo root, so files land in their real places):
 *   resources/icon.png            1024x1024
 *   resources/icon.ico            PNG-in-ICO: 16, 24, 32, 48, 64, 128, 256
 *   resources/icon.icns           icp4 16, icp5 32, ic07 128, ic08 256, ic09 512, ic10 1024,
 *                                 ic11 32 (16@2x), ic12 64 (32@2x), ic13 256 (128@2x), ic14 512 (256@2x)
 *   resources/tray.png            32x32
 *   resources/tray@2x.png         64x64
 *   src/renderer/assets/logo.ico  same bytes as icon.ico
 *
 * With --out-dir <dir>, the same relative layout is written under <dir> instead.
 *
 * No extra dependencies: rasterization uses Electron itself. The SVG is loaded as an
 * <img> in a hidden window and drawn with canvas drawImage at each target size, so
 * Chromium rasterizes the vector directly at that size (crisper than downscaling one
 * big bitmap). The ICO and ICNS containers are written by hand below.
 *
 * Run with plain `node`: the script re-launches itself under the Electron binary.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const root = resolve(dirname(scriptPath), '..')

// ── Re-launch under Electron when started by plain Node ─────────────────────
if (!process.versions.electron) {
  const require = createRequire(import.meta.url)
  const electronPath = require('electron')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electronPath, [scriptPath, ...process.argv.slice(2)], { stdio: 'inherit', env })
  child.on('exit', (code) => process.exit(code ?? 1))
} else {
  runInElectron().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

// ── Argument parsing ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const svgs = []
  let outDir = root
  let preview = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out-dir') outDir = resolve(argv[++i])
    else if (a === '--preview') preview = resolve(argv[++i])
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`)
    else svgs.push(resolve(a))
  }
  if (svgs.length === 0) {
    throw new Error('Usage: build-icons.mjs <icon.svg> [--out-dir <dir>] | <a.svg> ... --preview <out.png>')
  }
  if (!preview && svgs.length !== 1) throw new Error('Pass exactly one SVG (or use --preview).')
  return { svgs, outDir, preview }
}

// ── Electron side ───────────────────────────────────────────────────────────
async function runInElectron() {
  const { app, BrowserWindow } = await import('electron')
  // Electron passes its own argv; our args follow the script path.
  const idx = process.argv.findIndex((a) => resolve(a) === scriptPath)
  let opts
  try {
    opts = parseArgs(process.argv.slice(idx + 1))
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  app.disableHardwareAcceleration()
  await app.whenReady()
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 400,
    transparent: true,
    webPreferences: { offscreen: true, sandbox: true },
  })
  await win.loadURL('data:text/html,<!doctype html><meta charset="utf-8"><body></body>')

  try {
    if (opts.preview) await buildPreview(win, opts.svgs, opts.preview)
    else await buildIcons(win, opts.svgs[0], opts.outDir)
  } catch (err) {
    console.error(err)
    app.exit(1)
    return
  }
  app.exit(0)
}

/**
 * Small Windows/tray sizes (ICO 16/24/32, tray 32 and its 64 px @2x) are rendered with
 * the transparent safe margin cropped away: at 16 px an 80-unit margin costs ~2.5 of the
 * 16 pixels, and Windows small icons are expected to fill their frame. macOS (ICNS),
 * icon.png and ICO 48+ keep the full 1024 canvas with its margin.
 */
const CROP_VIEWBOX = '76 76 872 872'

function svgDataUrl(svgPath, crop = false) {
  let svg = readFileSync(svgPath, 'utf8')
  if (crop) {
    if (!svg.includes('viewBox="0 0 1024 1024"')) throw new Error(`${svgPath}: expected viewBox="0 0 1024 1024"`)
    svg = svg.replace('viewBox="0 0 1024 1024"', `viewBox="${CROP_VIEWBOX}"`)
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/** Rasterize one SVG at each size; returns Map<size, Buffer(PNG)>. */
async function rasterize(win, svgPath, sizes, crop = false) {
  const js = `(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(svgDataUrl(svgPath, crop))};
    await img.decode();
    const out = {};
    for (const s of ${JSON.stringify(sizes)}) {
      const c = document.createElement('canvas');
      c.width = s; c.height = s;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, s, s);
      out[s] = c.toDataURL('image/png');
    }
    return out;
  })()`
  const result = await win.webContents.executeJavaScript(js)
  const map = new Map()
  for (const s of sizes) map.set(s, Buffer.from(result[s].split(',')[1], 'base64'))
  return map
}

async function buildIcons(win, svgPath, outDir) {
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icnsSizes = [16, 32, 64, 128, 256, 512, 1024]
  const all = [...new Set([...icoSizes, ...icnsSizes, 1024])].sort((a, b) => a - b)
  const png = await rasterize(win, svgPath, all)
  const small = await rasterize(win, svgPath, [16, 24, 32, 64], true)

  const ico = buildIco(icoSizes.map((s) => [s, s <= 32 ? small.get(s) : png.get(s)]))
  const icns = buildIcns([
    ['icp4', png.get(16)],
    ['icp5', png.get(32)],
    ['ic07', png.get(128)],
    ['ic08', png.get(256)],
    ['ic09', png.get(512)],
    ['ic10', png.get(1024)],
    ['ic11', png.get(32)],
    ['ic12', png.get(64)],
    ['ic13', png.get(256)],
    ['ic14', png.get(512)],
  ])

  const files = [
    ['resources/icon.png', png.get(1024)],
    ['resources/icon.ico', ico],
    ['resources/icon.icns', icns],
    ['resources/tray.png', small.get(32)],
    ['resources/tray@2x.png', small.get(64)],
    ['src/renderer/assets/logo.ico', ico],
  ]
  for (const [rel, buf] of files) {
    const p = resolve(outDir, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, buf)
    console.log(`wrote ${p} (${buf.length} bytes)`)
  }
}

/** PNG-in-ICO (Vista+). Entry width/height byte 0 means 256. */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach(([size, data], i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt8(0, o + 2) // palette colors
    dir.writeUInt8(0, o + 3) // reserved
    dir.writeUInt16LE(1, o + 4) // color planes
    dir.writeUInt16LE(32, o + 6) // bits per pixel
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...entries.map(([, d]) => d)])
}

/** ICNS with PNG payloads. Lengths are big-endian and include the 8-byte headers. */
function buildIcns(entries) {
  const chunks = entries.map(([type, data]) => {
    const h = Buffer.alloc(8)
    h.write(type, 0, 'ascii')
    h.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([h, data])
  })
  const body = Buffer.concat(chunks)
  const h = Buffer.alloc(8)
  h.write('icns', 0, 'ascii')
  h.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([h, body])
}

/**
 * Side-by-side sheet: one column group per SVG at 256/64/32/16 (each rendered at its own
 * resolution, as the OS would), then the 32 and 16 renders magnified 4x/8x with nearest
 * neighbour so pixel-level crispness can be judged. Dark row on top, light row below.
 */
async function buildPreview(win, svgPaths, outPath) {
  const sizes = [256, 64, 32, 16]
  const urls = svgPaths.map((p) => svgDataUrl(p))
  const cropUrls = svgPaths.map((p) => svgDataUrl(p, true))
  const js = `(async () => {
    const load = (list) => Promise.all(list.map(async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; }));
    const sizes = ${JSON.stringify(sizes)};
    const bgs = ['#131a2b', '#f3f4f6'];
    const full = await load(${JSON.stringify(urls)});
    const cropped = await load(${JSON.stringify(cropUrls)});
    const imgs = full;
    // Sizes <= 32 use the margin-cropped render, matching what the ICO/tray ship.
    const pick = (k, s) => (s <= 32 ? cropped[k] : full[k]);
    const gap = 24, pad = 32, zoom = [[32, 4], [16, 8]];
    const groupW = sizes.reduce((a, s) => a + s + gap, 0) + zoom.length * (128 + gap) - gap;
    const rowH = 256 + pad * 2;
    const W = pad * 2 + imgs.length * groupW + (imgs.length - 1) * pad * 2;
    const H = rowH * bgs.length;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    // Render each size at its own resolution (as the OS would), then blit 1:1.
    const tile = (img, s) => { const t = document.createElement('canvas'); t.width = s; t.height = s;
      t.getContext('2d').drawImage(img, 0, 0, s, s); return t; };
    bgs.forEach((bg, r) => {
      ctx.fillStyle = bg; ctx.fillRect(0, r * rowH, W, rowH);
      imgs.forEach((img, k) => {
        let x = pad + k * (groupW + pad * 2);
        for (const s of sizes) {
          const y = r * rowH + pad + (256 - s) / 2;
          ctx.drawImage(tile(pick(k, s), s), x, y);
          x += s + gap;
        }
        ctx.imageSmoothingEnabled = false;
        for (const [s, f] of zoom) {
          // Composite onto the row background first so the zoom shows what the eye sees.
          const t = document.createElement('canvas'); t.width = s; t.height = s;
          const tc = t.getContext('2d'); tc.fillStyle = bg; tc.fillRect(0, 0, s, s); tc.drawImage(tile(pick(k, s), s), 0, 0);
          ctx.drawImage(t, x, r * rowH + pad + (256 - s * f) / 2, s * f, s * f);
          x += s * f + gap;
        }
        ctx.imageSmoothingEnabled = true;
      });
    });
    return c.toDataURL('image/png');
  })()`
  const dataUrl = await win.webContents.executeJavaScript(js)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log(`wrote ${outPath}`)
}
