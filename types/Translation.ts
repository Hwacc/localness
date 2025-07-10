import type { ID } from './global'
export interface ITranslation extends Record<string, any> {
  id: ID
  fingerprint: string
  createdAt?: string
  updatedAt?: string
  origin?: string
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
}

export class Translation implements ITranslation {
  id: ID = 0
  fingerprint: string = ''
  origin: string = ''
  en: string = ''
  zh_cn: string = ''
  zh_tw: string = ''
  ja: string = ''
  ko: string = ''
  ru: string = ''
  fr: string = ''
  de: string = ''
  es: string = ''
  pt: string = ''
}
