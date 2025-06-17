import type { IPage, IProject } from './interfaces'

export class Project implements IProject {
  id: string = ''
  name: string = 'Undefined'
  pages: IPage[] = []
}
