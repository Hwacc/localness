import {
  Leafer,
  Image,
  LeaferEvent,
  ImageEvent,
  Group,
  Frame,
} from '@leafer/worker'
import mitt from 'mitt'

class PainterTag extends Frame {

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

  public async export() {
    return await this.leafer.export('jpeg', true)
  }

  public on(event: string, listener: (e: any) => void) {
    this.emitter.on(event, listener)
  }
}

export { Painter }
