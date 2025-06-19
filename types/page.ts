import type { ID } from "./global"
import type { IPage, ITag } from "./interfaces"


export class Page implements IPage {
  id: ID = -1
  name: string
  tags: ITag[] = []
  image: string = ''

  constructor(name?: string) {
    this.name = name ?? 'Undefined'
  }
}