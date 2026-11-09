import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCAN_SETTINGS,
  gateTranslation,
} from '#shared/utils/consistency'

function gate(
  source: string,
  text: string,
  settings = DEFAULT_SCAN_SETTINGS
) {
  return gateTranslation(
    { source, sourceLocale: 'en', targetLocale: 'zh_cn', text },
    settings
  )
}

describe('gateTranslation', () => {
  it('passes a translation that keeps every token', () => {
    expect(gate('Delete {count} items?', '删除 {count} 项？')).toEqual({
      status: 'pass',
      text: '删除 {count} 项？',
    })
  })

  it('lets a placeholder move to where the target language needs it', () => {
    expect(gate('{name} sent {count} files', '{count} 个文件由 {name} 发送').status)
      .toBe('pass')
  })

  it('repairs a renamed placeholder one-for-one', () => {
    const result = gate('Hello {name}', '你好 {user}')

    expect(result).toEqual({
      status: 'fixed',
      text: '你好 {name}',
      original: '你好 {user}',
    })
  })

  it('fails on a dropped placeholder and keeps the text the model wrote', () => {
    const result = gate('Delete {count} items?', '删除项目？')

    expect(result.status).toBe('fail')
    if (result.status !== 'fail') return
    expect(result.text).toBe('删除项目？')
    expect(result.issues).toMatchObject([
      { ruleId: 'placeholders', missing: ['{count}'], extra: [] },
    ])
    expect(result.issues[0]!.message).toContain('{count}')
  })

  it('fails on a lost tag, a lost URL and a changed number, one issue each', () => {
    const result = gate(
      'Read <b>docs</b> at https://a.dev/x in 5 minutes',
      '请在 10 分钟内阅读文档'
    )

    expect(result.status).toBe('fail')
    if (result.status !== 'fail') return
    expect(result.issues.map((issue) => issue.ruleId).sort()).toEqual([
      'html-tags',
      'numbers',
      'urls-emails',
    ])
  })

  it('reads ICU branches in the project dialect without false alarms', () => {
    expect(
      gate(
        '{n, plural, one {# file} other {# files}} selected',
        '已选择 {n, plural, other {# 个文件}}'
      ).status
    ).toBe('pass')
  })

  it('does not block on style: spacing and punctuation are not gate rules', () => {
    expect(gate('Save changes.', '保存更改').status).toBe('pass')
  })

  it('treats blank text as nothing to check', () => {
    expect(gate('Hello {name}', '').status).toBe('pass')
    expect(gate('  ', 'anything').status).toBe('pass')
  })

  it('honours a rule the project switched off', () => {
    const settings = {
      ...DEFAULT_SCAN_SETTINGS,
      ruleSeverity: { placeholders: 'off' as const },
    }

    expect(gate('Delete {count} items?', '删除项目？', settings).status).toBe(
      'pass'
    )
  })
})
