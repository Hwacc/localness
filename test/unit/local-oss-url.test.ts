import { describe, expect, it } from 'vitest'
import { localOssPublicPath } from '#shared/utils/file'

describe('localOssPublicPath', () => {
  it('defaults empty or missing base to /upload/', () => {
    expect(localOssPublicPath('e6e7b048-62ee-40fa-ae61-588affeb2654.png')).toBe(
      '/upload/e6e7b048-62ee-40fa-ae61-588affeb2654.png'
    )
    expect(localOssPublicPath('shot.png', '')).toBe('/upload/shot.png')
    expect(localOssPublicPath('shot.png', '   ')).toBe('/upload/shot.png')
  })

  it('joins a configured base with a trailing slash', () => {
    expect(localOssPublicPath('shot.png', '/upload')).toBe('/upload/shot.png')
    expect(localOssPublicPath('shot.png', '/upload/')).toBe('/upload/shot.png')
  })

  it('uses only the filename when the stored value has a path', () => {
    expect(localOssPublicPath('/runtime/uploads/shot.png', '/upload/')).toBe(
      '/upload/shot.png'
    )
  })
})
