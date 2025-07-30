import type { IProject } from "./Project"
import type { ITag } from "./Tag"
import type { ID } from '.'
export interface IPage {
  id: ID
  name: string
  tags: ITag[]
  image: string
  createdAt?: string
  updatedAt?: string
  projectID?: ID
  project?: IProject
  settings: {
    ocrLanguage: string
    ocrEngine: number
    prompt?: string
  }
}

export class Page implements IPage {
  id: ID = 0
  name: string
  tags: ITag[] = []
  image: string = ''
  settings: {
    ocrLanguage: string
    ocrEngine: number
    prompt?: string
  }
  constructor(name?: string) {
    this.name = name ?? 'Undefined'
    this.settings = {
      ocrLanguage: 'eng',
      ocrEngine: 1,
      prompt: '',
    }
  }
}