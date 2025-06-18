export interface IProject {
  id: ID
  name: string
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
  key?: string
  translations?: ITranslation[]
  createdAt?: string
  updatedAt?: string
}

export interface ITranslation {
  id: ID
  key: string
  en: string
  zh: string
}
