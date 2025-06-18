import type { IPage, IProject } from './interfaces'

export class Project implements IProject {
  id: ID = -1
  name: string
  pages: IPage[] = []

  constructor(name?: string) {
    this.name = name ?? 'Undefined'
  }
}
