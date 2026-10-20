import { describe, expect, it } from 'vitest'
import {
  pluralBase,
  withPluralFamilies,
  type ScanKeyInput,
} from '#shared/utils/consistency'
import { placeholdersRule } from '#shared/utils/consistency/rules/placeholders'
import { orphanKeysRule } from '#shared/utils/consistency/rules/orphan-keys'
import { recheckLocale } from '#shared/utils/consistency/resolve'
import { ctx, key, published } from './helpers'

const scan = (keys: ScanKeyInput[]) => withPluralFamilies(keys, 'en')
const issuesOf = (keys: ScanKeyInput[]) =>
  placeholdersRule
    .detect(ctx(scan(keys)))
    .map((finding) => ({ key: finding.keys[0]!.key, meta: finding.meta }))

describe('vue-i18n pipe plurals', () => {
  it('compares branches by which placeholders appear', () => {
    expect(
      issuesOf([
        key({
          locales: [
            published('en', 'no apples | one apple | {count} apples'),
            published(
              'ru',
              'нет яблок | {count} яблоко | {count} яблока | {count} яблок'
            ),
          ],
        }),
        key({
          locales: [
            published('en', 'one file | {n} files'),
            published('ru', 'файл | {n} файла | {n} файлов'),
          ],
        }),
      ])
    ).toEqual([])
  })

  it('still flags a placeholder no branch has', () => {
    expect(
      issuesOf([
        key({
          locales: [
            published('en', 'one file | {n} files'),
            published('de', 'eine Datei | {count} Dateien'),
          ],
        }),
      ])[0]!.meta
    ).toMatchObject({
      issues: [{ locale: 'de', missing: ['{n}'], extra: ['{count}'] }],
    })
  })

  it('treats an escaped pipe as copy', () => {
    expect(
      issuesOf([
        key({
          locales: [
            published('en', "A {'|'} {x} {x}"),
            published('de', "A {'|'} {x}"),
          ],
        }),
      ])
    ).toHaveLength(1)
  })
})

describe('i18next plural families', () => {
  it('derives the family base', () => {
    expect(pluralBase('items_one')).toBe('items')
    expect(pluralBase('place_ordinal_few')).toBe('place_ordinal')
    expect(pluralBase('items')).toBeNull()
  })

  it('lets a form add or drop {{count}}', () => {
    expect(
      issuesOf([
        key({
          key: 'items_one',
          locales: [
            published('en', 'One item'),
            published('ru', '{{count}} предмет'),
          ],
        }),
        key({
          key: 'items_other',
          locales: [
            published('en', '{{count}} items'),
            published('ru', 'предметов'),
          ],
        }),
      ])
    ).toEqual([])
  })

  it('checks a form the source lacks against _other', () => {
    const found = issuesOf([
      key({
        key: 'items_other',
        locales: [
          published('en', '{{count}} items in {{folder}}'),
          published('ru', '{{count}} предмета в {{folder}}'),
        ],
      }),
      key({
        key: 'items_few',
        locales: [published('ru', '{{count}} предмета')],
      }),
    ])
    expect(found).toEqual([
      {
        key: 'items_few',
        meta: expect.objectContaining({
          source: '{{count}} items in {{folder}}',
          sourceKey: 'items_other',
          issues: [expect.objectContaining({ missing: ['{{folder}}'] })],
        }),
      },
    ])
  })

  it('accepts a token another form of the source uses', () => {
    expect(
      issuesOf([
        key({
          key: 'items_one',
          locales: [published('en', 'One item'), published('ru', '{{name}}')],
        }),
        key({
          key: 'items_other',
          locales: [published('en', '{{count}} {{name}}')],
        }),
      ])
    ).toEqual([])
  })

  it('needs an _other sibling to be a family', () => {
    expect(
      issuesOf([
        key({
          key: 'button_one',
          locales: [published('en', 'Go'), published('ru', '{{count}}')],
        }),
        key({
          key: 'button_two',
          locales: [published('en', 'Go')],
        }),
      ])
    ).toHaveLength(1)
  })

  it('does not report a form as orphan when a sibling has a frame', () => {
    const keys = scan([
      key({ key: 'items_one', tagCount: 1 }),
      key({ key: 'items_other', tagCount: 0 }),
      key({ key: 'loose', tagCount: 0 }),
    ])
    expect(
      orphanKeysRule.detect(ctx(keys)).map((finding) => finding.keys[0]!.key)
    ).toEqual(['loose'])
  })

  it('keeps the family on a single-key recheck', () => {
    const [few] = withPluralFamilies(
      [key({ key: 'items_few', locales: [published('ru', '')] })],
      'en',
      {
        entries: [
          { key: 'items_few', tagCount: 0, locales: [] },
          {
            key: 'items_other',
            tagCount: 1,
            locales: [published('en', '{{count}} in {{folder}}')],
          },
        ],
      }
    )
    expect(
      recheckLocale('placeholders', few!, 'en', 'ru', '{{count}} в {{folder}}')
    ).toBeNull()
    expect(
      recheckLocale('placeholders', few!, 'en', 'ru', '{{count}}')
    ).toMatchObject({ missing: ['{{folder}}'] })
  })
})
