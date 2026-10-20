/**
 * Which i18n runtime reads the project's copy. Each runtime gives syntax to
 * different characters: `{name}` is a variable in vue-i18n but literal text in
 * i18next, `a | b` is a vue-i18n plural but a literal pipe in i18next. `auto`
 * reads every syntax — right for mixed or ICU projects, at the cost of
 * treating the other runtime's literals as tokens.
 */
export const I18N_DIALECTS = ['auto', 'vue-i18n', 'i18next'] as const

export type I18nDialect = (typeof I18N_DIALECTS)[number]

export const DEFAULT_I18N_DIALECT: I18nDialect = 'auto'

export const i18nDialectItems: Array<{
  value: I18nDialect
  label: string
  description: string
}> = [
  {
    value: 'auto',
    label: 'Auto (every syntax)',
    description:
      'Reads vue-i18n, i18next, ICU and printf syntax together. Pick this for ICU (FormatJS, i18next-icu) or mixed projects.',
  },
  {
    value: 'vue-i18n',
    label: 'vue-i18n',
    description:
      '{name} / {0}, linked @:key, plural a | b. {{name}}, $t() and _one / _other plural keys are plain text.',
  },
  {
    value: 'i18next',
    label: 'i18next',
    description:
      '{{name}}, nesting $t(key), plural keys _one / _other. {name}, @:key and | are plain text.',
  },
]

/** The syntax a dialect gives meaning to; printf and tags are always read. */
export interface DialectSyntax {
  /** `{name}`, `{0}` */
  single: boolean
  /** `{{name}}` */
  double: boolean
  /** `{count, plural, …}` */
  icu: boolean
  /** vue-i18n `@:key` */
  linked: boolean
  /** i18next `$t(key)` */
  nesting: boolean
  /** vue-i18n `a | b` branches */
  pipe: boolean
  /** i18next `_one` / `_other` sibling keys */
  pluralKeys: boolean
}

export function dialectSyntax(dialect: I18nDialect): DialectSyntax {
  switch (dialect) {
    case 'auto':
      return {
        single: true,
        double: true,
        icu: true,
        linked: true,
        nesting: true,
        pipe: true,
        pluralKeys: true,
      }
    case 'vue-i18n':
      return {
        single: true,
        double: false,
        icu: false,
        linked: true,
        nesting: false,
        pipe: true,
        pluralKeys: false,
      }
    case 'i18next':
      return {
        single: false,
        double: true,
        icu: false,
        linked: false,
        nesting: true,
        pipe: false,
        pluralKeys: true,
      }
    default: {
      const unreachable: never = dialect
      throw new Error(`Unknown dialect ${unreachable}`)
    }
  }
}

export function parseI18nDialect(value: unknown): I18nDialect {
  return I18N_DIALECTS.find((dialect) => dialect === value) ?? DEFAULT_I18N_DIALECT
}

/** A rule's project-level severity; `off` skips the rule entirely. */
export const RULE_SEVERITY_VALUES = ['error', 'warning', 'off'] as const

export type RuleSeverity = (typeof RULE_SEVERITY_VALUES)[number]

export const ruleSeverityItems: Array<{ value: RuleSeverity; label: string }> = [
  { value: 'error', label: 'Error' },
  { value: 'warning', label: 'Warning' },
  { value: 'off', label: 'Off' },
]
