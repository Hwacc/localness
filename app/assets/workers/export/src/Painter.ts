import {
  Leafer,
  Image,
  LeaferEvent,
  ImageEvent,
  Group,
  Frame,
  Text,
  type ITextInputData,
} from '@leafer/worker'
import mitt from 'mitt'
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_LABEL_ALIGN,
  DEFAULT_LABEL_FILL,
  DEFAULT_LABEL_FONT_SIZE,
  DEFAULT_LABEL_FONT_WEIGHT,
  DEFAULT_LABEL_WRAP,
  DEFAULT_LINE_COLOR,
  DEFAULT_LINE_WIDTH,
} from '#shared/constants'

class PainterTag extends Frame {
  private remoteTag: ITag
  constructor(tag: ITag) {
    super({
      id: tag.tagID,
      className: tag.className,
      x: tag.x,
      y: tag.y,
      overflow: 'show',
      width: tag.width,
      height: tag.height,
      fill: tag.style?.fill ?? 'transparent',
      cornerRadius: tag.style?.cornerRadius ?? DEFAULT_CORNER_RADIUS,
      stroke: tag.style?.stroke ?? DEFAULT_LINE_COLOR,
      strokeWidth: tag.style?.strokeWidth ?? DEFAULT_LINE_WIDTH,
      editable: false,
    })
    this.remoteTag = tag
    this.drawI18nKey(tag.labelStyle)
  }

  private drawI18nKey(labelStyle?: ITag['labelStyle']) {
    if (!this.remoteTag.i18nKey) return

    // add text node
    const options = {
      text: this.remoteTag.i18nKey,
      fill: labelStyle?.fill ?? DEFAULT_LABEL_FILL,
      fontSize: labelStyle?.fontSize ?? DEFAULT_LABEL_FONT_SIZE,
      fontWeight: labelStyle?.fontWeight ?? DEFAULT_LABEL_FONT_WEIGHT,
      textWrap: labelStyle?.textWrap ?? DEFAULT_LABEL_WRAP,
    }
    const textNode = new Text(options as ITextInputData)
    this.add(textNode)

    const align = labelStyle?.align ?? DEFAULT_LABEL_ALIGN
    const width = this.remoteTag.width ?? 0
    const height = this.remoteTag.height ?? 0
    const labelWidth = textNode.width ?? 0
    const labelHeight = textNode.height ?? 0
    switch (align) {
      case 'top-right':
      default:
        textNode.set({
          x: width - labelWidth,
          y: -labelHeight - 2,
        })
        break
      case 'top-left':
        textNode.set({
          x: 0,
          y: -labelHeight - 2,
        })
        break
      case 'bottom-left':
        textNode.set({
          x: 0,
          y: height,
        })
        break
      case 'bottom-right':
        textNode.set({
          x: width - labelWidth,
          y: height,
        })
        break
      case 'left':
        textNode.set({
          x: -labelWidth - 2,
          y: (height - labelHeight) / 2,
        })
        break
      case 'right':
        textNode.set({
          x: width + 2,
          y: (height - labelHeight) / 2,
        })
        break
    }
  }
}

class Painter {
  private leafer: Leafer
  private image: Image
  private tagGroup: Group
  private emitter = mitt()

  constructor() {
    this.leafer = new Leafer({
      width: 300,
      height: 300,
    })
    this.leafer.on(LeaferEvent.READY, (e: LeaferEvent) => {
      this.emitter.emit('ready', e)
    })

    this.image = new Image({
      x: 0,
      y: 0,
    })
    this.image.on(ImageEvent.LOADED, (e: ImageEvent) => {
      const imgWidth = e.image.width
      const imgHeight = e.image.height
      this.leafer.set({
        width: imgWidth,
        height: imgHeight,
      })
      this.image.set({
        width: imgWidth,
        height: imgHeight,
      })
      this.tagGroup.set({
        width: imgWidth,
        height: imgHeight,
      })
      this.emitter.emit('image-loaded', e)
    })

    this.tagGroup = new Group({
      x: 0,
      y: 0,
    })
    this.leafer.add(this.image)
    this.leafer.add(this.tagGroup)
  }

  public setImage(url: string) {
    this.image.set({ url })
  }

  public setTags(tags: ITag[]) {
    this.tagGroup.clear()
    console.log('get tags', tags)
    this.tagGroup.add(tags.map((tag) => new PainterTag(tag)))
  }

  public async export() {
    return await this.leafer.export('jpeg', true)
  }

  public on(event: string, listener: (e: any) => void) {
    this.emitter.on(event, listener)
  }
}

export { Painter }
