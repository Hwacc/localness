import { describe, expect, it } from 'vitest'
import {
  allRules,
  describeLint,
  describeMismatch,
  highlightSegments,
  ruleCopy,
} from '#shared/utils/consistency'

describe('report explanations', () => {
  it('ships a label and a hint for every registered rule', () => {
    for (const rule of allRules) {
      expect(ruleCopy[rule.id]?.label, rule.id).toBeTruthy()
      expect(ruleCopy[rule.id]?.hint, rule.id).toBeTruthy()
    }
  })

  it('says what is extra and what is missing, in the rule\'s own noun', () => {
    expect(
      describeMismatch('numbers', {
        locale: 'ja',
        missing: [],
        extra: ['1'],
        text: '',
        spans: [],
        sourceSpans: [],
      })
    ).toBe('Has a number the source doesn\'t: "1"')
    expect(
      describeMismatch('placeholders', {
        locale: 'ja',
        missing: ['{name}', '%s'],
        extra: ['{n}'],
        text: '',
        spans: [],
        sourceSpans: [],
      })
    ).toBe(
      'Has a placeholder the source doesn\'t: "{n}" · Missing 2 placeholders from the source: "{name}", "%s"'
    )
  })

  it('names the terminal punctuation classes', () => {
    expect(
      describeLint(
        'lint.terminal-punct',
        { locale: 'ja', excerpt: '(missing)', text: '', spans: [] },
        { sourceClass: 'question' }
      )
    ).toBe(
      'Source ends with a question mark; this translation has no ending punctuation'
    )
  })

  it('splits text into highlighted runs', () => {
    expect(highlightSegments('a 1 b 2', [[6, 7], [2, 3]])).toEqual([
      { text: 'a ', hit: false },
      { text: '1', hit: true },
      { text: ' b ', hit: false },
      { text: '2', hit: true },
    ])
    expect(highlightSegments('abc', [])).toEqual([{ text: 'abc', hit: false }])
  })
})
