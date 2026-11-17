import type { ID } from '.'
import type { ILog } from './Log'
export interface TranslationContent {
  en?: string
  zh_cn?: string
  zh_tw?: string
  ja?: string
  ko?: string
  ru?: string
  fr?: string
  de?: string
  es?: string
  pt?: string
  [key: string]: string | undefined
}

export interface ITranslation extends Record<string, any> {
  id: ID
  fingerprint: string
  createdAt?: string
  updatedAt?: string
  vue?: TranslationContent
  react?: TranslationContent
  /** True while any locale has unpublished text. */
  dirty?: boolean
  /** Some locale is published: text edits land as drafts, the key cannot be renamed. */
  published?: boolean
  /** Release labels of this entry. Absent on the client means "not loaded". */
  releaseIds?: number[]
}

export class Translation implements ITranslation {
  id: ID = 0
  fingerprint: string = ''
  vue: TranslationContent = {}
  react: TranslationContent = {}
}

export interface ITranslationLog extends ILog<ITranslation> {
  translationID: ID
  translation?: ITranslation | null
}
