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

export interface IProjectOwner {
  userId: ID
  username?: string
  nickname?: string
}

/**
 * A release label. Filter-only: it groups a project's pages and entries by the
 * version they shipped in, and never carries a second copy of any text.
 */
export interface IProjectRelease {
  id: ID
  name: string
  sort: number
  createdAt?: string
  updatedAt?: string
}

/** Which Project Settings tab to open on. */
export type ProjectSettingsTab = 'basic' | 'prompt' | 'settings' | 'releases'

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
  owners?: IProjectOwner[]
  releases?: IProjectRelease[]
  isSteward?: boolean
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
