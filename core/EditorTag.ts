import type { ID } from '~/types/global'
import type { ITag } from '~/types/interfaces'
import { Rect, type IJSONOptions } from 'leafer-ui'
import { pick } from 'lodash-es'

class EditorTag extends Rect {
  public tagInfo: Partial<ITag> = {} as ITag
  public remoteID: ID = 0
  public isLocked: boolean = false
  constructor(tag: Partial<ITag>) {
    super({
      id: tag.tagID,
      className: tag.className,
      x: tag.x,
      y: tag.y,
      width: tag.width,
      height: tag.height,
      fill: tag.style?.fill ?? 'transparent',
      cornerRadius: tag.style?.cornerRadius ?? 4,
      stroke: tag.style?.stroke ?? '#FEB027',
      strokeWidth: tag.style?.strokeWidth ?? 2,
      dragBounds: 'parent',
      editable: true,
      editConfig: {
        moveable: !tag.locked,
        rotatable: !tag.locked,
        resizeable: !tag.locked,
      },
      event: {
        mounted: () => {
          if (this.parent) {
            this.set({
              widthRange: { min: 20, max: this.parent.width },
              heightRange: { min: 20, max: this.parent.height },
            })
          }
        },
      },
    })

    this.tagInfo = tag
    this.remoteID = tag.id ?? 0
    this.isLocked = tag.locked ?? false
    this.set({
      widthRange: { min: 20, max: Infinity },
      heightRange: { min: 20, max: Infinity },
    })
  }

  public lock(_lock: boolean) {
    this.isLocked = _lock
    this.set({
      editConfig: {
        moveable: !_lock,
        rotatable: !_lock,
        resizeable: !_lock,
      },
    })
    this.emit('custom-lock', { locked: _lock })
  }

  public override toJSON(options?: IJSONOptions): ITag {
    const original = super.toJSON(options)
    const baseProps = pick(original, ['x', 'y', 'width', 'height', 'className', 'tag' ])
    const styleProps = pick(original, ['fill', 'cornerRadius', 'strokeWidth', 'stroke' ])
    this.tagInfo.id = this.remoteID
    this.tagInfo.tagID = this.id
    this.tagInfo.style = { ...styleProps }
    return { ...this.tagInfo, ...baseProps } as ITag
  }
}

export default EditorTag
