import {
  ImageEvent,
  KeyEvent,
  PropertyEvent,
  DragEvent as LeaferDragEvent,
} from 'leafer-ui'
import EditorBase from './EditorBase'
import {
  EditorMoveEvent,
  EditorRotateEvent,
  EditorScaleEvent,
  EditorSkewEvent,
} from '@leafer-in/editor'

export type EditorMode = 'drag' | 'draw' | 'edit'

abstract class EditorInteraction extends EditorBase {
  protected mode: EditorMode = 'drag'
  constructor(view: HTMLDivElement, mode: EditorMode) {
    super(view)
    this.register()
    this.setMode(mode)
  }

  private register() {
    // tree events
    this.app.tree.on(KeyEvent.DOWN, this.onKeyDown.bind(this))
    this.app.tree.on(KeyEvent.UP, this.onKeyUp.bind(this))
    this.app.tree.on(PropertyEvent.CHANGE, this.onPropertyChange.bind(this))

    // image events
    this.image.once(ImageEvent.LOADED, this.onImageLoaded.bind(this))

    // groupTree events
    this.groupTree.on(LeaferDragEvent.START, this.onGroupDragStart.bind(this))
    this.groupTree.on(LeaferDragEvent.DRAG, this.onGroupDrag.bind(this))
    this.groupTree.on(LeaferDragEvent.END, this.onGroupDragEnd.bind(this))

    if (this.app.editor) {
      this.app.editor.on(EditorMoveEvent.MOVE, this.onEditorMove.bind(this))
      this.app.editor.on(EditorScaleEvent.SCALE, this.onEditorScale.bind(this))
      this.app.editor.on(
        EditorRotateEvent.ROTATE,
        this.onEditorRotate.bind(this)
      )
      this.app.editor.on(EditorSkewEvent.SKEW, this.onEditorSkew.bind(this))
    }
  }

  abstract onKeyDown(e: KeyEvent): void
  abstract onKeyUp(e: KeyEvent): void
  abstract onPropertyChange(e: PropertyEvent): void
  abstract onImageLoaded(e: ImageEvent): void
  abstract onGroupDragStart(e: LeaferDragEvent): void
  abstract onGroupDrag(e: LeaferDragEvent): void
  abstract onGroupDragEnd(e: LeaferDragEvent): void

  protected onEditorMove(e: EditorMoveEvent) {
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
  }

  protected onEditorScale(e: EditorScaleEvent) {
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
  }

  protected onEditorRotate(_: EditorRotateEvent) {
    // 旋转已关闭
  }

  protected onEditorSkew(_: EditorSkewEvent) {
    // 倾斜已关闭
  }

  public setMode(mode: EditorMode) {
    const onModeChange = () => {
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
      this.app.tree.waitReady(onModeChange)
      return
    }
    onModeChange()
  }
}

export default EditorInteraction
