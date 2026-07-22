import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
await mkdir('_qa/ui', { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
const errors = []
page.on('pageerror', error => errors.push(error.stack || String(error)))
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text())
})

const loadProduct = async (url = 'http://127.0.0.1:5198/') => {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__ORBITAL_TRAFFIC__?.flightCount > 0, null, { timeout: 30000 })
}

await loadProduct()
await page.waitForTimeout(1900)
await page.screenshot({ path: '_qa/ui/playwright-ghost.png' })
await page.waitForTimeout(3600)
const idle = await page.evaluate(() => ({
  viewport: [innerWidth, innerHeight],
  debug: window.__ORBITAL_TRAFFIC__,
  bootError: window.__ORBITAL_TRAFFIC_ERROR__ || null,
  hintText: document.querySelector('.ot-hint')?.innerText,
  title: document.querySelector('.ot-title')?.innerText,
  datGuiHidden: getComputedStyle(document.querySelector('.dg.ac')).display === 'none'
}))
await page.screenshot({ path: '_qa/ui/playwright-mobile.png' })

await page.mouse.move(250, 430)
await page.mouse.down()
await page.mouse.move(95, 320, { steps: 16 })
await page.mouse.up()
await page.waitForTimeout(350)
const rotated = await page.evaluate(() => window.__ORBITAL_TRAFFIC__)

await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: 165, y: 430, radiusX: 4, radiusY: 4, force: 1, id: 31 },
    { x: 225, y: 430, radiusX: 4, radiusY: 4, force: 1, id: 32 }
  ]
})
await page.waitForTimeout(1100)
const frozen = await page.evaluate(() => window.__ORBITAL_TRAFFIC__)
await page.screenshot({ path: '_qa/ui/playwright-frozen.png' })
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await page.waitForTimeout(150)
const released = await page.evaluate(() => window.__ORBITAL_TRAFFIC__)
await page.waitForTimeout(2000)
const recovered = await page.evaluate(() => window.__ORBITAL_TRAFFIC__)

await page.setViewportSize({ width: 320, height: 568 })
await loadProduct()
await page.waitForTimeout(5200)
const compact = await page.evaluate(() => window.__ORBITAL_TRAFFIC__)
await page.screenshot({ path: '_qa/ui/playwright-320x568.png' })

await page.setViewportSize({ width: 1440, height: 900 })
await loadProduct()
await page.waitForTimeout(5200)
const desktop = await page.evaluate(() => window.__ORBITAL_TRAFFIC__)
await page.screenshot({ path: '_qa/ui/playwright-1440x900.png' })

await page.goto('http://127.0.0.1:5198/?baseline=1', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForFunction(() => window.__ORBITAL_TRAFFIC__?.flightCount > 0, null, { timeout: 60000 })
await page.waitForTimeout(4200)
const baseline = await page.evaluate(() => ({
  debug: window.__ORBITAL_TRAFFIC__,
  productUiHidden: getComputedStyle(document.querySelector('.ot-ui')).display === 'none',
  datGuiVisible: getComputedStyle(document.querySelector('.dg.ac')).display !== 'none'
}))
await page.screenshot({ path: '_qa/ui/playwright-baseline.png' })

await page.goto('http://127.0.0.1:5198/?forceError=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(250)
const errorState = await page.evaluate(() => ({
  hidden: document.querySelector('.ot-error').hidden,
  text: document.querySelector('.ot-error').innerText,
  debug: window.__ORBITAL_TRAFFIC__
}))
await page.screenshot({ path: '_qa/ui/playwright-error.png' })

const report = { idle, rotated, frozen, released, recovered, compact, desktop, baseline, errorState, errors }
await writeFile('_qa/ui/playwright-state.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
await browser.close()
