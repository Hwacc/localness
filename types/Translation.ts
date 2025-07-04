import type { ID } from "./global"

export interface ITranslation {
  id: ID
  i18nKey: string
  createdAt?: string
  updatedAt?: string
  origin: string
  en: string
  zh: string
}

export class Translation implements ITranslation {
  id: ID = 0
  i18nKey: string = ''
  origin: string = ''
  en: string = ''
  zh: string = ''
}
