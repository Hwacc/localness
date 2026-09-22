import { describe, expect, it } from 'vitest'
import { fpTranslation } from '#shared/utils'
import {
  classifyOriginBackfill,
  fingerprintOf,
} from '../../scripts/migrate-origin-to-source-locale'

describe('classifyOriginBackfill', () => {
  it('backfills a key whose source language is blank', () => {
    expect(
      classifyOriginBackfill({ origin: 'Save', sourceDraft: null })
    ).toBe('backfill')
    expect(
      classifyOriginBackfill({ origin: 'Save', sourceDraft: '   ' })
    ).toBe('backfill')
  })

  it('leaves a key whose two sides already agree', () => {
    expect(
      classifyOriginBackfill({ origin: 'Save', sourceDraft: 'Save' })
    ).toBe('keep')
  })

  it('ignores whitespace differences when calling two texts the same', () => {
    expect(
      classifyOriginBackfill({ origin: ' Save\n', sourceDraft: 'Save ' })
    ).toBe('keep')
  })

  it('reports a divergence and never overwrites the locale text', () => {
    expect(
      classifyOriginBackfill({ origin: 'Welcome', sourceDraft: 'Welcome123' })
    ).toBe('diverged')
  })

  it('has nothing to carry for a key with no original text', () => {
    expect(
      classifyOriginBackfill({ origin: '  ', sourceDraft: 'unrelated' })
    ).toBe('empty-origin')
    expect(
      classifyOriginBackfill({ origin: '', sourceDraft: null })
    ).toBe('empty-origin')
  })
})

describe('fingerprintOf', () => {
  /*
   * The script recomputes fingerprints in raw SQL land, without the Prisma client
   * or the app's imports — so what matters is that it agrees with the function the
   * API has been writing with all along.
   */
  it('agrees with fpTranslation', () => {
    expect(fingerprintOf('Save')).toBe(fpTranslation('Save'))
    expect(fingerprintOf(' Save\nAs ')).toBe(fpTranslation(' Save\nAs '))
    expect(fingerprintOf('保存')).toBe(fpTranslation('保存'))
  })

  it('treats whitespace-only differences as the same text', () => {
    expect(fingerprintOf(' Save ')).toBe(fingerprintOf('Save'))
    expect(fingerprintOf('Save\nAs')).toBe(fingerprintOf('SaveAs'))
  })
})
