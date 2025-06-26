import mitt, { type EventType, type Handler } from 'mitt'
import { App, Frame, Group, Image, LeaferEvent } from 'leafer-ui'

interface EditorEvents {
  [event: EventType]: any // 支持任意事件名
}

abstract class EditorBase {
  protected app!: App
  protected groupTree!: Group
  protected image!: Image
  protected groupTag!: Frame
  protected view: HTMLDivElement

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

  constructor(view: HTMLDivElement) {
    this.view = view
    this.app = new App({
      view,
      tree: { type: 'viewport' },
      editor: {
        rotateable: false, // 关闭旋转, 防止移出编辑范围
        skewable: false, // 关闭倾斜
        flipable: false, // 关闭翻转, 防止移出编辑范围
        buttonsDirection: 'top',
        buttonsFixed: true,
        buttonsMargin: 8,
      },
    })
    this.groupTree = new Group({
      x: 0,
      y: 0,
    })
    this.image = new Image({
      x: 0,
      y: 0,
    })
    this.groupTag = new Frame({
      x: 0,
      y: 0,
      fill: 'transparent',
    })
    this.groupTree.add(this.image)
    this.groupTree.add(this.groupTag)
    this.app.tree.add(this.groupTree)

    this.app.tree.on(LeaferEvent.READY, (e: LeaferEvent) => {
      this.onReady(e)
    })
  }

  abstract onReady(e: LeaferEvent): void

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
