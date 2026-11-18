import type { IProject } from "./Project"
import type { ITag } from "./Tag"
import type { ID } from '.'

export interface IPageSetting {
  ocrLanguage: string
  ocrEngine: number
  prompt?: string | null
  /**
   * Segments appended after the project's key prefix when the AI names a key
   * on this page. Null for none; the rest of the convention is the project's.
   */
  keyPath?: string | null
}

export interface IPage {
  id: ID
  name: string
  tags: ITag[]
  image: string
  createdAt?: string
  updatedAt?: string
  projectID?: ID
  project?: IProject
  settings: IPageSetting
  /** Release labels on this page. Empty means Unassigned. */
  releaseIds?: ID[]
}

export class Page implements IPage {
  id: ID = 0
  name: string
  tags: ITag[] = []
  image: string = ''
  releaseIds?: ID[]
  settings: IPageSetting
  constructor(name?: string) {
    this.name = name ?? 'Undefined'
    this.settings = {
      ocrLanguage: 'eng',
      ocrEngine: 1,
      prompt: '',
      keyPath: null,
    }
  }
}
