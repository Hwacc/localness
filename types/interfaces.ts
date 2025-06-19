import type { ID } from './global'

export interface IProject {
  id: ID
  name: string
  description: string
  pages: IPage[]
  createdAt?: string
  updatedAt?: string
}

export interface IPage {
  id: ID
  name: string
  tags: ITag[]
  image: string
  createdAt?: string
  updatedAt?: string
  projectId?: ID
  project?: IProject
}

export interface ITag {
  id: ID
  x: number
  y: number
  width: number
  height: number
  editable: boolean
  className: string
  fill: string
  stroke: string
  i18nKey?: string
  content?: string
  createdAt?: string
  updatedAt?: string
  translationId?: ID
  translation?: ITranslation
}

export interface ITranslation {
  id: ID
  i18nKey: string
  createdAt?: string
  updatedAt?: string
  origin: string
  en: string
  zh: string
}
