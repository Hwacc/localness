import { ocrLayout, type Rect } from './ocrMargins'

/** A clipped region cropped to its text with even margins, as lossless PNG. */
export function ocrImageFrom(canvas: HTMLCanvasElement) {
  const pixels = canvas
    .getContext('2d')
    ?.getImageData(0, 0, canvas.width, canvas.height)
  if (!pixels) return canvas.toDataURL('image/png')
  const { crop, padding, background } = ocrLayout(pixels)
  const out = document.createElement('canvas')
  out.width = crop.width + padding * 2
  out.height = crop.height + padding * 2
  const ctx = out.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')
  ctx.fillStyle = `rgb(${background.join(',')})`
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(
    canvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    padding,
    padding,
    crop.width,
    crop.height
  )
  return out.toDataURL('image/png')
}

/**
 * The same OCR crop read straight from an image URL, for pages that have no
 * editor (and so no clipping worker) loaded.
 */
export async function clipUrlForOcr(url: string, rect: Rect) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Image HTTP ${response.status}`)
  const bitmap = await createImageBitmap(
    await response.blob(),
    Math.round(rect.x),
    Math.round(rect.y),
    Math.max(1, Math.round(rect.width)),
    Math.max(1, Math.round(rect.height))
  )
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ocrImageFrom(canvas)
}
