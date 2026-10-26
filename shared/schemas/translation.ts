import { z } from 'zod/v4'
import { zNilable } from './common'

export const zTranslationContent = z.looseObject({
  en: zNilable(z.string()).optional(),
  zh_cn: zNilable(z.string()).optional(),
  zh_tw: zNilable(z.string()).optional(),
  ja: zNilable(z.string()).optional(),
  ko: zNilable(z.string()).optional(),
  ru: zNilable(z.string()).optional(),
  fr: zNilable(z.string()).optional(),
  de: zNilable(z.string()).optional(),
  es: zNilable(z.string()).optional(),
  pt: zNilable(z.string()).optional(),
})
export type ZTranslationContent = z.infer<typeof zTranslationContent>

export const zTranslation = z.looseObject({
  fingerprint: zNilable(z.string()).optional(),
  projectId: z.number().int().positive().optional(),
  key: zNilable(z.string()).optional(),
  force: z.boolean().optional(),
  vue: zNilable(zTranslationContent).optional(),
  react: zNilable(zTranslationContent).optional(),
  /** Release labels to attach. Omitted leaves them untouched on update. */
  releaseIds: z.array(z.number().int().positive()).optional(),
})
export type ZTranslation = z.infer<typeof zTranslation>
