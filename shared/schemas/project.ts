import { z } from 'zod/v4'
import { OCR_LANGUAGES } from '#shared/constants'
import { KEY_STYLE_VALUES } from '#shared/utils/key-convention'
import {
  I18N_DIALECTS,
  RULE_SEVERITY_VALUES,
} from '#shared/utils/consistency/dialect'
import { zNilable } from './common'

export const zProject = z.object({
  name: z.string().min(3),
  description: zNilable(z.string()),
  teamId: z.number().int().positive().optional(),
  settings: z.object({
    ocrLanguage: z.string(),
    ocrEngine: z.number(),
    prompt: zNilable(z.string()),
    // Optional, not nilable: the columns are NOT NULL, and `null` for "no
    // prefix" would be ambiguous — the empty string is that.
    keyPrefix: z.string().optional(),
    keySeparator: z.string().min(1, 'separator cannot be empty').optional(),
    keyStyle: z.enum(KEY_STYLE_VALUES).optional(),
    keyMaxDepth: z.number().int().min(1).max(10).optional(),
    /** The language a key's original text lives in. Must be one of `locales`. */
    localeFallback: z.string().min(1).optional(),
    /** Consistency lint switches by ruleId; an absent entry means enabled. */
    lintRules: z.record(z.string(), z.boolean()).optional(),
    /** Which i18n runtime's syntax the Consistency checks read. */
    i18nDialect: z.enum(I18N_DIALECTS).optional(),
    /** Consistency severity overrides by ruleId; absent = rule default. */
    ruleSeverity: z.record(z.string(), z.enum(RULE_SEVERITY_VALUES)).optional(),
  }),
})
export type ZProject = z.infer<typeof zProject>

export const zOCR = z.object(
  {
    image: z.string().nonempty(),
    language: zNilable(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
  },
  'OCR parameters validate failed'
)
export type ZOCR = z.infer<typeof zOCR>

export const zProjectSetting = z.object(
  {
    ocrLanguage: zNilable(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
    ocrEngine: zNilable(
      z.number().refine((v) => v === 1 || v === 2, {
        message: 'ocrEngine must be 1 or 2',
      })
    ),
    prompt: zNilable(z.string()),
  },
  'Project setting parameters validate failed'
)
export type ZProjectSetting = z.infer<typeof zProjectSetting>
