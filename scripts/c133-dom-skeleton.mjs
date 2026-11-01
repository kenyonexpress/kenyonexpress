import fs from 'node:fs'
import { chromium } from '@playwright/test'
const url = process.argv[2]
const tag = process.argv[3]
const skel = () => {
  const out = []
  const walk = (n, d) => {
    for (const c of n.children) {
      if (['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE'].includes(c.tagName)) continue
      out.push(
        ' '.repeat(d) +
          c.tagName.toLowerCase() +
          (c.id ? `#${c.id}` : '') +
          (typeof c.className === 'string' && c.className
            ? `.${c.className.trim().split(/\s+/).slice(0, 3).join('.')}`
            : '') +
          (c.hidden ? ' [hidden]' : ''),
      )
      walk(c, d + 1)
    }
  }
  walk(document.body, 0)
  return out.join('\n')
}
const b = await chromium.launch()
const c1 = await b.newContext({ javaScriptEnabled: false })
const p1 = await c1.newPage()
await p1.goto(url, { waitUntil: 'load' })
fs.writeFileSync(`/tmp/c133/skel-ssr-${tag}.txt`, await p1.evaluate(skel))
const c2 = await b.newContext()
const p2 = await c2.newPage()
await p2.goto(url, { waitUntil: 'networkidle' })
await p2.waitForTimeout(800)
fs.writeFileSync(`/tmp/c133/skel-csr-${tag}.txt`, await p2.evaluate(skel))
await b.close()
