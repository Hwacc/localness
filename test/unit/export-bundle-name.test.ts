import { describe, expect, it } from 'vitest'
import { exportBundleName } from '#shared/utils/file'

describe('exportBundleName', () => {
  it('is just the project when no release is being viewed', () => {
    expect(exportBundleName({ projectName: 'Localness' })).toBe('Localness')
    expect(
      exportBundleName({ projectName: 'Localness', releaseName: null })
    ).toBe('Localness')
    expect(
      exportBundleName({ projectName: 'Localness', releaseName: '' })
    ).toBe('Localness')
  })

  it('appends the release, which is the point of it', () => {
    // Otherwise two exports of one project land as `…zip` and `… (1).zip`.
    expect(
      exportBundleName({ projectName: 'Localness', releaseName: 'v2' })
    ).toBe('Localness - v2')
  })

  it('replaces characters a filesystem rejects', () => {
    expect(
      exportBundleName({ projectName: 'Localness', releaseName: 'v2/beta' })
    ).toBe('Localness - v2 beta')
    expect(
      exportBundleName({ projectName: 'a:b', releaseName: 'c*d?e' })
    ).toBe('a b - c d e')
  })

  it('collapses whitespace and trims the ends', () => {
    expect(
      exportBundleName({ projectName: '  My   Project  ', releaseName: ' v2 ' })
    ).toBe('My Project - v2')
  })

  it('falls back when the project name has nothing usable left', () => {
    expect(exportBundleName({ projectName: '///' })).toBe('export')
  })

  it('keeps a release whose name sanitizes to nothing out of the name', () => {
    expect(
      exportBundleName({ projectName: 'Localness', releaseName: '///' })
    ).toBe('Localness')
  })
})
