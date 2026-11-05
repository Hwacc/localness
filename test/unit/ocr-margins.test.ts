import { describe, expect, it } from 'vitest'
import {
  backgroundOf,
  inkBounds,
  ocrLayout,
  type RGB,
} from '~~/app/core/ocrMargins'

function canvas(width: number, height: number, bg: RGB) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data.set([...bg, 255], i * 4)
  }
  const paint = (x: number, y: number, c: RGB) =>
    data.set([...c, 255], (y * width + x) * 4)
  return { px: { data, width, height }, paint }
}

const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]

describe('ocrMargins', () => {
  it('crops to the ink wherever the hand-drawn box left it', () => {
    // Text 4px from the top, 12px from the bottom — the uneven case.
    const { px, paint } = canvas(40, 30, WHITE)
    for (let x = 5; x < 35; x++) for (let y = 4; y < 18; y++) paint(x, y, BLACK)
    expect(inkBounds(px, WHITE)).toEqual({ x: 5, y: 4, width: 30, height: 14 })

    const { crop, padding, background } = ocrLayout(px)
    expect(crop).toEqual({ x: 5, y: 4, width: 30, height: 14 })
    expect(padding).toBe(12)
    expect(background).toEqual(WHITE)
  })

  it('tolerates JPEG-like noise in the background', () => {
    const { px, paint } = canvas(20, 10, [30, 30, 30])
    paint(0, 0, [36, 28, 33])
    paint(19, 9, [25, 34, 30])
    expect(backgroundOf(px).uniform).toBe(true)
    expect(inkBounds(px, backgroundOf(px).color)).toBeNull()
  })

  it('pads without cropping when the border has no single colour', () => {
    const { px, paint } = canvas(10, 10, WHITE)
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) {
      if ((x + y) % 2) paint(x, y, BLACK)
    }
    const layout = ocrLayout(px)
    expect(backgroundOf(px).uniform).toBe(false)
    expect(layout.crop).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('keeps a clip with no ink whole', () => {
    const { px } = canvas(8, 6, WHITE)
    expect(ocrLayout(px).crop).toEqual({ x: 0, y: 0, width: 8, height: 6 })
  })
})
