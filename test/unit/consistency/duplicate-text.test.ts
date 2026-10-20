import { describe, expect, it } from 'vitest'
import { scanSourceText } from '#shared/utils/consistency'
import { duplicateTextRule } from '#shared/utils/consistency/rules/duplicate-text'
import { ctx, key, published } from './helpers'

const detect = (keys: Parameters<typeof ctx>[0]) =>
  duplicateTextRule.detect(ctx(keys))

describe('duplicate-text rule', () => {
  it('groups two keys holding the same sentence as exact', () => {
    const findings = detect([
      key({ sourceText: 'Save' }),
      key({ sourceText: 'Save' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.severity).toBe('warning')
    expect(findings[0]!.meta).toEqual({ internal: 'exact' })
    expect(findings[0]!.keys).toHaveLength(2)
  })

  it('treats whitespace-only differences as exact', () => {
    const findings = detect([
      key({ sourceText: 'Sign in' }),
      key({ sourceText: 'Sign\n  in' }),
    ])
    expect(findings[0]!.meta).toEqual({ internal: 'exact' })
  })

  it('treats case and punctuation differences as near', () => {
    const findings = detect([
      key({ sourceText: 'Save' }),
      key({ sourceText: 'save' }),
      key({ sourceText: 'Cancel' }),
      key({ sourceText: 'cancel.' }),
    ])
    expect(findings).toHaveLength(2)
    expect(findings.every((f) => f.meta?.internal === 'near')).toBe(true)
    expect(findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('keeps symbols: C++ and C must not merge', () => {
    expect(
      detect([key({ sourceText: 'C++' }), key({ sourceText: 'C' })])
    ).toHaveLength(0)
  })

  it('skips empty and fully-punctuation source texts', () => {
    expect(
      detect([
        key({ sourceText: '' }),
        key({ sourceText: '   ' }),
        key({ sourceText: '!!!' }),
        key({ sourceText: '???' }),
      ])
    ).toHaveLength(0)
  })

  it('drops single-member buckets', () => {
    expect(
      detect([key({ sourceText: 'Save' }), key({ sourceText: 'Cancel' })])
    ).toHaveLength(0)
  })

  it('sorts exact groups before near, then by size', () => {
    const findings = detect([
      key({ sourceText: 'Alpha' }),
      key({ sourceText: 'alpha' }),
      key({ sourceText: 'Same' }),
      key({ sourceText: 'Same' }),
      key({ sourceText: 'Same' }),
    ])
    expect(findings[0]!.meta?.internal).toBe('exact')
    expect(findings[0]!.keys).toHaveLength(3)
    expect(findings[1]!.meta?.internal).toBe('near')
  })

  it('gives a stable groupId for the same normalized text', () => {
    const first = detect([
      key({ sourceText: 'Save' }),
      key({ sourceText: 'Save' }),
    ])
    const second = detect([
      key({ sourceText: 'save!' }),
      key({ sourceText: 'SAVE' }),
    ])
    expect(first[0]!.groupId).toBe(second[0]!.groupId)
  })

  it('escalates an exact group to error when published translations diverge (R1)', () => {
    const findings = detect([
      key({
        sourceText: 'Save',
        locales: [published('en', 'Save'), published('ja', '保存')],
      }),
      key({
        sourceText: 'Save',
        locales: [published('en', 'Save'), published('ja', 'セーブ')],
      }),
    ])
    expect(findings[0]!.severity).toBe('error')
    expect(findings[0]!.meta).toMatchObject({
      internal: 'exact',
      diverged: ['ja'],
    })
  })

  it('keeps a near group at warning when translations diverge (R1)', () => {
    const findings = detect([
      key({
        sourceText: 'OK',
        locales: [published('en', 'OK'), published('ja', 'OK')],
      }),
      key({
        sourceText: 'ok.',
        locales: [published('en', 'ok.'), published('ja', 'オーケー')],
      }),
    ])
    expect(findings[0]!.severity).toBe('warning')
    expect(findings[0]!.meta).toMatchObject({
      internal: 'near',
      diverged: ['ja'],
    })
  })

  it('ignores diverged drafts — published-only (2026-10-19)', () => {
    const findings = detect([
      key({
        sourceText: 'Save',
        locales: [
          { locale: 'en', draftText: 'Save', publishedText: 'Save' },
          { locale: 'ja', draftText: '保存', publishedText: null },
        ],
      }),
      key({
        sourceText: 'Save',
        locales: [
          { locale: 'en', draftText: 'Save', publishedText: 'Save' },
          { locale: 'ja', draftText: 'セーブ', publishedText: '保存' },
        ],
      }),
    ])
    expect(findings[0]!.severity).toBe('warning')
    expect(findings[0]!.meta?.diverged).toBeUndefined()
  })
})

describe('scanSourceText', () => {
  const draft = (text: string) => ({ locale: 'en', draftText: text, publishedText: null })

  it('uses the published source and surfaces an unpublished edit', () => {
    expect(
      scanSourceText(
        [{ locale: 'en', draftText: 'Save file', publishedText: 'Save' }],
        'en'
      )
    ).toEqual({ sourceText: 'Save', pendingSourceText: 'Save file' })
  })

  it('falls back to the draft for a never-published key', () => {
    expect(scanSourceText([draft('Save')], 'en')).toEqual({ sourceText: 'Save' })
  })

  it('reports no pending edit when draft and published agree', () => {
    expect(scanSourceText([published('en', 'Save')], 'en')).toEqual({
      sourceText: 'Save',
    })
  })

  it('groups on the live wording, not a pending edit', () => {
    const live = key({
      ...scanSourceText(
        [{ locale: 'en', draftText: 'Cancel', publishedText: 'Save' }],
        'en'
      ),
    })
    const findings = detect([live, key({ sourceText: 'Save' })])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.keys.find((m) => m.keyId === live.keyId)).toMatchObject({
      sourceText: 'Save',
      pendingSourceText: 'Cancel',
    })
  })
})
