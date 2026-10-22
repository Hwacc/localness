import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitSyncFileFormat, GitSyncPullReason } from '#shared/constants'
import { blobSha } from '#server/libs/git-sync/engine/seen-files'
import {
  listLocaleFiles,
  localeFileName,
  localeFilesScopeError,
  parseLocaleFilesOptions,
  readLocaleFileMaps,
  readLocaleFileSource,
  unwritableSourceKeys,
  writeLocaleFileSource,
  type LocaleFilesContext,
} from '#server/libs/git-sync/layouts/locale-files/files'

describe('parseLocaleFilesOptions', () => {
  it('defaults to {locale}.json, nested', () => {
    expect(parseLocaleFilesOptions(null)).toEqual({
      pattern: '{locale}.json',
      format: GitSyncFileFormat.NESTED_JSON,
    })
  })

  it('keeps valid values', () => {
    expect(
      parseLocaleFilesOptions({ pattern: ' {locale}/app.json ', format: 'flat-json' })
    ).toEqual({ pattern: '{locale}/app.json', format: GitSyncFileFormat.FLAT_JSON })
  })
})

describe('localeFilesScopeError', () => {
  const ok = parseLocaleFilesOptions(null)

  it('accepts a relative directory', () => {
    expect(localeFilesScopeError('src/locales', ok)).toBeNull()
  })

  it('rejects escapes and absolute paths', () => {
    expect(localeFilesScopeError('../x', ok)).toMatch(/Directory/)
    expect(localeFilesScopeError('/abs', ok)).toMatch(/Directory/)
    expect(localeFilesScopeError('a//b', ok)).toMatch(/Directory/)
  })

  it('requires exactly one {locale} and a .json name', () => {
    const at = (pattern: string) =>
      localeFilesScopeError('locales', parseLocaleFilesOptions({ pattern }))
    expect(at('all.json')).toMatch(/exactly once/)
    expect(at('{locale}/{locale}.json')).toMatch(/exactly once/)
    expect(at('{locale}.yaml')).toMatch(/\.json/)
    expect(at('../{locale}.json')).toMatch(/relative path/)
    expect(at('{locale}/messages.json')).toBeNull()
  })
})

describe('localeFileName', () => {
  it('turns project codes into BCP 47 file names', () => {
    expect(localeFileName('zh_cn', null)).toBe('zh-CN')
    expect(localeFileName('en', null)).toBe('en')
  })

  it('lets an explicit map win', () => {
    expect(localeFileName('zh_cn', { zh_cn: 'zh-Hans' })).toBe('zh-Hans')
  })
})

describe('locale files on disk', () => {
  let repoRoot = ''
  const ctx = (overrides: Partial<LocaleFilesContext> = {}): LocaleFilesContext => ({
    repoRoot,
    dir: 'locales',
    options: parseLocaleFilesOptions(null),
    localeMap: null,
    locales: ['en', 'zh_cn', 'ja'],
    ...overrides,
  })

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'locale-files-'))
    await mkdir(join(repoRoot, 'locales'), { recursive: true })
    await writeFile(join(repoRoot, 'locales', 'en.json'), '{\n  "home": {\n    "title": "Home"\n  }\n}\n')
    await writeFile(join(repoRoot, 'locales', 'zh-CN.json'), '{"home":{"title":"首页"}}')
    await writeFile(join(repoRoot, 'locales', 'stray.json'), '{"x":"y"}')
  })

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  it('lists only project locales that have a file', async () => {
    const files = await listLocaleFiles(ctx())
    expect(files.map((f) => [f.relPath, f.locale, f.remoteLocale])).toEqual([
      ['locales/en.json', 'en', 'en'],
      ['locales/zh-CN.json', 'zh_cn', 'zh-CN'],
    ])
    expect(files.every((f) => f.reason === GitSyncPullReason.NEW_FILE)).toBe(true)
  })

  it('marks a file seen at the same sha as already seen', async () => {
    const sha = await blobSha(join(repoRoot, 'locales', 'en.json'))
    const files = await listLocaleFiles(ctx(), new Map([['locales/en.json', sha]]))
    expect(files.find((f) => f.locale === 'en')?.reason).not.toBe(
      GitSyncPullReason.NEW_FILE
    )
  })

  it('reads every file into per-locale maps with origins', async () => {
    const { maps, origin } = await readLocaleFileMaps(repoRoot, await listLocaleFiles(ctx()))
    expect(maps.get('zh_cn')?.get('home.title')).toBe('首页')
    expect(origin.get('en\0home.title')).toBe('locales/en.json')
  })

  it('skips an unreadable translation file instead of failing', async () => {
    await writeFile(join(repoRoot, 'locales', 'zh-CN.json'), '{broken')
    const { maps } = await readLocaleFileMaps(repoRoot, await listLocaleFiles(ctx()))
    expect([...maps.keys()]).toEqual(['en'])
  })

  it('refuses a broken source file with a 422', async () => {
    await writeFile(join(repoRoot, 'locales', 'en.json'), '{broken')
    await expect(readLocaleFileSource(ctx(), 'en')).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('writes the source in place and returns its blob sha', async () => {
    const before = await readLocaleFileSource(ctx(), 'en')
    expect(before.get('home.title')).toBe('Home')
    expect(await unwritableSourceKeys(ctx(), 'en', ['home', 'home.sub'])).toEqual(
      new Set(['home', 'home.sub'])
    )
    expect(await unwritableSourceKeys(ctx(), 'en', ['home.sub'])).toEqual(new Set())
    const written = await writeLocaleFileSource(ctx(), 'en', {
      'home.title': 'Start',
      'home.sub': 'Welcome',
    })
    const abs = join(repoRoot, 'locales', 'en.json')
    expect(written).toEqual({ relPath: 'locales/en.json', sha: await blobSha(abs) })
    expect(await readFile(abs, 'utf8')).toBe(
      '{\n  "home": {\n    "title": "Start",\n    "sub": "Welcome"\n  }\n}\n'
    )
  })

  it('creates a missing source file, including folders from the pattern', async () => {
    const c = ctx({ options: parseLocaleFilesOptions({ pattern: '{locale}/messages.json' }) })
    expect((await readLocaleFileSource(c, 'en')).size).toBe(0)
    const written = await writeLocaleFileSource(c, 'en', { a: 'x' })
    expect(written.relPath).toBe('locales/en/messages.json')
    expect(JSON.parse(await readFile(join(repoRoot, written.relPath), 'utf8'))).toEqual({
      a: 'x',
    })
  })
})
