import { describe, expect, it } from 'vitest'
import { placeholdersRule } from '#shared/utils/consistency/rules/placeholders'
import { numbersRule } from '#shared/utils/consistency/rules/numbers'
import { urlsEmailsRule } from '#shared/utils/consistency/rules/urls-emails'
import { htmlTagsRule } from '#shared/utils/consistency/rules/html-tags'
import { ctx, key, published } from './helpers'

describe('placeholders rule', () => {
  const detect = (keys: Parameters<typeof ctx>[0]) =>
    placeholdersRule.detect(ctx(keys))

  it('accepts translations carrying the same placeholder family', () => {
    expect(
      detect([
        key({
          sourceText: 'Hi {name}, you have %d msgs',
          locales: [
            published('en', 'Hi {name}, you have %d msgs'),
            published('ja', 'こんにちは {name}、%d 件'),
          ],
        }),
      ])
    ).toHaveLength(0)
  })

  it('flags a renamed placeholder with missing and extra tokens', () => {
    const findings = detect([
      key({
        sourceText: 'Hi {name}',
        locales: [
          published('en', 'Hi {name}'),
          published('ja', 'こんにちは {n}'),
        ],
      }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]!.severity).toBe('error')
    expect(findings[0]!.meta).toMatchObject({
      issues: [{ locale: 'ja', missing: ['{name}'], extra: ['{n}'] }],
    })
  })

  it('handles double-brace and positional printf forms', () => {
    const findings = detect([
      key({
        sourceText: 'Hello {{user}}, %1$s',
        locales: [
          published('en', 'Hello {{user}}, %1$s'),
          published('de', 'Hallo {{user}}'),
        ],
      }),
    ])
    expect(findings[0]!.meta).toMatchObject({
      issues: [{ locale: 'de', missing: ['%1$s'], extra: [] }],
    })
  })

  it('keeps placeholder case — {Name} and {name} are different variables', () => {
    const findings = detect([
      key({
        sourceText: 'Hi {name}',
        locales: [published('en', 'Hi {name}'), published('ja', 'やあ {Name}')],
      }),
    ])
    expect(findings[0]!.meta).toMatchObject({
      issues: [{ locale: 'ja', missing: ['{name}'], extra: ['{Name}'] }],
    })
  })

  it('changes the whitelist id when any checked translation changes', () => {
    const base = {
      keyId: 900,
      sourceText: 'Hi {name}',
    }
    const before = detect([
      key({
        ...base,
        locales: [
          published('en', 'Hi {name}'),
          published('ja', 'やあ {n}'),
          published('fr', 'Salut {name}'),
        ],
      }),
    ])
    const after = detect([
      key({
        ...base,
        locales: [
          published('en', 'Hi {name}'),
          published('ja', 'やあ {n}'),
          published('fr', 'Salut {nom}'),
        ],
      }),
    ])
    expect(before[0]!.groupId).not.toBe(after[0]!.groupId)
  })

  it('skips keys whose source is not published', () => {
    expect(
      detect([
        key({
          sourceText: 'Hi {name}',
          locales: [{ locale: 'ja', draftText: 'x', publishedText: 'x' }],
        }),
      ])
    ).toHaveLength(0)
  })

  it('ignores draft-only mismatches — published-only (2026-10-19)', () => {
    expect(
      detect([
        key({
          sourceText: 'Hi {name}',
          locales: [
            published('en', 'Hi {name}'),
            { locale: 'ja', draftText: 'Hi {n}', publishedText: 'こんにちは {name}' },
          ],
        }),
      ])
    ).toHaveLength(0)
  })
})

describe('numbers rule', () => {
  const detect = (keys: Parameters<typeof ctx>[0]) =>
    numbersRule.detect(ctx(keys))

  it('accepts reordered-but-equal digit multisets', () => {
    expect(
      detect([
        key({
          sourceText: '3 of 5 done',
          locales: [
            published('en', '3 of 5 done'),
            published('ja', '5 件中 3 件完了'),
          ],
        }),
      ])
    ).toHaveLength(0)
  })

  it('flags a dropped number', () => {
    const findings = detect([
      key({
        sourceText: '5 items left',
        locales: [published('en', '5 items left'), published('ja', '残り項目')],
      }),
    ])
    expect(findings[0]!.meta).toMatchObject({
      issues: [{ locale: 'ja', missing: ['5'], extra: [] }],
    })
  })

  it('does not count digits inside placeholders or URLs', () => {
    expect(
      detect([
        key({
          sourceText: 'Step %1$s of https://x.com/a1',
          locales: [
            published('en', 'Step %1$s of https://x.com/a1'),
            published('ja', '%1$s のステップ https://x.com/a1'),
          ],
        }),
      ])
    ).toHaveLength(0)
  })

  it('ignores digits inside snake_case identifiers (key names)', () => {
    expect(
      detect([
        key({
          sourceText: 'Manually update Cortex:',
          locales: [
            published('en', 'Manually update Cortex:'),
            published('ja', '[LN-TEST] cortex_ready_to_update_desc_1: Cortex を更新'),
          ],
        }),
      ])
    ).toHaveLength(0)
  })

  it('skips a digit-free source — words written as digits are localization', () => {
    expect(
      detect([
        key({
          sourceText: 'January',
          locales: [published('en', 'January'), published('zh_cn', '1月')],
        }),
      ])
    ).toHaveLength(0)
  })

  it('quotes both texts and marks the offending tokens', () => {
    const findings = detect([
      key({
        sourceText: 'Retry 3 times',
        locales: [published('en', 'Retry 3 times'), published('ja', '2 回再試行')],
      }),
    ])
    expect(findings[0]!.meta).toMatchObject({
      source: 'Retry 3 times',
      issues: [
        {
          locale: 'ja',
          missing: ['3'],
          extra: ['2'],
          text: '2 回再試行',
          spans: [[0, 1]],
          sourceSpans: [[6, 7]],
        },
      ],
    })
  })

  it('treats locale group/decimal separators as the same number', () => {
    expect(
      detect([
        key({
          sourceText: 'Up to 1,000 files of 1.5 MB',
          locales: [
            published('en', 'Up to 1,000 files of 1.5 MB'),
            published('de', 'Bis zu 1.000 Dateien à 1,5 MB'),
            published('fr', "Jusqu'à 1\u202f000 fichiers de 1,5 Mo"),
            published('es', 'Hasta 1 000 archivos de 1,5 MB'),
          ],
        }),
      ])
    ).toHaveLength(0)
  })

  it('still flags a changed number behind the separators', () => {
    const findings = detect([
      key({
        sourceText: '1,000 left',
        locales: [published('en', '1,000 left'), published('de', '1.500 übrig')],
      }),
    ])
    expect(findings[0]!.meta).toMatchObject({
      issues: [{ locale: 'de', missing: ['1,000'], extra: ['1.500'] }],
    })
  })
})

describe('urls-emails rule', () => {
  const detect = (keys: Parameters<typeof ctx>[0]) =>
    urlsEmailsRule.detect(ctx(keys))

  it('flags a lost URL', () => {
    const findings = detect([
      key({
        sourceText: 'See https://help.example.com/x',
        locales: [published('en', 'See https://help.example.com/x'), published('ja', '参照') ],
      }),
    ])
    expect(findings[0]!.meta).toMatchObject({
      issues: [
        {
          locale: 'ja',
          missing: ['https://help.example.com/x'],
          extra: [],
        },
      ],
    })
  })

  it('passes emails through untouched', () => {
    expect(
      detect([
        key({
          sourceText: 'Mail support@example.com now',
          locales: [
            published('en', 'Mail support@example.com now'),
            published('de', 'Mail support@example.com jetzt'),
          ],
        }),
      ])
    ).toHaveLength(0)
  })
})

describe('html-tags rule', () => {
  const detect = (keys: Parameters<typeof ctx>[0]) =>
    htmlTagsRule.detect(ctx(keys))

  it('accepts the same tag multiset regardless of order', () => {
    expect(
      detect([
        key({
          sourceText: '<b>Bold</b> and <i>italic</i>',
          locales: [
            published('en', '<b>Bold</b> and <i>italic</i>'),
            published('ja', '<i>斜体</i>と<b>太字</b>'),
          ],
        }),
      ])
    ).toHaveLength(0)
  })

  it('flags a dropped tag by name', () => {
    const findings = detect([
      key({
        sourceText: '<b>Bold</b>',
        locales: [published('en', '<b>Bold</b>'), published('ja', '太字')],
      }),
    ])
    expect(findings[0]!.meta).toMatchObject({
      issues: [{ locale: 'ja', missing: ['<b>', '</b>'], extra: [] }],
    })
  })
})
