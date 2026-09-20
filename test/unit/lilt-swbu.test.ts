import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildSourceFilename,
  liltBatchId,
  liltBatchInstant,
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

  it('accepts production LILT names without a time segment', () => {
    expect(
      parseLiltFilename('20260910-5dbd3ccd8d999fc715de9a79_en-US.json')
    ).toEqual({
      date: '20260910',
      batchId: '5dbd3ccd8d999fc715de9a79',
      remoteLocale: 'en-US',
    })
  })

  it('rejects names that are not LILT batches', () => {
    expect(parseLiltFilename('README.md')).toBeNull()
    expect(parseLiltFilename('en-US.json')).toBeNull()
  })
})

describe('buildSourceFilename', () => {
  it('matches LILT `<YYYYMMDD>-<batch id>_<source locale>.json`', () => {
    const now = new Date(Date.UTC(2026, 8, 10, 8, 37, 2))
    const name = buildSourceFilename('en-US', now)
    expect(name).toMatch(/^20260910-[0-9a-f]{24}_en-US\.json$/)
    expect(name).not.toMatch(/^\d{8}-\d{6}-/)
    const parsed = parseLiltFilename(name)
    expect(parsed).toEqual({
      date: '20260910',
      batchId: name.slice('20260910-'.length, -'_en-US.json'.length),
      remoteLocale: 'en-US',
    })
    expect(parsed?.batchId).toHaveLength(24)
  })

  it('does not collide across calls in the same second', () => {
    const now = new Date(Date.UTC(2026, 8, 10, 8, 37, 2))
    expect(buildSourceFilename('en-US', now)).not.toBe(
      buildSourceFilename('en-US', now)
    )
  })
})

describe('liltBatchInstant', () => {
  it('treats an older production source id as opaque (embedded day ≠ filename day)', () => {
    expect(
      liltBatchInstant('20260910', '5dbd3ccd8d999fc715de9a79')
    ).toBeNull()
  })

  it('reads unix seconds from a same-day 24-hex ObjectId', () => {
    const at = new Date(Date.UTC(2026, 8, 10, 8, 37, 2))
    const id = liltBatchId(at)
    expect(liltBatchInstant('20260910', id)).toBe(
      Math.floor(at.getTime() / 1000)
    )
  })

  it('reads unix seconds from a legacy HHMMSS-hex id', () => {
    expect(liltBatchInstant('20260910', '083702-aa')).toBe(
      Math.floor(Date.UTC(2026, 8, 10, 8, 37, 2) / 1000)
    )
  })
})

describe('liltBatchSortKey', () => {
  it('lets a same-day legacy Localness push win over an older production source batch', () => {
    const connector = liltBatchSortKey(
      '20260910',
      '5dbd3ccd8d999fc715de9a79'
    )
    const localness = liltBatchSortKey('20260910', '081602-664e0100fdf39b8d')
    expect(localness > connector).toBe(true)
  })

  it('lets a same-day 24-hex ObjectId sort after an opaque production source batch', () => {
    const connector = liltBatchSortKey(
      '20260910',
      '5dbd3ccd8d999fc715de9a79'
    )
    const localness = liltBatchSortKey(
      '20260910',
      liltBatchId(new Date(Date.UTC(2026, 8, 10, 8, 37, 2)))
    )
    expect(localness > connector).toBe(true)
  })

  it('still orders two Localness batches by time', () => {
    const earlier = liltBatchSortKey('20260910', '081602-aa')
    const later = liltBatchSortKey('20260910', '090000-bb')
    expect(later > earlier).toBe(true)
  })

  it('orders a later ObjectId after an earlier same-day legacy file', () => {
    const legacyMorning = liltBatchSortKey('20260910', '081602-aa')
    const objectIdAfternoon = liltBatchSortKey(
      '20260910',
      liltBatchId(new Date(Date.UTC(2026, 8, 10, 12, 0, 0)))
    )
    expect(objectIdAfternoon > legacyMorning).toBe(true)
  })

  it('orders two same-day ObjectId batches by their embedded seconds', () => {
    const early = liltBatchSortKey(
      '20260910',
      liltBatchId(new Date(Date.UTC(2026, 8, 10, 8, 37, 2)))
    )
    const late = liltBatchSortKey(
      '20260910',
      liltBatchId(new Date(Date.UTC(2026, 8, 10, 18, 40, 0)))
    )
    expect(late > early).toBe(true)
  })

  it('drops a prefix re-dated away from its embedded day to opaque', () => {
    const id = liltBatchId(new Date(Date.UTC(2026, 8, 8, 9, 0, 0)))
    expect(liltBatchInstant('20260910', id)).toBeNull()
    const redated = liltBatchSortKey('20260910', id)
    const sameDayPush = liltBatchSortKey(
      '20260910',
      liltBatchId(new Date(Date.UTC(2026, 8, 10, 8, 0, 0)))
    )
    expect(sameDayPush > redated).toBe(true)
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
