// Renders a 1080×1350 "spotted card" image for Instagram/WhatsApp/etc.

import type { Species } from './species'

interface CardInput {
  species: Species
  method: 'photo' | 'sound'
  ts: number
  photo?: Blob
  userName?: string
  speciesCount: number
}

const W = 1080
const H = 1350

// Palette: parchment, sand, olive, sage, bark, olivewood
const C = {
  parchment: '#f3efe3',
  sand: '#dcd2bf',
  olive: '#c5ceb0',
  sage: '#959b7f',
  bark: '#6f6853',
  wood: '#33352a',
}

const SERIF = '"Cormorant Garamond", Georgia, serif'
const SANS = 'Jost, "Segoe UI", system-ui, sans-serif'

// Same line-art bird as the app's icon set (24×24 coordinates).
const BIRD_PATHS = [
  'M4 15c0-4.5 3.5-8 8-8 2.2 0 4 1.2 5 3l3 .5-2.6 1.6C17 16 14 19 9.5 19 6.5 19 4 17.5 4 15Z',
  'M7.5 14.5c2 .2 4-.6 5.5-2.5',
  'M9.5 19 9 21.5M12 18.7l.3 2.8',
]

function loadImage(src: string, cors = false): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
      if (lines.length === maxLines) break
    } else line = test
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1]
    while (ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last.trimEnd()}…`
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`
}

export async function renderShareCard(input: CardInput): Promise<Blob> {
  const { species, method, ts, photo, userName, speciesCount } = input
  await Promise.all([
    document.fonts.load(`600 80px ${SERIF}`),
    document.fonts.load(`italic 500 40px ${SERIF}`),
    document.fonts.load(`500 30px ${SANS}`),
  ]).catch(() => {})

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = C.wood
  ctx.fillRect(0, 0, W, H)

  // Image panel
  const px = 60
  const py = 60
  const pw = W - 120
  const ph = 700
  ctx.save()
  roundRect(ctx, px, py, pw, ph, 18)
  ctx.clip()
  let img: HTMLImageElement | null = null
  if (photo) img = await loadImage(URL.createObjectURL(photo))
  else if (species.i && navigator.onLine) img = await loadImage(species.i, true)
  if (img) {
    const scale = Math.max(pw / img.width, ph / img.height)
    const iw = img.width * scale
    const ih = img.height * scale
    ctx.drawImage(img, px + (pw - iw) / 2, py + (ph - ih) / 2, iw, ih)
  } else {
    ctx.fillStyle = C.olive
    ctx.fillRect(px, py, pw, ph)
    ctx.save()
    ctx.translate(W / 2 - 180, py + ph / 2 - 190)
    ctx.scale(15, 15)
    ctx.strokeStyle = C.wood
    ctx.lineWidth = 0.9
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const d of BIRD_PATHS) ctx.stroke(new Path2D(d))
    ctx.restore()
  }
  ctx.restore()

  // Badge
  ctx.font = `500 26px ${SANS}`
  spaced(ctx, 5)
  const badge = method === 'sound' ? 'HEARD' : 'SPOTTED'
  const bw = ctx.measureText(badge).width + 56
  roundRect(ctx, px + 28, py + 28, bw, 60, 30)
  ctx.fillStyle = C.parchment
  ctx.fill()
  ctx.fillStyle = C.wood
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(badge, px + 56, py + 59)
  spaced(ctx, 0)

  // Name
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.parchment
  ctx.font = `600 88px ${SERIF}`
  const nameLines = wrap(ctx, species.c, W - 120, 2)
  let y = py + ph + 105
  for (const l of nameLines) {
    ctx.fillText(l, 60, y)
    y += 86
  }
  ctx.font = `italic 500 40px ${SERIF}`
  ctx.fillStyle = C.olive
  ctx.fillText(species.s, 62, y - 30)
  y += 24

  // Fact
  if (species.f) {
    ctx.strokeStyle = C.sage
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(60, y)
    ctx.lineTo(W - 60, y)
    ctx.stroke()
    ctx.font = `400 33px ${SANS}`
    ctx.fillStyle = C.sand
    const lines = wrap(ctx, species.f, W - 120, 3)
    lines.forEach((l, i) => ctx.fillText(l, 60, y + 60 + i * 46))
  }

  // Footer
  ctx.fillStyle = C.sage
  ctx.font = `500 26px ${SANS}`
  spaced(ctx, 3)
  const when = new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const who = userName ? `${userName}'s ${ordinal(speciesCount)} species` : `Species no. ${speciesCount}`
  ctx.fillText(`${who}  /  ${when}`.toUpperCase(), 60, H - 62)
  spaced(ctx, 0)
  ctx.textAlign = 'right'
  ctx.fillStyle = C.parchment
  ctx.font = `600 52px ${SERIF}`
  ctx.fillText('peep', W - 60, H - 56)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render failed'))), 'image/png'),
  )
}

/** Opens the native share sheet (Instagram, WhatsApp…) or falls back to a download. */
export async function shareImage(blob: Blob, title: string, text: string) {
  const file = new File([blob], `${title.replace(/\W+/g, '-').toLowerCase()}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return 'downloaded'
}
