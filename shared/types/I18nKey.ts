import type { ID } from '.'
import type { ITagSetting } from './Tag'

export interface ILocaleValue {
  locale: string
  draftText: string | null
  publishedText: string | null
}

export interface II18nKeyRefTag {
  id: ID
  x: number
  y: number
  width: number
  height: number
  settings?: ITagSetting | null
}

export interface II18nKeyRefPage {
  id: ID
  name: string
  image: string | null
  tags: II18nKeyRefTag[]
}

export interface II18nKeyRefs {
  key: string
  pages: II18nKeyRefPage[]
}
