import type { ID } from '.'

export interface ILocaleValue {
  locale: string
  draftText: string | null
  publishedText: string | null
}

export interface II18nKeyRow {
  id: ID
  key: string
  origin: string
  description?: string | null
  updatedAt?: string | Date
  tagCount: number
  dirty: boolean
  locales: ILocaleValue[]
}
