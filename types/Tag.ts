import type { IStroke, ITextWrap } from 'leafer-ui'
import type { ID } from './global'
import type { ITranslation } from './Translation'

export type TagStyle = {
  fill?: string
  cornerRadius?: number
  strokeWidth?: number
  stroke?: IStroke
  text?: {
    fontSize?: number
    fontWeight?: 'normal' | 'bold'
    fill?: string
    wrap?: ITextWrap
    align?:
      | 'top-left'
      | 'top-right'
      | 'bottom-left'
      | 'bottom-right'
      | 'left'
      | 'right'
  }
}

export interface ITag {
  id: ID
  tagID: string
  x: number
  y: number
  width: number
  height: number
  className: string
  locked: boolean
  style: TagStyle
  createdAt?: string
  updatedAt?: string
  translationID?: ID
  translation?: ITranslation
  pageID: ID
  i18nKey?: string
}

export class Tag implements ITag {
  id: ID = 0
  tagID: string = ''
  pageID: ID = 0
  translationID?: ID | undefined
  x: number = 0
  y: number = 0
  width: number = 0
  height: number = 0
  className: string = ''
  locked: boolean = false
  style: TagStyle = {} as TagStyle
  createdAt?: string | undefined
  updatedAt?: string | undefined
  translation?: ITranslation | undefined
  i18nKey?: string | undefined
}
