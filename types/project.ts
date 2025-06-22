import type { ID } from './global'
import type { IPage, IProject, IUser } from './interfaces'

export class Project implements IProject {
  id: ID = 0
  name: string
  description: string = ''
  pages: IPage[] = []
  createdAt?: string | undefined
  updatedAt?: string | undefined
  users: IUser[] = []

  constructor(name?: string) {
    this.name = name ?? 'Undefined'
  }
}
