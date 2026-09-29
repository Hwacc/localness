import { UserRole } from '#shared/constants'
import type { IProject } from './Project'
import type { ID } from '.'

export interface IUser {
  id: ID
  username: string
  role: UserRole
  nickname?: string
  email?: string
  avatar?: string
  hasPasswordSet?: boolean
  atlassian?: {
    connected: boolean
    displayName?: string
    email?: string
  }
  projects?: IProject[]
  ownProjects?: IProject[]
}

/** One row of the platform Admin's account list. */
export interface IUserListItem {
  id: ID
  username: string
  nickname: string | null
  email: string | null
  role: UserRole
  createdAt: string
}

export interface IUserListPage {
  items: IUserListItem[]
  total: number
  page: number
  pageSize: number
}

export class User implements IUser {
  id: ID = 0
  username: string = ''
  role: UserRole = UserRole.USER
  nickname?: string | undefined = undefined
  email?: string | undefined = undefined
  avatar?: string | undefined = undefined
  projects?: IProject[] =  []
  ownProjects?: IProject[] = []
}
