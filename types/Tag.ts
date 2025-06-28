import type { IStroke } from 'leafer-ui'
import type { ID } from './global'
import type { ITag, ITranslation } from './interfaces'

export class Tag implements ITag {
  id: ID = 0
  tagID: string = ''
  x: number = 0
  y: number = 0
  width: number = 0
  height: number = 0
  className: string = ''
  locked: boolean = false
  style: Partial<{
    fill: string
    cornerRadius: number
    strokeWidth: number
    stroke: IStroke
  }> = {}
  i18nKey?: string | undefined
  text?: string | undefined
  createdAt?: string | undefined
  updatedAt?: string | undefined
  translationID?: ID | undefined
  translation?: ITranslation | undefined
  pageID: ID = 0
}
