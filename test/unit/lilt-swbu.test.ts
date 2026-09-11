import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildSourceFilename,
  liltBatchSortKey,
  parseLiltFilename,
  parseSeenFiles,
  readMergedSourceLocale,
  seenFileMap,
  validateFlatJson,
} from '#server/libs/git-sync/lilt-swbu'

describe('parseSeenFiles', () => {
  it('reads the current { path, sha } shape', () => {
    expect(parseSeenFiles([{ path: 'a.json', sha: 'x' }])).toEqual([
      { path: 'a.json', sha: 'x' },
    ])
  })

  it('still reads the legacy string[] shape', () => {
    expect(parseSeenFiles(['a.json'])).toEqual([{ path: 'a.json', sha: '' }])
  })

  it('de-duplicates by path, last entry winning', () => {
    const out = parseSeenFiles([
      { path: 'a.json', sha: 'old' },
      { path: 'a.json', sha: 'new' },
    ])
    expect(out).toEqual([{ path: 'a.json', sha: 'new' }])
  })

  it('drops junk instead of throwing', () => {
    expect(parseSeenFiles(null)).toEqual([])
    expect(parseSeenFiles('nope')).toEqual([])
    expect(parseSeenFiles([1, '', null, { sha: 'no path' }])).toEqual([])
  })

  it('exposes a path -> sha map', () => {
    expect(seenFileMap([{ path: 'a.json', sha: 'x' }]).get('a.json')).toBe('x')
  })
})

describe('parseLiltFilename', () => {
  it('splits date, batch id and remote locale', () => {
    expect(parseLiltFilename('20260101-batch7_en-US.json')).toEqual({
      date: '20260101',
      batchId: 'batch7',
      remoteLocale: 'en-US',
    })
  })

  it('rejects names that are not LILT batches', () => {
    expect(parseLiltFilename('README.md')).toBeNull()
    expect(parseLiltFilename('en-US.json')).toBeNull()
  })
})

describe('buildSourceFilename', () => {
  it('produces a parseable name for the source locale', () => {
    const name = buildSourceFilename('en-US')
    const parsed = parseLiltFilename(name)
    expect(parsed?.remoteLocale).toBe('en-US')
    expect(parsed?.date).toMatch(/^\d{8}$/)
  })

  it('does not collide across calls in the same second', () => {
    expect(buildSourceFilename('en-US')).not.toBe(buildSourceFilename('en-US'))
  })
})

describe('liltBatchSortKey', () => {
  it('lets a same-day Localness push win over a connector uuid batch', () => {
    const connector = liltBatchSortKey(
      '20260910',
      '5dbd3ccd8d999fc715de9a79'
    )
    const localness = liltBatchSortKey('20260910', '081602-664e0100fdf39b8d')
    expect(localness > connector).toBe(true)
  })

  it('still orders two Localness batches by time', () => {
    const earlier = liltBatchSortKey('20260910', '081602-aa')
    const later = liltBatchSortKey('20260910', '090000-bb')
    expect(later > earlier).toBe(true)
  })

  it('still orders by calendar date first', () => {
    const prev = liltBatchSortKey('20260909', '230000-ff')
    const next = liltBatchSortKey('20260910', '000001-aa')
    expect(next > prev).toBe(true)
  })
})

describe('readMergedSourceLocale', () => {
  it('keeps keys from older batches when a later file is incremental', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lilt-merge-'))
    try {
      const src = join(root, 'cortex', 'source')
      await mkdir(src, { recursive: true })
      await writeFile(
        join(src, '20260910-5dbd3ccd8d999fc715de9a79_en-US.json'),
        JSON.stringify({
          cortex_mobile_title: 'KEEP FROM OLD BATCH',
          other_key: 'still here',
        })
      )
      await writeFile(
        join(src, '20260910-184000-incprobe_en-US.json'),
        JSON.stringify({
          localness_inc_merge_probe: 'NEW ONLY',
        })
      )
      const merged = await readMergedSourceLocale(root, 'cortex', 'en')
      expect(merged.get('cortex_mobile_title')).toBe('KEEP FROM OLD BATCH')
      expect(merged.get('other_key')).toBe('still here')
      expect(merged.get('localness_inc_merge_probe')).toBe('NEW ONLY')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('validateFlatJson', () => {
  it('accepts a flat string map', () => {
    expect(validateFlatJson({ a: 'x' })).toEqual({ a: 'x' })
  })

  it('rejects arrays, nulls and nested values', () => {
    expect(() => validateFlatJson([])).toThrow()
    expect(() => validateFlatJson(null)).toThrow()
    expect(() => validateFlatJson({ a: { b: 'x' } })).toThrow()
  })
})
