/**
 * Even margins for OCR. A tag box is drawn by hand, so the text in it sits
 * anywhere: PaddleOCR's detector then fits a box too tight to a line near an
 * edge, cuts the tops or tails off the glyphs, and recognition reads garbage.
 * Cropping to the text and padding every side the same fixes the geometry.
 */

export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type RGB = [number, number, number]

/** How far a channel may stray from the background before it counts as ink. */
const INK_TOLERANCE = 40
/** Share of the border the commonest colour must hold to be called the background. */
const UNIFORM_SHARE = 0.6

function pixel(px: Pixels, x: number, y: number): RGB {
  const i = (y * px.width + x) * 4
  return [px.data[i]!, px.data[i + 1]!, px.data[i + 2]!]
}

function borderPixels(px: Pixels): RGB[] {
  const out: RGB[] = []
  const { width: w, height: h } = px
  for (let x = 0; x < w; x++) {
    out.push(pixel(px, x, 0))
    if (h > 1) out.push(pixel(px, x, h - 1))
  }
  for (let y = 1; y < h - 1; y++) {
    out.push(pixel(px, 0, y))
    if (w > 1) out.push(pixel(px, w - 1, y))
  }
  return out
}

function mean(colors: RGB[]): RGB {
  const sum = colors.reduce<RGB>(
    (acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]],
    [0, 0, 0]
  )
  return sum.map((v) => Math.round(v / colors.length)) as RGB
}

/**
 * The commonest colour of the outermost ring, bucketed so JPEG noise in the
 * source still agrees with itself. `uniform` is false when no colour holds
 * most of the ring (a gradient or a photo behind the text); the colour is then
 * the ring's mean, good enough to pad with but not to crop by.
 */
export function backgroundOf(px: Pixels): { color: RGB; uniform: boolean } {
  const ring = borderPixels(px)
  if (ring.length === 0) return { color: [255, 255, 255], uniform: false }
  const buckets = new Map<number, RGB[]>()
  for (const c of ring) {
    const key = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4)
    const list = buckets.get(key)
    if (list) list.push(c)
    else buckets.set(key, [c])
  }
  let top: RGB[] = []
  for (const list of buckets.values()) if (list.length > top.length) top = list
  if (top.length / ring.length >= UNIFORM_SHARE) {
    return { color: mean(top), uniform: true }
  }
  return { color: mean(ring), uniform: false }
}

/** The smallest rect holding every pixel that differs from `bg`; null if none does. */
export function inkBounds(px: Pixels, bg: RGB): Rect | null {
  let minX = px.width
  let minY = px.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      const [r, g, b] = pixel(px, x, y)
      if (
        Math.abs(r - bg[0]) > INK_TOLERANCE ||
        Math.abs(g - bg[1]) > INK_TOLERANCE ||
        Math.abs(b - bg[2]) > INK_TOLERANCE
      ) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Padding on every side, scaled to the text so a heading gets more than a caption. */
export function ocrPadding(content: Rect) {
  return Math.min(32, Math.max(12, Math.round(content.height * 0.3)))
}

/**
 * Where to crop and how much to pad. A non-uniform background is not cropped
 * — ink could not be told from it — only padded; a clip with no ink at all is
 * left whole the same way.
 */
export function ocrLayout(px: Pixels) {
  const whole: Rect = { x: 0, y: 0, width: px.width, height: px.height }
  const bg = backgroundOf(px)
  const crop = (bg.uniform && inkBounds(px, bg.color)) || whole
  return { crop, padding: ocrPadding(crop), background: bg.color }
}
