export interface IProject {
  id: string
  name: string
  pages: IPage[]
  createdAt?: string
  updatedAt?: string
}

export interface IPage {
  id: string
  name: string
  tags: ITag[]
  image: string
  createdAt?: string
  updatedAt?: string
}

export interface ITag {
  id: string
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
  id: string
  key: string
  en: string
  zh: string
}
