import { UserRole } from '~/constants'
import type { ID } from './global'
import type { IProject, IUser } from './interfaces'

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
