// Verification harness. Usage: node verify/run.mjs [shots|drive|all]
// Starts Vite in-process, drives the deck with Playwright's bundled Chromium.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(here)
const PORT = 5199
const BASE = `http://127.0.0.1:${PORT}`
const mode = process.argv[2] ?? 'all'

const SLIDES = [
  ['cover', 0], ['tools', 5], ['problem', 2], ['built', 1], ['proof', 1], ['lessons', 1], ['flaw', 2],
  ['next', 6], ['backup', 0], ['backup-rule', 0], ['backup-creds', 0], ['backup-limits', 0], ['backup-decisions', 0],
]
const pad = (n) => String(n).padStart(2, '0')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`) }
const ok = (msg) => console.log(`  ok   ${msg}`)
const check = (cond, msg) => (cond ? ok(msg) : fail(msg))

/** Geometry + overflow audit, run inside the page, in stage coordinates. */
const AUDIT = () => {
  const root = document.querySelector('.slide-root')
  if (!root) return { error: 'no slide root' }
  const rr = root.getBoundingClientRect()
  const scale = rr.width / 1920
  const problems = []
  const textish = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let el
  while ((el = walker.nextNode())) {
    if (el.closest('.overview, .help, .roll')) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const box = {
      left: (r.left - rr.left) / scale,
      top: (r.top - rr.top) / scale,
      right: (r.right - rr.left) / scale,
      bottom: (r.bottom - rr.top) / scale,
    }
    const desc = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || ''} "${(el.textContent || '').trim().slice(0, 40)}"`
    if (hasText) {
      const fs = parseFloat(cs.fontSize)
      textish.push({ desc, fs, color: cs.color, font: cs.fontFamily.split(',')[0] })
      if (box.bottom > 984.5 && !el.closest('.chrome')) problems.push(`below y=984 (${box.bottom.toFixed(0)}): ${desc}`)
      if (box.right > 1792.5 && !el.closest('.labmap-label')) problems.push(`past right margin (${box.right.toFixed(0)}): ${desc}`)
      if (box.left < 127.5 && !el.closest('.labmap-label')) problems.push(`past left margin (${box.left.toFixed(0)}): ${desc}`)
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.overflowX !== 'visible') problems.push(`horizontal overflow: ${desc}`)
      if (el.scrollHeight > el.clientHeight + 1 && (cs.overflow === 'hidden' || cs.overflowY === 'hidden') && !el.closest('.roll') && !el.classList.contains('cover-line')) problems.push(`vertical clip: ${desc}`)
      if (fs < 24 && !el.closest('.chrome')) problems.push(`type under 24px (${fs}): ${desc}`)
      // the brief sets tables, footnotes, the limits note and the work list at 26px; everything else in Inter is 28px+
      if (fs < 26 && cs.fontFamily.includes('Inter') && !el.closest('.chrome')) problems.push(`Inter body under 26px (${fs}): ${desc}`)
      if (fs < 28 && fs >= 26 && cs.fontFamily.includes('Inter') && !el.closest('.table, .footnote, .next-limits, .next-list')) problems.push(`Inter body under 28px (${fs}): ${desc}`)
    }
    // nowrap elements that overflow their own box
    if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 1) problems.push(`nowrap overflow: ${desc}`)
    // boxes: panel/box
    if (el.classList.contains('box')) {
      const inner = el.scrollHeight > el.clientHeight + 1
      if (inner) problems.push(`box content taller than box: ${desc}`)
    }
  }
  // label vs connector crossing on the lab map
  const map = root.querySelector('.labmap')
  if (map) {
    const mr = map.getBoundingClientRect()
    const lines = Array.from(map.querySelectorAll('line')).map((l) => ({
      x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'), own: null,
    }))
    const labels = Array.from(map.querySelectorAll('.labmap-label'))
    labels.forEach((lab, idx) => {
      const r = lab.getBoundingClientRect()
      const b = { l: (r.left - mr.left) / scale, t: (r.top - mr.top) / scale, r: (r.right - mr.left) / scale, b: (r.bottom - mr.top) / scale }
      lines.forEach((ln, li) => {
        if (li === idx) return // its own connector
        // sample the segment
        for (let t = 0; t <= 1; t += 0.01) {
          const x = ln.x1 + (ln.x2 - ln.x1) * t
          const y = ln.y1 + (ln.y2 - ln.y1) * t
          if (x > b.l && x < b.r && y > b.t && y < b.b) {
            problems.push(`label crosses connector ${li}: "${lab.textContent}"`)
            break
          }
        }
      })
      // own connector: the label (possibly rotated, so use perpendicular distance from its centre) must sit off its line
      const ln = lines[idx]
      if (ln) {
        const cx = (b.l + b.r) / 2
        const cy = (b.t + b.b) / 2
        const dx = ln.x2 - ln.x1
        const dy = ln.y2 - ln.y1
        const dist = Math.abs(dy * cx - dx * cy + ln.x2 * ln.y1 - ln.y2 * ln.x1) / Math.hypot(dx, dy)
        if (dist < 14) problems.push(`label sits on its own connector (${dist.toFixed(0)}px): "${lab.textContent}"`)
      }
      // host boxes
      map.querySelectorAll('.labmap-host').forEach((h) => {
        const hr = h.getBoundingClientRect()
        const hb = { l: (hr.left - mr.left) / scale, t: (hr.top - mr.top) / scale, r: (hr.right - mr.left) / scale, b: (hr.bottom - mr.top) / scale }
        if (b.l < hb.r && b.r > hb.l && b.t < hb.b && b.b > hb.t) problems.push(`label overlaps host box: "${lab.textContent}"`)
      })
    })
  }
  return { problems, textish, scale }
}

// ---- contrast ----
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const lum = ([r, g, b]) => {
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a, b) => {
  const [l1, l2] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
const TOKENS = { bg: '#0B0F14', panel: '#121923', text: '#ECE9E2', muted: '#8A96A3', accent: '#FF7A1A', pass: '#3DDC97', fail: '#FF4D4D' }
const rgbToHex = (rgb) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb)
  return m ? '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('') : rgb
}

async function shots(browser) {
  console.log('\n== screenshots + geometry audit ==')
  mkdirSync(outDir, { recursive: true })
  const summary = []
  const seenColors = new Map()
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    page.on('pageerror', (e) => fail(`page error: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') fail(`console error: ${m.text()}`) })
    for (let i = 0; i < SLIDES.length; i++) {
      const [id, frags] = SLIDES[i]
      await page.goto(`${BASE}/#/${i + 1}/${frags}`)
      await page.waitForSelector(`.slide-root[data-slide="${id}"]`)
      await page.evaluate(() => document.fonts.ready)
      // long enough for the strip run (4 x 600ms), the typewriter and the map dot
      await sleep(id === 'built' || id === 'proof' ? 5200 : 1800)
      const file = resolve(outDir, `s${pad(i + 1)}-${id}-${w}.png`)
      await page.screenshot({ path: file })
      const audit = await page.evaluate(AUDIT)
      if (audit.error) { fail(`${id}@${w}: ${audit.error}`); continue }
      for (const t of audit.textish) {
        const key = `${rgbToHex(t.color)} ${t.fs}px ${t.font}`
        seenColors.set(key, (seenColors.get(key) ?? 0) + 1)
      }
      if (audit.problems.length) {
        audit.problems.forEach((p) => fail(`${id}@${w}: ${p}`))
      } else ok(`${id}@${w}: no geometry problems (${file})`)
      summary.push({ id, w, problems: audit.problems })
    }
    await page.close()
  }
  console.log('\n-- text color / size combinations seen --')
  for (const [k, n] of [...seenColors.entries()].sort()) {
    const [color, fs] = k.split(' ')
    const px = parseFloat(fs)
    const minRatio = px >= 44 ? 3 : 4.5
    const vsBg = contrast(color.toUpperCase(), TOKENS.bg)
    const vsPanel = contrast(color.toUpperCase(), TOKENS.panel)
    const worst = Math.min(vsBg, vsPanel)
    const known = Object.values(TOKENS).map((c) => c.toLowerCase()).includes(color.toLowerCase())
    const line = `${k}  x${n}  contrast vs bg ${vsBg.toFixed(2)} / panel ${vsPanel.toFixed(2)}`
    if (!known) fail(`non-token text color: ${line}`)
    else if (color.toLowerCase() === TOKENS.bg.toLowerCase()) ok(`${line} (bg on accent fill: ${contrast(TOKENS.bg, TOKENS.accent).toFixed(2)})`)
    else check(worst >= minRatio, line)
  }
  writeFileSync(resolve(outDir, 'audit.json'), JSON.stringify(summary, null, 2))
}

async function drive(browser) {
  console.log('\n== keyboard drive ==')
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => fail(`page error: ${e.message}`))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('.slide-root')
  const hash = () => page.evaluate(() => location.hash)
  check((await hash()) === '#/1/0', `initial hash ${await hash()}`)

  // next through every fragment and slide
  const total = SLIDES.reduce((n, [, f]) => n + f + 1, 0)
  const seq = []
  for (let k = 0; k < total - 1; k++) {
    await page.keyboard.press(k % 4 === 0 ? 'ArrowRight' : k % 4 === 1 ? 'Space' : k % 4 === 2 ? 'PageDown' : 'n')
    await sleep(40)
    seq.push(await hash())
  }
  const expected = []
  SLIDES.forEach(([, f], i) => { for (let j = 0; j <= f; j++) expected.push(`#/${i + 1}/${j}`) })
  expected.shift()
  check(JSON.stringify(seq) === JSON.stringify(expected), `forward walk visits every fragment in order (${seq.length} steps, ends ${seq.at(-1)})`)
  await page.keyboard.press('ArrowRight')
  check((await hash()) === '#/13/0', 'next on the last slide stays put')

  // back to the start
  for (let k = 0; k < total - 1; k++) {
    await page.keyboard.press(k % 3 === 0 ? 'ArrowLeft' : k % 3 === 1 ? 'PageUp' : 'p')
    await sleep(30)
  }
  check((await hash()) === '#/1/0', `backward walk returns to #/1/0 (${await hash()})`)
  await page.keyboard.press('ArrowLeft')
  check((await hash()) === '#/1/0', 'previous on the first slide stays put')

  // Home / End
  await page.keyboard.press('End'); await sleep(50)
  check((await hash()) === '#/13/0', 'End -> last')
  await page.keyboard.press('Home'); await sleep(50)
  check((await hash()) === '#/1/0', 'Home -> first')

  // digits + Enter
  await page.keyboard.type('7'); await sleep(30)
  check(await page.locator('.jump-buffer').isVisible(), 'jump buffer shows while typing digits')
  await page.keyboard.press('Enter'); await sleep(50)
  check((await hash()) === '#/7/0', `7 Enter -> #/7/0 (${await hash()})`)
  await page.keyboard.type('11'); await page.keyboard.press('Enter'); await sleep(50)
  check((await hash()) === '#/11/0', `11 Enter -> #/11/0 (${await hash()})`)
  await page.keyboard.type('99'); await page.keyboard.press('Enter'); await sleep(50)
  check((await hash()) === '#/13/0', `99 Enter clamps to #/13/0 (${await hash()})`)

  // reload lands on the same place, including a fragment
  await page.goto(`${BASE}/#/6/0`); await page.waitForSelector('.slide-root[data-slide="lessons"]')
  await page.keyboard.press('ArrowRight'); await sleep(50)
  check((await hash()) === '#/6/1', 'advance to #/6/1')
  await page.reload(); await page.waitForSelector('.slide-root[data-slide="lessons"]'); await sleep(300)
  check((await hash()) === '#/6/1', `reload keeps #/6/1 (${await hash()})`)
  const vis = await page.evaluate(() => getComputedStyle(document.querySelector('.bottom-line')).visibility)
  check(vis === 'visible', 'fragment shown after reload')

  // backward hides fragment without animation
  await page.keyboard.press('ArrowLeft'); await sleep(20)
  const visAfter = await page.evaluate(() => getComputedStyle(document.querySelector('.bottom-line')).visibility)
  check(visAfter === 'hidden', 'backward hides the fragment immediately')

  // Esc overview, click one
  await page.keyboard.press('Escape'); await sleep(200)
  check(await page.locator('.overview').isVisible(), 'Esc opens the overview')
  check((await page.locator('.overview-cell').count()) === 13, 'overview shows 13 slides')
  await page.locator('.overview-cell').nth(2).click(); await sleep(200)
  check(!(await page.locator('.overview').isVisible()), 'clicking a cell closes the overview')
  check((await hash()) === '#/3/0', `overview click jumps to #/3/0 (${await hash()})`)

  // ? help
  await page.keyboard.press('?'); await sleep(100)
  check(await page.locator('.help').isVisible(), '? opens help')
  await page.keyboard.press('Escape'); await sleep(100)
  check(!(await page.locator('.help').isVisible()), 'Esc closes help')

  // B black
  await page.keyboard.press('b'); await sleep(50)
  check(await page.locator('.black-screen').isVisible(), 'B shows black')
  await page.screenshot({ path: resolve(outDir, 'x-black.png') })
  await page.keyboard.press('B'); await sleep(50)
  check(!(await page.locator('.black-screen').isVisible()), 'B again restores')

  // F fullscreen: requestFullscreen needs a user gesture; check the call is made
  await page.evaluate(() => {
    window.__fsCalls = 0
    document.documentElement.requestFullscreen = async () => { window.__fsCalls++ }
  })
  await page.keyboard.press('f'); await sleep(50)
  check((await page.evaluate(() => window.__fsCalls)) === 1, 'F calls requestFullscreen')

  // click halves
  await page.goto(`${BASE}/#/4/0`); await page.waitForSelector('.slide-root[data-slide="built"]'); await sleep(100)
  await page.mouse.click(1500, 540); await sleep(50)
  check((await hash()) === '#/4/1', `click right half -> next (${await hash()})`)
  await page.mouse.click(300, 540); await sleep(50)
  check((await hash()) === '#/4/0', `click left half -> previous (${await hash()})`)

  // overview screenshot and help screenshot
  await page.keyboard.press('Escape'); await sleep(600)
  await page.screenshot({ path: resolve(outDir, 'x-overview.png') })
  await page.keyboard.press('Escape'); await page.keyboard.press('?'); await sleep(300)
  await page.screenshot({ path: resolve(outDir, 'x-help.png') })
  await page.keyboard.press('Escape')

  // S opens the presenter window
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.keyboard.press('s')])
  await popup.waitForLoadState()
  check(popup.url().includes('?presenter'), `S opened ${popup.url()}`)
  await popup.waitForSelector('.presenter-notes-text'); await sleep(300)
  check((await popup.evaluate(() => location.hash)) === (await hash()), 'presenter opens at the main window position')
  await popup.close()
  await ctx.close()

  console.log('\n== presenter sync ==')
  // fresh windows: nothing has advanced yet, so the timer must be idle
  const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const main = await ctx2.newPage()
  main.on('pageerror', (e) => fail(`page error: ${e.message}`))
  await main.goto(`${BASE}/#/1/0`); await main.waitForSelector('.slide-root[data-slide="cover"]')
  const [pres] = await Promise.all([ctx2.waitForEvent('page'), main.keyboard.press('s')])
  await pres.waitForLoadState()
  await pres.setViewportSize({ width: 1400, height: 900 })
  await pres.waitForSelector('.presenter-notes-text'); await sleep(400)
  const mhash = () => main.evaluate(() => location.hash)
  const phash = () => pres.evaluate(() => location.hash)
  check((await phash()) === '#/1/0', `presenter starts at #/1/0 (${await phash()})`)
  const t0 = await pres.locator('.presenter-clock').innerText()
  check(t0 === '0:00', `timer idle before first advance (${t0})`)
  await main.bringToFront()
  await main.keyboard.press('ArrowRight'); await sleep(300)
  check((await phash()) === '#/2/0', `presenter follows next (${await phash()})`)
  await sleep(1600)
  const t1 = await pres.locator('.presenter-clock').innerText()
  check(t1 !== '0:00', `timer runs after first advance (${t1})`)
  const notes = await pres.locator('.presenter-notes-text').innerText()
  check(notes.startsWith('0:15 to 0:45.'), 'presenter shows the notes of the current slide')
  const notesPx = await pres.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.presenter-notes-text')).fontSize))
  check(notesPx >= 28, `notes font size ${notesPx}px >= 28`)
  check((await pres.locator('.presenter-window').innerText()) === '0:15 to 0:45', 'time window shown')
  // presenter drives main
  await pres.bringToFront()
  await pres.keyboard.press('ArrowRight'); await sleep(300)
  check((await mhash()) === '#/2/1', `presenter drives main (${await mhash()})`)
  await main.bringToFront()
  await main.keyboard.press('ArrowLeft'); await sleep(300)
  check((await phash()) === '#/2/0', `main drives presenter back (${await phash()})`)
  // orange when past the window: push a startedAt two minutes in the past over the channel
  await pres.evaluate(() => {
    const ch = new BroadcastChannel('deck')
    ch.postMessage({ type: 'state', slide: 1, fragment: 0, startedAt: Date.now() - 120000, direction: 1 })
    ch.close()
  })
  await sleep(600)
  const overAttr = await pres.locator('.presenter-clock').getAttribute('data-over')
  const clockColor = await pres.evaluate(() => getComputedStyle(document.querySelector('.presenter-clock')).color)
  check(overAttr === 'true' && rgbToHex(clockColor).toUpperCase() === TOKENS.accent, `timer turns orange past the window (${rgbToHex(clockColor)})`)
  check((await pres.locator('.presenter-status').innerText()).startsWith('OVER'), 'status also says the word')
  await pres.screenshot({ path: resolve(outDir, 'x-presenter.png') })
  await ctx2.close()

  console.log('\n== print view ==')
  const pp = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  pp.on('pageerror', (e) => fail(`page error: ${e.message}`))
  await pp.goto(`${BASE}/?print`)
  await pp.waitForSelector('.print-page'); await sleep(800)
  const pages = await pp.evaluate(() => Array.from(document.querySelectorAll('.print-page')).map((p) => { const r = p.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  check(pages.length === 13, `print renders ${pages.length} pages`)
  check(pages.every(([w, h]) => w === 1920 && h === 1080), 'every page is 1920 x 1080')
  const pageRule = await pp.evaluate(() => Array.from(document.styleSheets).some((s) => { try { return Array.from(s.cssRules).some((r) => r instanceof CSSPageRule && /1920px 1080px/.test(r.style.size || r.cssText)) } catch { return false } }))
  check(pageRule, '@page { size: 1920px 1080px; margin: 0 } present')
  const fragsShown = await pp.evaluate(() => Array.from(document.querySelectorAll('.print-page .bottom-line, .print-page .next-item')).every((e) => getComputedStyle(e).visibility === 'visible'))
  check(fragsShown, 'all fragments shown in print')
  const animating = await pp.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
  check(animating === 0, `no running animations in print (${animating})`)
  const litDots = await pp.evaluate(() => document.querySelectorAll('.print-page .strip-node[data-state="pass"]').length)
  check(litDots >= 5, `pipeline strips fully lit in print (${litDots} pass nodes)`)
  await pp.emulateMedia({ media: 'print' })
  await pp.pdf({ path: resolve(outDir, 'x-print.pdf'), width: '1920px', height: '1080px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true })
  ok('print PDF written to verify/x-print.pdf')
  await pp.screenshot({ path: resolve(outDir, 'x-print-top.png') })
  await pp.close()

  console.log('\n== reduced motion ==')
  const rm = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const rp = await rm.newPage()
  await rp.goto(`${BASE}/#/4/1`); await rp.waitForSelector('.slide-root[data-slide="built"]'); await sleep(150)
  const rmLit = await rp.evaluate(() => document.querySelectorAll('.strip-node[data-state="pass"]').length)
  check(rmLit === 4, `reduced motion: strip lit instantly (${rmLit}/4)`)
  await rp.goto(`${BASE}/#/5/1`); await rp.waitForSelector('.slide-root[data-slide="proof"]'); await sleep(150)
  const typed = await rp.locator('.tw-live').innerText()
  check(typed.startsWith('[PASS] Found 1 alert(s)'), 'reduced motion: typewriter shows full text instantly')
  await rm.close()
}

/** Mid-animation frames of the signature elements, to eyeball the motion itself. */
async function motion(browser) {
  console.log('\n== motion frames ==')
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const frame = async (url, waitFor, ms, name) => {
    await page.goto(url)
    await page.waitForSelector(waitFor)
    await sleep(ms)
    await page.screenshot({ path: resolve(outDir, `m-${name}.png`) })
    ok(`frame ${name} at ${ms}ms`)
  }
  await frame(`${BASE}/#/1/0`, '.slide-root[data-slide="cover"]', 350, 'cover-drawing')
  await frame(`${BASE}/#/4/1`, '.slide-root[data-slide="built"]', 1500, 'labmap-dot-leg1')
  await frame(`${BASE}/#/4/1`, '.slide-root[data-slide="built"]', 2700, 'labmap-dot-leg2-strip')
  await frame(`${BASE}/#/5/0`, '.slide-root[data-slide="proof"]', 1400, 'typewriter-mid')
  // rolling number: land on fragment 0 then advance so the roll plays
  await page.goto(`${BASE}/#/3/0`)
  await page.waitForSelector('.slide-root[data-slide="problem"]')
  await sleep(900)
  await page.keyboard.press('ArrowRight')
  await sleep(300)
  await page.screenshot({ path: resolve(outDir, 'm-rolling-mid.png') })
  ok('frame rolling-mid at 300ms after advance')
  await page.close()
}

const server = await createServer({ root, server: { port: PORT, host: '127.0.0.1', strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
try {
  if (mode === 'shots' || mode === 'all') await shots(browser)
  if (mode === 'drive' || mode === 'all') await drive(browser)
  if (mode === 'motion' || mode === 'all') await motion(browser)
} finally {
  await browser.close()
  await server.close()
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
