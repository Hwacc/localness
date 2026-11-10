import { describe, expect, it } from 'vitest'
import { resolveProjectLink } from '#shared/utils/project-link'

const projects = [{ id: 1 }, { id: 2 }]

describe('resolveProjectLink', () => {
  it('does nothing without a usable param', () => {
    expect(resolveProjectLink(undefined, projects, 1)).toEqual({ kind: 'none' })
    expect(resolveProjectLink('  ', projects, 1)).toEqual({ kind: 'none' })
    expect(resolveProjectLink(null, projects, 1)).toEqual({ kind: 'none' })
  })

  it('stays when the project is already current', () => {
    expect(resolveProjectLink('1', projects, 1)).toEqual({ kind: 'stay' })
  })

  it('switches to a visible project', () => {
    expect(resolveProjectLink('2', projects, 1)).toEqual({
      kind: 'switch',
      project: { id: 2 },
    })
  })

  it('takes the first of a repeated param', () => {
    expect(resolveProjectLink(['2', '1'], projects, 1)).toEqual({
      kind: 'switch',
      project: { id: 2 },
    })
  })

  it('reports an unknown or foreign id as unavailable', () => {
    expect(resolveProjectLink('99', projects, 1)).toEqual({
      kind: 'unavailable',
      requested: '99',
    })
    expect(resolveProjectLink('abc', projects, 1)).toEqual({
      kind: 'unavailable',
      requested: 'abc',
    })
  })
})
