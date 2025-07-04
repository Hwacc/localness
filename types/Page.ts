import type { ID } from "./global"
import type { IProject } from "./Project"
import type { ITag } from "./Tag"


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

export class Page implements IPage {
  id: ID = 0
  name: string
  tags: ITag[] = []
  image: string = ''
  constructor(name?: string) {
    this.name = name ?? 'Undefined'
  }
}