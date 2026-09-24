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
  /** False once published: the entry is read-only until it is reverted to draft. */
  dirty?: boolean
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
