import type { IUser } from './User'
import type { IPage } from './Page'
import type { ID } from '.'

export interface IProjectSetting {
  ocrLanguage: string
  ocrEngine: number
  prompt?: string | null
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
  settings?: IProjectSetting
}

export class Project implements IProject {
  id: ID = 0
  name: string
  description: string = ''
  pages: IPage[] = []
  users: IUser[] = []
  owner?: IUser
  ownerUsername?: string
  ownerID?: ID
  settings?: IProjectSetting

  constructor(name?: string) {
    this.name = name ?? 'Undefined'
    this.settings = {
      ocrLanguage: 'eng',
      ocrEngine: 1,
      prompt: '',
    }
  }
}
