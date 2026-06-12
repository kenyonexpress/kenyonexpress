/** Minimal carousel for RevSlider DOM cloned from refs/ke_live_singlefile.html */

function mergeStyle(el: HTMLElement, extra: Record<string, string>) {
  const prev = el.getAttribute('style') ?? ''
  const parts = prev
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const key = s.split(':')[0]?.trim().toLowerCase()
      return !Object.keys(extra).some((k) => k.toLowerCase() === key)
    })
  for (const [k, v] of Object.entries(extra)) {
    const cssKey = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    parts.push(`${cssKey}:${v}`)
  }
  el.setAttribute('style', `${parts.join(';')};`)
}

export function initHeroExactRevSlider(root: HTMLElement) {
  const wrap = root.querySelector<HTMLElement>('#rev_slider_6_1_wrapper')
  const slides = [...root.querySelectorAll<HTMLElement>('rs-slide')]
  const bullets = [...root.querySelectorAll<HTMLElement>('rs-bullet')]
  if (!wrap || slides.length === 0) return undefined

  mergeStyle(wrap, { visibility: 'visible', display: 'block' })

  let active = slides.findIndex(
    (s) => s.getAttribute('data-isactiveslide') === 'true' || s.dataset.isactiveslide === 'true',
  )
  if (active < 0) active = 0

  const show = (index: number) => {
    active = index
    slides.forEach((slide, i) => {
      const on = i === active
      mergeStyle(slide, {
        opacity: on ? '1' : '0',
        visibility: on ? 'inherit' : 'hidden',
        zIndex: on ? '20' : '1',
        pointerEvents: on ? 'auto' : 'none',
      })
      slide.setAttribute('data-isactiveslide', on ? 'true' : 'false')
    })
    bullets.forEach((b, i) => {
      b.classList.toggle('selected', i === active)
    })
  }

  bullets.forEach((b, i) => {
    b.style.cursor = 'pointer'
    b.addEventListener('click', () => show(i))
  })

  show(active)

  let timer = window.setInterval(() => show((active + 1) % slides.length), 5000)
  wrap.addEventListener('mouseenter', () => window.clearInterval(timer))
  wrap.addEventListener('mouseleave', () => {
    timer = window.setInterval(() => show((active + 1) % slides.length), 5000)
  })

  return () => window.clearInterval(timer)
}
