import mitt, { type EventType, type Handler } from 'mitt'
import type { App, Group, Image } from 'leafer-ui'

interface EditorEvents {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [event: EventType]: any // 支持任意事件名
}

class EditorBase {
  protected app!: App
  protected groupTree!: Group
  protected image!: Image
  protected groupTag!: Group
  //TODO: 保存撤销和重做列表
  protected undoList: unknown[] = []
  protected redoList: unknown[] = []

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

  public on<E extends EventType>(
    event: E,
    callback: Handler<EditorEvents[E]>
  ): void {
    this.emitter.on(event, callback)
  }

  public emit<E extends EventType>(event: E, data?: EditorEvents[E]) {
    this.emitter.emit(event, data)
  }

  public off<E extends EventType>(
    event: E,
    callback?: Handler<EditorEvents[E]>
  ) {
    this.emitter.off(event, callback)
  }
}

export default EditorBase
