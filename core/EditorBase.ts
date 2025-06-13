import mitt, { type EventType, type Handler } from 'mitt'
import type { App, Group, Image } from 'leafer-ui'

class EditorBase {
  protected app!: App
  protected groupTree!: Group
  protected image!: Image
  protected groupTag!: Group

  private emitter = mitt()

  get leaferApp() {
    return this.app
  }
  get leaferGroupTree() {
    return this.groupTree
  }
  get leaferImage() {
    return this.image
  }
  get leaferGroupTag() {
    return this.groupTag
  }

  public on<T extends Handler>(event: EventType, callback: T) {
    this.emitter.on(event, callback)
  }
  public emit<T>(event: EventType, data?: T) {
    this.emitter.emit(event, data)
  }
}

export default EditorBase
