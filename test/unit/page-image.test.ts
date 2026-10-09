import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  images: [] as string[],
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    page: {
      count: async ({ where }: { where: { image: string } }) =>
        db.images.filter((image) => image === where.image).length,
    },
  },
}))

const { discardReplacedPageImage } = await import('#server/helper/page-image')

beforeEach(() => {
  db.images = []
})

describe('discardReplacedPageImage', () => {
  it('removes a screenshot no page still points at', async () => {
    const removed: string[] = []
    await discardReplacedPageImage(
      { removeItem: async (key) => void removed.push(key) },
      'old.png'
    )
    expect(removed).toEqual(['old.png'])
  })

  it('keeps a screenshot another page still uses', async () => {
    db.images = ['old.png']
    const removed: string[] = []
    await discardReplacedPageImage(
      { removeItem: async (key) => void removed.push(key) },
      'old.png'
    )
    expect(removed).toEqual([])
  })
})
