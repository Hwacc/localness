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
  projects?: IProject[]
  ownProjects?: IProject[]
}

export class User implements IUser {
  id: ID = 0
  username: string = ''
  role: UserRole = UserRole.GUEST
  nickname?: string | undefined = undefined
  email?: string | undefined = undefined
  avatar?: string | undefined = undefined
  projects?: IProject[] =  []
  ownProjects?: IProject[] = []
}
