import type { UserRole } from '~/constants'
import type { ID } from './global'
import type { IStroke } from 'leafer-ui'

export interface IUser {
  id: ID
  username: string
  role: UserRole
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
  tagID: string
  x: number
  y: number
  width: number
  height: number
  className: string
  locked: boolean
  style: Partial<{
    fill: string
    cornerRadius: number
    strokeWidth: number
    stroke: IStroke
  }>
  i18nKey?: string
  text?: string
  createdAt?: string
  updatedAt?: string
  translationID?: ID
  translation?: ITranslation
  pageID: ID
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
