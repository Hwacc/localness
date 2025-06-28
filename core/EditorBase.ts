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
      pointSnap: true,
      pixelSnap: true,
      editor: {
        rotateable: false, // 关闭旋转, 防止移出编辑范围
        skewable: false, // 关闭倾斜
        flipable: false, // 关闭翻转, 防止移出编辑范围
        buttonsDirection: 'top',
        buttonsFixed: true,
        buttonsMargin: 8,
        boxSelect:false,
        multipleSelect: false
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

  /**
   * A async emit, could call success or fail to end pending
   * @param event string must start with "async-"
   * @param data anything
   * @returns 
   */
  public async asyncEmit<E extends EventType, T>(
    event: E,
    data?: EditorEvents[E]
  ): Promise<T> {
    if (typeof event === 'string' && !event.startsWith('async-')) {
      throw Error('async emit: event name must start with "async-"')
    }
    return new Promise((resolve, reject) => {
      const success = (response: T) => {
        resolve(response)
      }
      const fail = (err?: any) => {
        reject(err)
      }
      this.emitter.emit(event, {
        payload: data,
        success,
        fail,
      })
    })
  }

  /**
   * A async emit receiver, must call success or fail otherwise async emit will always be pending
   * @param event string must start with "async-"
   * @param callback wrappered callback
   * @returns 
   */
  public asyncOn<T>(
    event: EventType,
    callback: Handler<{
      payload: T
      success: (response?: any) => void
      fail: (err?: any) => void
    }>
  ) {
    if (typeof event === 'string' && !event.startsWith('async-')) {
      throw Error('async on: event name must start with "async-"')
    }
    this.emitter.on(event, callback as Handler)
  }

  public off<E extends EventType>(
    event: E,
    callback?: Handler<EditorEvents[E]>
  ) {
    this.emitter.off(event, callback)
  }
}

export default EditorBase
