import type { UserRole } from '~/constants'
import type { ID } from './global'

export interface IUser {
  id: ID
  username: string
  role: UserRole.USER
  nickname?: string
  email?: string
  avatar?: string
  projects?: IProject[]
  ownProjects?: IProject[]
}

export interface IProject {
  id: ID
  name: string
  description: string
  createdAt?: string
  updatedAt?: string
  users: IUser[]
  pages: IPage[]
  owner?: IUser
  ownerUsername?: string
  ownerID?: ID
}

export interface IPage {
  id: ID
  name: string
  tags: ITag[]
  image: string
  createdAt?: string
  updatedAt?: string
  projectID?: ID
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
  translationID?: ID
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
