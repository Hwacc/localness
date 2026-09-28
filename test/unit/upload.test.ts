import { describe, expect, it } from 'vitest'
import {
  assertUploadExtension,
  assertUploadSize,
  contentTypeForKey,
  uploadKind,
} from '#server/helper/upload'
import { IMAGE_MAX_BYTES, SKILL_MAX_BYTES } from '#shared/constants'
import { fileBaseName, fileExtension, uuidFilename } from '#shared/utils/file'
import { timestampFilename } from '#shared/utils'

function status(fn: () => unknown) {
  try {
    fn()
  } catch (error: any) {
    return error.statusCode
  }
  return null
}

describe('fileExtension', () => {
  it('reads the last dot, not the first', () => {
    expect(fileExtension('a.png')).toBe('png')
    expect(fileExtension('evil.html.png')).toBe('png')
    expect(fileExtension('evil.png.html')).toBe('html')
  })

  it('lowercases and tolerates missing extensions', () => {
    expect(fileExtension('A.PNG')).toBe('png')
    expect(fileExtension('README')).toBe('')
    expect(fileExtension('.gitignore')).toBe('')
    expect(fileExtension('trailing.')).toBe('')
  })

  it('ignores directory parts', () => {
    expect(fileExtension('skills/a.b/c.zip')).toBe('zip')
  })
})

describe('fileBaseName', () => {
  it('keeps inner dots', () => {
    expect(fileBaseName('my.photo.png')).toBe('my.photo')
    expect(fileBaseName('README')).toBe('README')
    expect(fileBaseName('.gitignore')).toBe('.gitignore')
  })
})

describe('generated names', () => {
  it('uuidFilename carries the real extension', () => {
    expect(uuidFilename('evil.html.png')).toMatch(/^[0-9a-f-]{36}\.png$/)
    expect(uuidFilename('noext')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('timestampFilename keeps the base intact', () => {
    const name = timestampFilename({ name: 'my.photo.png' } as File)
    expect(name).toMatch(/^my\.photo-\d+\.png$/)
  })
})

describe('uploadKind', () => {
  it('reads the skill prefix', () => {
    expect(uploadKind('skills/abc.zip')).toBe('skill')
    expect(uploadKind('')).toBe('image')
    expect(uploadKind('shot.png')).toBe('image')
  })
})

describe('assertUploadExtension', () => {
  it('accepts the image whitelist', () => {
    for (const name of ['a.png', 'a.JPG', 'a.jpeg', 'a.webp']) {
      expect(assertUploadExtension('image', name)).toBe(
        name.split('.').pop()!.toLowerCase()
      )
    }
  })

  /** The XSS chain: a renamed html file is now stored as the png it claims to be. */
  it('accepts evil.html.png and rejects evil.png.html', () => {
    expect(assertUploadExtension('image', 'evil.html.png')).toBe('png')
    expect(status(() => assertUploadExtension('image', 'evil.png.html'))).toBe(415)
  })

  it('rejects svg and extensionless names', () => {
    expect(status(() => assertUploadExtension('image', 'a.svg'))).toBe(415)
    expect(status(() => assertUploadExtension('image', 'noext'))).toBe(415)
  })

  it('keeps the two kinds separate', () => {
    expect(assertUploadExtension('skill', 'skills/a.zip')).toBe('zip')
    expect(status(() => assertUploadExtension('skill', 'a.png'))).toBe(415)
    expect(status(() => assertUploadExtension('image', 'a.zip'))).toBe(415)
  })
})

describe('assertUploadSize', () => {
  it('allows exactly the limit and refuses one byte more', () => {
    expect(status(() => assertUploadSize('image', IMAGE_MAX_BYTES))).toBeNull()
    expect(status(() => assertUploadSize('image', IMAGE_MAX_BYTES + 1))).toBe(413)
  })

  it('holds skills to the tighter limit', () => {
    expect(status(() => assertUploadSize('skill', SKILL_MAX_BYTES))).toBeNull()
    expect(status(() => assertUploadSize('skill', SKILL_MAX_BYTES + 1))).toBe(413)
    expect(SKILL_MAX_BYTES).toBeLessThan(IMAGE_MAX_BYTES)
  })
})

describe('contentTypeForKey', () => {
  it('renders images inline', () => {
    expect(contentTypeForKey('a.png')).toEqual({ type: 'image/png', inline: true })
    expect(contentTypeForKey('a.jpg').type).toBe('image/jpeg')
  })

  it('never renders a non-image inline', () => {
    expect(contentTypeForKey('skills/a.zip').inline).toBe(false)
    expect(contentTypeForKey('skills/a.md').inline).toBe(false)
  })

  it('does not guess at unknown extensions', () => {
    expect(contentTypeForKey('a.html')).toEqual({
      type: 'application/octet-stream',
      inline: false,
    })
    expect(contentTypeForKey('noext').type).toBe('application/octet-stream')
  })
})
