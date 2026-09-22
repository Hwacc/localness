import type { IProject } from "./Project"
import type { ITag } from "./Tag"
import type { ID } from '.'
import type { KeyStyle } from '../utils/key-convention'

export interface IPageSetting {
  ocrLanguage: string
  ocrEngine: number
  prompt?: string | null
  /**
   * Key naming convention. Null means "inherit the project's" — every field is
   * nullable because the empty string is a real prefix ("no prefix"), so it
   * cannot also carry that meaning. Optional as well, because a form that omits
   * them means the same thing as sending null.
   */
  keyPrefix?: string | null
  keySeparator?: string | null
  keyStyle?: KeyStyle | null
  keyMaxDepth?: number | null
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
      // Null is "inherit the project", which is what a new page should do.
      keyPrefix: null,
      keySeparator: null,
      keyStyle: null,
      keyMaxDepth: null,
    }
  }
}
