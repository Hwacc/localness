import type { IStroke } from 'leafer-ui'
import type { ITranslation } from './Translation'
import type { ID } from '.'

export type TagStyle = {
  fill?: string
  cornerRadius?: number
  strokeWidth?: number
  stroke?: IStroke
}

export type LabelStyle = {
  fill?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  textWrap?: string
  align?:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'left'
    | 'right'
}

export interface ITagSetting {
  locked: boolean
  style: TagStyle
  labelStyle: LabelStyle
  prompt?: string | null
}

export interface ITag {
  id: ID
  tagID: string
  x: number
  y: number
  width: number
  height: number
  className: string
  createdAt?: string
  updatedAt?: string
  translationID?: ID
  translation?: ITranslation
  pageID: ID
  i18nKey?: string
  settings?: ITagSetting
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
  createdAt?: string | undefined
  updatedAt?: string | undefined
  translation?: ITranslation | undefined
  i18nKey?: string | undefined
  settings?: ITagSetting

  constructor() {
    this.settings = {
      locked: false,
      style: {} as TagStyle,
      labelStyle: {} as LabelStyle,
      prompt: '',
    }
  }
}
