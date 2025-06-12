import {
  App,
  Group,
  Image,
  ImageEvent,
  DragEvent as LeaferDragEvent,
  LeaferEvent,
  Rect,
  type IScreenSizeData,
} from 'leafer-ui'
import '@leafer-in/view'
import '@leafer-in/viewport'
import '@leafer-in/editor'

class Editor {
  private app: App
  private groupTree: Group
  private image: Image
  private groupTag: Group
  private tag: Rect = new Rect()
  private view: HTMLDivElement
  private mode: 'drag' | 'draw'
  private imageSrcSize: { width: number; height: number } = {
    width: 0,
    height: 0,
  }

  constructor(view: HTMLDivElement, mode: 'drag' | 'draw') {
    this.view = view
    this.mode = mode

    this.app = new App({
      view,
      tree: {
        type: 'viewport',
      },
      // editor: {},
    })

    this.groupTree = new Group({
      x: 0,
      y: 0,
    })

    this.image = new Image({
      x: 0,
      y: 0,
    })

    this.groupTag = new Group({
      x: 0,
      y: 0,
    })

    this.registerListeners()

    this.groupTree.add(this.image)
    this.groupTree.add(this.groupTag)
    this.app.tree.add(this.groupTree)
  }

  private registerListeners() {
    this.image.once(ImageEvent.LOADED, (e: ImageEvent) =>
      this.handleImageLoaded(e)
    )
    this.app.tree.on(LeaferDragEvent.START, (e: LeaferDragEvent) => {
      this.handleDragStart(e)
    })
    this.app.tree.on(LeaferDragEvent.DRAG, (e: LeaferDragEvent) => {
      this.handleDrag(e)
    })
    this.app.tree.on(LeaferDragEvent.END, () => {
      this.handleDragEnd()
    })
  }

  private async handleImageLoaded(e: ImageEvent) {
    this.imageSrcSize = {
      width: e.image.width,
      height: e.image.height,
    }

    // 如果引擎没有初始化完成, 等待引擎ready
    if (!this.app.tree.ready) {
      await (() =>
        new Promise((resolve) => {
          this.app.tree.on(LeaferEvent.READY, () => {
            resolve(true)
          })
        }))()
    }
    this.groupTree.set({
      width: e.image.width,
      height: e.image.height,
      draggable: this.mode === 'drag',
      strokeWidth: 4,
      strokeAlign: 'outside',
      stroke: {
        type: 'solid',
        color: '#333',
      },
    })

    this.image.set({
      width: e.image.width,
      height: e.image.height,
      strokeWidth: 4,
      strokeAlign: 'outside',
      stroke: {
        type: 'solid',
        color: '#32cd79',
      },
    })

    this.groupTag.set({
      width: e.image.width,
      height: e.image.height,
      fill: 'transparent',
      strokeWidth: 4,
      strokeAlign: 'outside',
      stroke: {
        type: 'solid',
        color: '#000',
      },
      zIndex: 10,
    })

    console.log('tree width', this.app.tree.width)
    this.autoFitImage()
  }

  public autoFitImage() {
    const containerWidth = this.app.tree.width ?? this.view.offsetWidth
    const imageWidth = this.image.width ?? this.imageSrcSize.width

    if (imageWidth > containerWidth) {
      this.app.tree.set({
        origin: 'top-left',
      })
      this.app.tree.zoom('fit-width', 50)
    } else {
      this.app.tree.set({
        x: (containerWidth - imageWidth) / 2,
        origin: 'top',
      })
      this.app.tree.zoom(1)
    }
  }

  private handleDragStart(_: LeaferDragEvent) {
    if (this.mode === 'drag') return
    this.tag = new Rect({ editable: true, fill: '#32cd79' })
    this.groupTag.add(this.tag)
  }

  private handleDrag(e: LeaferDragEvent) {
    if (this.tag) {
      let { x, y, width, height } = e.getPageBounds()
      const {
        x: imageX,
        y: imageY,
        width: imageWidth,
        height: imageHeight,
      } = this.image.getBounds('box', 'page')
      if (x < imageX) {
        width = width - Math.abs(x)
        x = imageX
      } else if (x + width > imageWidth) {
        width = imageWidth - x
      }
      if (y < imageY) {
        height = height - Math.abs(y)
        y = imageY
      } else if (y + height > imageHeight) {
        height = imageHeight - y
      }
      this.tag.set({ x, y, width, height })
    }
  }

  private handleDragEnd() {
    if (this.tag) {
      const { width = 0, height = 0 } = this.tag
      if (width <= 10 || height <= 10) {
        this.tag.remove()
      }
    }
  }

  public resize(size: IScreenSizeData) {
    this.app.resize(size)
  }

  public setImage(url: string) {
    this.image.set({ url })
  }

  get getApp() {
    return this.app
  }
  get getGroupTree() {
    return this.groupTree
  }
  get getImage() {
    return this.image
  }
  get getGroupTags() {
    return this.groupTag
  }
  get ready() {
    return this.app.tree.ready
  }
  set setMode(mode: 'drag' | 'draw') {
    this.mode = mode
  }
}

export { Editor }
