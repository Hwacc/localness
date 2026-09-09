import type { IUser } from './User'
import type { IPage } from './Page'
import type { ID } from '.'
import type { ITeam } from './Team'

export interface IProjectSetting {
  ocrLanguage: string
  ocrEngine: number
  prompt?: string | null
  locales?: string[]
  localeFallback?: string
}

export interface IProject {
  id: ID
  name: string
  description: string
  createdAt?: string
  updatedAt?: string
  users: IUser[]
  pages: IPage[]
  teamId?: ID
  team?: ITeam
  settings?: IProjectSetting
}

export class Project implements IProject {
  id: ID = 0
  name: string
  description: string = ''
  pages: IPage[] = []
  users: IUser[] = []
  teamId?: ID
  team?: ITeam
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
