import {
  dataType,
  Frame,
  Text,
  type IJSONOptions,
  type ITextInputData,
} from 'leafer-ui'
import { isEmpty, isNil, pick } from 'lodash-es'
import {
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
  DEFAULT_CORNER_RADIUS,
  DEFAULT_LABEL_FILL,
  DEFAULT_LABEL_FONT_SIZE,
  DEFAULT_LABEL_FONT_WEIGHT,
  DEFAULT_LABEL_WRAP,
  DEFAULT_LABEL_ALIGN,
} from '#shared/constants'
import { Editor } from './Editor'

Text.addAttr('align', 'top-right', dataType)
class EditorTag extends Frame {
  public remoteTag: Partial<ITag> = {} as ITag
  public isLocked: boolean = false
  private labelNode: Text | null = null

  constructor(tag: Partial<ITag>, settings?: ITag['settings']) {
    super({
      id: tag.tagID,
      className: tag.className,
      x: tag.x,
      y: tag.y,
      overflow: 'show',
      width: tag.width,
      height: tag.height,
      fill: settings?.style?.fill ?? 'transparent',
      cornerRadius: settings?.style?.cornerRadius ?? DEFAULT_CORNER_RADIUS,
      stroke: settings?.style?.stroke ?? DEFAULT_LINE_COLOR,
      strokeWidth: settings?.style?.strokeWidth ?? DEFAULT_LINE_WIDTH,
      dragBounds: 'parent',
      editable: true,
      editConfig: {
        moveable: !settings?.locked,
        rotatable: !settings?.locked,
        resizeable: !settings?.locked,
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

    this.remoteTag = tag
    this.isLocked = settings?.locked ?? false
    this.set({
      widthRange: { min: 20, max: Infinity },
      heightRange: { min: 20, max: Infinity },
    })

    this.drawI18nKey(settings?.labelStyle)
  }

  private drawI18nKey(labelStyle?: ITagSetting['labelStyle']) {
    if (!this.remoteTag.i18nKey) {
      if (this.labelNode) {
        this.labelNode.remove()
        this.labelNode = null
      }
      return
    }
    const options = {
      text: this.remoteTag.i18nKey ?? '',
      fill: labelStyle?.fill ?? DEFAULT_LABEL_FILL,
      fontSize: labelStyle?.fontSize ?? DEFAULT_LABEL_FONT_SIZE,
      fontWeight: labelStyle?.fontWeight ?? DEFAULT_LABEL_FONT_WEIGHT,
      textWrap: labelStyle?.textWrap ?? DEFAULT_LABEL_WRAP,
      align: labelStyle?.align ?? DEFAULT_LABEL_ALIGN,
    }
    if (!this.labelNode) {
      this.labelNode = new Text(options as ITextInputData)
      this.add(this.labelNode)
    } else {
      this.labelNode.set(options as ITextInputData)
    }
    this.updateLabelAlign()
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

  public update(rTag: Partial<ITag>) {
    this.remoteTag = { ...this.remoteTag, ...rTag }
    this.lock(rTag.settings?.locked ?? false)
    this.updateStyle(rTag.settings?.style)
    this.updateLabelStyle(rTag.settings?.labelStyle)
  }

  public updateStyle(rStyle?: Partial<ITagSetting['style']>) {
    if (isEmpty(rStyle)) return
    this.set({
      fill: rStyle.fill ?? 'transparent',
      cornerRadius: rStyle.cornerRadius ?? DEFAULT_CORNER_RADIUS,
      stroke: rStyle.stroke ?? DEFAULT_LINE_COLOR,
      strokeWidth: rStyle.strokeWidth ?? DEFAULT_LINE_WIDTH,
    })
  }

  public updateLabelStyle(
    rLabelStyle?: Partial<ITagSetting['labelStyle']>
  ) {
    if (isNil(rLabelStyle)) return
    if (
      rLabelStyle.align &&
      this.labelNode &&
      rLabelStyle.align !== (this.labelNode as any).align
    ) {
      ;(this.labelNode as any).align = rLabelStyle.align
    }
    this.drawI18nKey(rLabelStyle)
  }

  public updateLabelAlign(bounds?: { width: number; height: number }) {
    if (!this.labelNode) return
    // map sizes
    const { width, height } = bounds ?? {
      width: this.remoteTag.width ?? 0,
      height: this.remoteTag.height ?? 0,
    }
    const labelWidth = this.labelNode.width ?? 0
    const labelHeight = this.labelNode.height ?? 0
    switch ((this.labelNode as any).align) {
      case 'top-right':
      default:
        this.labelNode.set({
          x: width - labelWidth,
          y: -labelHeight - 2,
        })
        break
      case 'top-left':
        this.labelNode.set({
          x: 0,
          y: -labelHeight - 2,
        })
        break
      case 'bottom-left':
        this.labelNode.set({
          x: 0,
          y: height,
        })
        break
      case 'bottom-right':
        this.labelNode.set({
          x: width - labelWidth,
          y: height,
        })
        break
      case 'left':
        this.labelNode.set({
          x: -labelWidth - 2,
          y: (height - labelHeight) / 2,
        })
        break
      case 'right':
        this.labelNode.set({
          x: width + 2,
          y: (height - labelHeight) / 2,
        })
        break
    }
  }

  public async clip() {
    const image = await Editor.imageClipper.clip({
      x: this.x ?? 0,
      y: this.y ?? 0,
      width: this.width ?? 0,
      height: this.height ?? 0,
    })
    return { image, tag: this.toJSON() }
  }

  public toTagJSON(options?: IJSONOptions): ITag {
    const original = super.toJSON(options)
    const labelObject = this.labelNode?.toJSON()
    const baseProps = pick(original, [
      'x',
      'y',
      'width',
      'height',
      'className',
      'translationID',
      'translation',
    ])
    const styleProps = pick(original, [
      'fill',
      'cornerRadius',
      'strokeWidth',
      'stroke',
    ]) as ITagSetting['style']
    const labelStyle = pick(labelObject, [
      'fontSize',
      'fontWeight',
      'fill',
      'textWrap',
      'align',
    ])
    this.remoteTag.tagID = this.id
    this.remoteTag.settings = this.remoteTag.settings ?? ({} as ITagSetting)
    this.remoteTag.settings.style = { ...styleProps } as ITagSetting['style']
    this.remoteTag.settings.labelStyle = labelStyle as ITagSetting['labelStyle']
    this.remoteTag.settings.locked = this.isLocked
    return { ...this.remoteTag, ...baseProps } as ITag
  }
}

export default EditorTag
