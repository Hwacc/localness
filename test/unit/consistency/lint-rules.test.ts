import { describe, expect, it } from 'vitest'
import { lintEllipsisRule } from '#shared/utils/consistency/rules/lint-ellipsis'
import { lintDoubleSpaceRule } from '#shared/utils/consistency/rules/lint-double-space'
import { lintCjkSpacingRule } from '#shared/utils/consistency/rules/lint-cjk-spacing'
import { lintTerminalPunctRule } from '#shared/utils/consistency/rules/lint-terminal-punct'
import { lintFrenchSpacingRule } from '#shared/utils/consistency/rules/lint-french-spacing'
import { ctx, key, published } from './helpers'

const withJa = (en: string, ja: string) =>
  key({
    sourceText: en,
    locales: [published('en', en), published('ja', ja)],
  })

describe('lint.ellipsis', () => {
  it('flags three ASCII dots in any published text', () => {
    const findings = lintEllipsisRule.detect(
      ctx([withJa('Loading...', '読み込み中...')])
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.meta?.issues).toMatchObject([
      { locale: 'en', excerpt: '...' },
      { locale: 'ja', excerpt: '...' },
    ])
  })

  it('accepts the single-character ellipsis', () => {
    expect(
      lintEllipsisRule.detect(ctx([withJa('Loading…', '読み込み中…')]))
    ).toHaveLength(0)
  })

  it('stays silent when the switch is off', () => {
    expect(
      lintEllipsisRule.detect(
        ctx([withJa('Loading...', 'x')], {
          lintRules: { 'lint.ellipsis': false },
        })
      )
    ).toHaveLength(0)
  })
})

describe('lint.double-space', () => {
  it('flags doubled spaces', () => {
    const findings = lintDoubleSpaceRule.detect(
      ctx([withJa('Save  changes', '変更を保存')])
    )
    expect(findings[0]!.meta?.issues).toMatchObject([
      { locale: 'en', excerpt: '  ' },
    ])
  })
})

describe('lint.cjk-spacing', () => {
  const withZh = (en: string, zh: string) =>
    key({
      sourceText: en,
      locales: [published('en', en), published('zh-CN', zh)],
    })

  it('flags CJK glued to latin in Chinese', () => {
    const findings = lintCjkSpacingRule.detect(
      ctx([withZh('Open settings', '打开Wi-Fi设置')])
    )
    expect(findings[0]!.meta?.issues).toMatchObject([
      { locale: 'zh-CN', excerpt: '开W' },
    ])
  })

  it('accepts a space between scripts', () => {
    expect(
      lintCjkSpacingRule.detect(ctx([withZh('Open settings', '打开 Wi-Fi 设置')]))
    ).toHaveLength(0)
  })

  it('leaves Japanese alone — no-space is the ja convention', () => {
    expect(
      lintCjkSpacingRule.detect(ctx([withJa('3 items', '3件のWi-Fi接続')]))
    ).toHaveLength(0)
  })
})

describe('lint.terminal-punct', () => {
  it('accepts full-width vs ASCII periods as the same class', () => {
    expect(
      lintTerminalPunctRule.detect(
        ctx([withJa('Delete account.', 'アカウントを削除。')])
      )
    ).toHaveLength(0)
  })

  it('flags disagreeing classes', () => {
    const findings = lintTerminalPunctRule.detect(
      ctx([withJa('Delete account?', 'アカウントを削除。')])
    )
    expect(findings[0]!.meta).toMatchObject({ sourceClass: 'question' })
    expect(findings[0]!.meta?.issues).toMatchObject([
      { locale: 'ja', excerpt: 'period' },
    ])
  })

  it('flags a zh/ja target dropping the terminal', () => {
    const findings = lintTerminalPunctRule.detect(
      ctx([withJa('Delete account.', 'アカウントを削除')])
    )
    expect(findings[0]!.meta?.issues).toMatchObject([
      { locale: 'ja', excerpt: '(missing)' },
    ])
  })

  it('does not force a terminal on latin targets', () => {
    expect(
      lintTerminalPunctRule.detect(
        ctx([
          key({
            sourceText: 'Delete account.',
            locales: [
              published('en', 'Delete account.'),
              published('de', 'Konto löschen'),
            ],
          }),
        ])
      )
    ).toHaveLength(0)
  })

  it('skips sources without a terminal', () => {
    expect(
      lintTerminalPunctRule.detect(ctx([withJa('Save', '保存。')]))
    ).toHaveLength(0)
  })
})

describe('lint.french-spacing', () => {
  const fr = (text: string) =>
    key({
      sourceText: 'Really?',
      locales: [published('en', 'Really?'), published('fr', text)],
    })

  it('flags a plain space before !', () => {
    const findings = lintFrenchSpacingRule.detect(ctx([fr('Vraiment !')]))
    expect(findings[0]!.meta?.issues).toMatchObject([
      { locale: 'fr', excerpt: ' !' },
    ])
  })

  it('accepts the narrow no-break space', () => {
    // U+202F, written as a JS escape so the source stays plain ASCII.
    expect(
      lintFrenchSpacingRule.detect(ctx([fr('Vraiment !')]))
    ).toHaveLength(0)
  })

  it('applies to fr only', () => {
    expect(
      lintFrenchSpacingRule.detect(
        ctx([
          key({
            sourceText: 'Really?',
            locales: [published('en', 'Really !')],
          }),
        ])
      )
    ).toHaveLength(0)
  })
})
