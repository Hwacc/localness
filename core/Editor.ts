import {
  App,
  Box,
  Group,
  Image,
  ImageEvent,
  KeyEvent,
  DragEvent as LeaferDragEvent,
  LeaferEvent,
  Platform,
  PropertyEvent,
  Rect,
  PointerEvent,
  type IScreenSizeData,
  type IUI,
} from 'leafer-ui'
import '@leafer-in/view'
import '@leafer-in/viewport'
import '@leafer-in/export'
import { debounce, isEmpty } from 'lodash-es'
import EditorBase from './EditorBase'
import {
  EditorMoveEvent,
  EditorRotateEvent,
  EditorScaleEvent,
} from '@leafer-in/editor'
import { DotMatrix } from 'leafer-x-dot-matrix'

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
  private editorDeleteButton: Box
  private editorInfoButton: Box
  private lineWidth = 2
  private dotMatrix: DotMatrix

  constructor(view: HTMLDivElement, mode: EditorMode) {
    super()
    this.view = view
    this.app = new App({
      view,
      tree: {
        type: 'viewport',
      },
      editor: {
        buttonsDirection: 'top',
        buttonsFixed: true,
        buttonsMargin: 8,
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

    this.editorDeleteButton = Box.one({
      around: 'center',
      cornerRadius: 9999,
      fill: '#FF3B30',
      cursor: 'pointer',
      x: 32,
      y: 0,
      children: [
        {
          tag: 'Image',
          url: Platform.toURL(
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>',
            'svg'
          ),
          width: 18,
          height: 18,
        },
      ],
    }) as Box

    this.editorInfoButton = Box.one({
      around: 'center',
      cornerRadius: 9999,
      fill: '#4689F5',
      cursor: 'pointer',
      x: 0,
      y: 0,
      children: [
        {
          tag: 'Image',
          url: Platform.toURL(
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="currentColor" d="M12 7q-.825 0-1.412-.587T10 5t.588-1.412T12 3t1.413.588T14 5t-.587 1.413T12 7m0 14q-.625 0-1.062-.437T10.5 19.5v-9q0-.625.438-1.062T12 9t1.063.438t.437 1.062v9q0 .625-.437 1.063T12 21"/></svg>',
            'svg'
          ),
          width: 18,
          height: 18,
        },
      ],
    }) as Box

    this.setMode(mode)
    this.registerListeners()
    this.groupTree.add(this.image)
    this.groupTree.add(this.groupTag)
    this.app.tree.add(this.groupTree)
    this.app.editor.buttons.add(this.editorDeleteButton)
    this.app.editor.buttons.add(this.editorInfoButton)

    this.dotMatrix = new DotMatrix(this.app)
    this.dotMatrix.enableDotMatrix(true)

    this.idCounter = 0
  }

  private registerListeners() {
    // tree events
    this.app.tree.on(LeaferEvent.READY, () => {
      this.emit('ready')
    })
    this.app.tree.on(KeyEvent.DOWN, this.handleKeyDown.bind(this))
    this.app.tree.on(KeyEvent.UP, this.handleKeyUp.bind(this))
    this.app.tree.on(PropertyEvent.CHANGE, (e: PropertyEvent) => {
      if (e.attrName === 'scaleX') {
        this.emit('scale-change', parseFloat((e.newValue as number).toFixed(2)))
      }
    })

    // image events
    this.image.once(ImageEvent.LOADED, this.handleImageLoaded.bind(this))

    // groupTree events
    this.groupTree.on(LeaferDragEvent.START, this.handleDragStart.bind(this))
    this.groupTree.on(LeaferDragEvent.DRAG, this.handleDrag.bind(this))
    this.groupTree.on(LeaferDragEvent.END, this.handleDragEnd.bind(this))

    // editor events
    this.editorDeleteButton.on(
      PointerEvent.TAP,
      this.handleDeleteClick.bind(this)
    )
    this.editorInfoButton.on(PointerEvent.TAP, this.handleInfoClick.bind(this))
    const debounceTagChangeEvent = debounce(
      (action: string, target: IUI) => {
        this.emit('tag-change', { action, tag: target.toJSON() })
      },
      200,
      {
        leading: false,
        trailing: true,
      }
    )
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
      debounceTagChangeEvent('move', target)
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
      debounceTagChangeEvent('scale', target)
    })
    this.app.editor.on(EditorRotateEvent.ROTATE, (e: EditorRotateEvent) => {
      const { target } = e
      debounceTagChangeEvent('rotate', target)
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
      })

      this.image.set({
        width: e.image.width,
        height: e.image.height,
      })

      this.groupTag.set({
        width: e.image.width,
        height: e.image.height,
        fill: 'transparent',
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
      fill: 'transparent',
      cornerRadius: 4,
      stroke: {
        type: 'linear',
        from: 'left',
        to: 'right',
        stops: [
          { offset: 0, color: '#FEB027' },
          { offset: 1, color: '#79CB4D' },
        ],
      },
      strokeWidth: this.lineWidth,
      editable: false,
    })
    this.tag.on(PointerEvent.DOUBLE_TAP, () => this.handleInfoClick())
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
      } else {
        this.emit('tag-add', this.tag.toJSON())
      }
    }
    this.tag = null
  }

  private handleDeleteClick() {
    if (isEmpty(this.app.editor.list)) return
    const target = this.app.editor.list.pop()
    this.emit('tag-remove', target?.toJSON())
    target?.remove()
    this.app.editor.target = undefined
  }

  private handleInfoClick() {
    if (!isEmpty(this.app.editor.list)) {
      this.emit('tag-info', this.app.editor.list[0].toJSON())
    }
  }

  private handleKeyDown() {}
  private handleKeyUp(e: KeyEvent) {
    const key = e.key
    if (key === 'Delete') {
      this.handleDeleteClick()
    }
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

  public setLineWidth(width: number) {
    this.lineWidth = width
  }

  public get ready() {
    return this.app.tree.ready
  }
}

export { Editor }
