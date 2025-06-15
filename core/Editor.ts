import {
  App,
  Group,
  Image,
  ImageEvent,
  DragEvent as LeaferDragEvent,
  LeaferEvent,
  PropertyEvent,
  Rect,
  type IScreenSizeData,
} from 'leafer-ui'
import '@leafer-in/view'
import '@leafer-in/viewport'
import { isEmpty } from 'lodash-es'
import EditorBase from './EditorBase'
import { EditorMoveEvent, EditorScaleEvent } from '@leafer-in/editor'

export type EditorMode = 'drag' | 'draw' | 'edit'
class Editor extends EditorBase {
  private tag: Rect | null = new Rect()
  private view: HTMLDivElement
  private mode: EditorMode = 'drag'
  private imageSrcSize: { width: number; height: number } = {
    width: 0,
    height: 0,
  }
  private idCounter = 0

  constructor(view: HTMLDivElement, mode: EditorMode) {
    super()
    this.view = view
    this.app = new App({
      view,
      tree: {
        type: 'viewport',
      },
      editor: {
        beforeScale({ scaleX, scaleY }) {
          // 关闭镜像翻转
          if (scaleX < 0 || scaleY < 0) return false
          return { scaleX, scaleY }
        },
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

    this.groupTag = new Group({
      x: 0,
      y: 0,
    })

    this.setMode(mode)
    this.registerListeners()
    this.groupTree.add(this.image)
    this.groupTree.add(this.groupTag)
    this.app.tree.add(this.groupTree)

    this.idCounter = 0
  }

  private registerListeners() {
    this.app.tree.on(LeaferEvent.READY, () => {
      this.emit('ready')
    })
    this.image.once(ImageEvent.LOADED, this.handleImageLoaded.bind(this))
    this.groupTree.on(LeaferDragEvent.START, this.handleDragStart.bind(this))
    this.groupTree.on(LeaferDragEvent.DRAG, this.handleDrag.bind(this))
    this.groupTree.on(LeaferDragEvent.END, this.handleDragEnd.bind(this))
    this.app.tree.on(PropertyEvent.CHANGE, (e: PropertyEvent) => {
      if (e.attrName === 'scaleX') {
        this.emit('scale-change', parseFloat((e.newValue as number).toFixed(2)))
      }
    })
    this.app.editor.on(EditorMoveEvent.MOVE, (e: EditorMoveEvent) => {
      const { target, moveX, moveY } = e
      const targetX = target.x ?? 0 + moveX
      const targetY = target.y ?? 0 + moveY
      if (targetX < 0) {
        target.set({ x: 0 })
      }
      if (targetX + (target.width ?? 0) > (this.groupTree.width ?? 0)) {
        target.set({ x: (this.groupTree.width ?? 0) - (target.width ?? 0) })
      }
      if (targetY < 0) {
        target.set({ y: 0 })
      }
      if (targetY + (target.height ?? 0) > (this.groupTree.height ?? 0)) {
        target.set({ y: (this.groupTree.height ?? 0) - (target.height ?? 0) })
      }
    })
    this.app.editor.on(EditorScaleEvent.SCALE, (e: EditorScaleEvent) => {
      const { target } = e
      const targetX = target.x ?? 0
      const targetY = target.y ?? 0
      if (targetX < 0) {
        target.set({
          x: 0,
          width: target.width ? target.width - Math.abs(targetX) : 0,
        })
      }
      if (targetX + (target.width ?? 0) > (this.groupTree.width ?? 0)) {
        target.set({
          x: targetX,
          width: this.groupTree.width
            ? this.groupTree.width - Math.abs(targetX)
            : 0,
        })
      }
      if (targetY < 0) {
        target.set({
          y: 0,
          height: target.height ? target.height - Math.abs(targetY) : 0,
        })
      }
      if (targetY + (target.height ?? 0) > (this.groupTree.height ?? 0)) {
        target.set({
          y: targetY,
          height: this.groupTree.height
            ? this.groupTree.height - Math.abs(targetY)
            : 0,
        })
      }
    })
  }

  private handleImageLoaded(e: ImageEvent) {
    this.imageSrcSize = {
      width: e.image.width,
      height: e.image.height,
    }
    const initElementsSize = () => {
      this.groupTree.set({
        width: e.image.width,
        height: e.image.height,
        draggable: this.mode === 'drag',
        strokeWidth: 4,
        strokeAlign: 'inside',
        stroke: {
          type: 'solid',
          color: '#333',
        },
      })

      this.image.set({
        width: e.image.width,
        height: e.image.height,
        strokeWidth: 4,
        strokeAlign: 'inside',
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
        strokeAlign: 'inside',
        stroke: {
          type: 'solid',
          color: '#000',
        },
        zIndex: 10,
      })
      this.autoFitImage()
    }
    if (!this.app.tree.ready) {
      this.app.tree.waitReady(initElementsSize)
    } else {
      initElementsSize()
    }
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
        y: 50,
        origin: 'top',
      })
      this.app.tree.set({ scale: 1 })
    }
  }

  private handleDragStart() {
    if (this.mode !== 'draw' || !isEmpty(this.app.editor.list)) return
    this.app.editor.visible = false
    this.app.editor.hittable = false
    this.tag = new Rect({
      id: `Tag${this.idCounter++}`,
      className: 'tag',
      fill: '#32cd79',
      editable: false,
    })
    this.groupTag.add(this.tag)
  }

  private handleDrag(e: LeaferDragEvent) {
    if (this.mode !== 'draw') return
    if (this.tag) {
      let { x, y, width, height } = e.getPageBounds()

      const {
        x: imageX,
        y: imageY,
        width: imageWidth,
        height: imageHeight,
      } = this.image.getBounds('box', 'local')

      // 减去groupTree的偏移量
      x = x - (this.groupTree.x ?? 0)
      y = y - (this.groupTree.y ?? 0)

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
    if (this.mode !== 'draw') return
    if (this.tag) {
      this.app.editor.visible = true
      this.app.editor.hittable = true
      this.tag.set({ editable: true })
      const { width = 0, height = 0 } = this.tag
      if (width <= 10 || height <= 10) {
        this.tag.remove()
      }
    }
    this.tag = null
  }

  public resize(size: IScreenSizeData) {
    this.app.resize(size)
  }
  public setImage(url: string) {
    this.image.set({ url })
  }
  public setMode(mode: EditorMode) {
    const handleModeChange = () => {
      if (mode === 'drag') {
        this.app.editor.visible = false
        this.app.editor.hittable = false
        this.app.editor.cancel()
      } else {
        this.app.editor.visible = true
        this.app.editor.hittable = true
      }
      this.groupTree.set({ draggable: mode === 'drag' })
      this.mode = mode
      this.emit('mode-change', mode)
    }
    if (!this.app.tree.ready) {
      this.app.tree.waitReady(handleModeChange)
      return
    }
    handleModeChange()
  }
  public setScale(scale: number) {
    if (!this.app.tree.ready) {
      this.app.tree.waitReady(() => this.app.tree.set({ scale }))
      return
    }
    this.app.tree.set({ scale })
  }
  public get ready() {
    return this.app.tree.ready
  }
}

export { Editor }
