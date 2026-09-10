import { describe, expect, it } from 'vitest'
import { decideThreeWay } from '#server/libs/git-sync/three-way'

describe('decideThreeWay', () => {
  it('aligns when both sides already agree', () => {
    expect(decideThreeWay('a', 'b', 'b')).toBe('align')
    expect(decideThreeWay(null, '', '')).toBe('align')
  })

  it('takes Git when only Git moved', () => {
    expect(decideThreeWay('a', 'a', 'b')).toBe('apply-theirs')
  })

  it('keeps the platform draft when only we moved', () => {
    expect(decideThreeWay('a', 'b', 'a')).toBe('keep-ours')
  })

  it('conflicts when both sides moved apart', () => {
    expect(decideThreeWay('a', 'b', 'c')).toBe('conflict')
  })

  it('treats a missing base as an empty string', () => {
    // New key on both sides with different text is a real conflict.
    expect(decideThreeWay(null, 'b', 'c')).toBe('conflict')
    // New only on the Git side.
    expect(decideThreeWay(null, null, 'c')).toBe('apply-theirs')
  })
})
