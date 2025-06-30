import {
  ImageEvent,
  KeyEvent,
  PropertyEvent,
  DragEvent as LeaferDragEvent,
} from 'leafer-ui'
import EditorBase from './EditorBase'
import {
  EditorEvent,
  EditorMoveEvent,
  EditorRotateEvent,
  EditorScaleEvent,
  EditorSkewEvent,
} from '@leafer-in/editor'
import '@leafer-in/find'

export type EditorMode = 'drag' | 'draw' | 'edit'

abstract class EditorInteraction extends EditorBase {
  protected mode: EditorMode = 'drag'
  protected isCtrlHolding = false

  constructor(view: HTMLDivElement, mode: EditorMode) {
    super(view)
    this.register()
    this.setMode(mode)
  }

  private register() {
    // tree events
    this.app.tree.on(KeyEvent.DOWN, this.onKeyDown.bind(this))
    this.app.tree.on(KeyEvent.HOLD, this.onKeyHold.bind(this))
    this.app.tree.on(KeyEvent.UP, this.onKeyUp.bind(this))
    this.app.tree.on(PropertyEvent.CHANGE, this.onPropertyChange.bind(this))

    // image events
    this.registerImageEvents()
    
    // groupTree events
    this.groupTree.on(LeaferDragEvent.START, this.onGroupDragStart.bind(this))
    this.groupTree.on(LeaferDragEvent.DRAG, this.onGroupDrag.bind(this))
    this.groupTree.on(LeaferDragEvent.END, this.onGroupDragEnd.bind(this))

    if (this.app.editor) {
      this.app.editor.on(EditorEvent.SELECT, this.onEditorSelect.bind(this))
      this.app.editor.on(EditorMoveEvent.MOVE, this.onEditorMove.bind(this))
      this.app.editor.on(EditorScaleEvent.SCALE, this.onEditorScale.bind(this))
      this.app.editor.on(
        EditorRotateEvent.ROTATE,
        this.onEditorRotate.bind(this)
      )
      this.app.editor.on(EditorSkewEvent.SKEW, this.onEditorSkew.bind(this))
    }
  }

  protected registerImageEvents() {
    this.image.on(ImageEvent.LOAD, this.onImageLoaded.bind(this))
    this.image.on(ImageEvent.LOADED, this.onImageLoaded.bind(this))
    this.image.on(ImageEvent.ERROR, this.onImageLoaded.bind(this))
  }

  abstract onPropertyChange(e: PropertyEvent): void
  abstract onImageLoad(e: ImageEvent): void
  abstract onImageLoaded(e: ImageEvent): void
  abstract onImageError(e: ImageEvent): void
  abstract onGroupDragStart(e: LeaferDragEvent): void
  abstract onGroupDrag(e: LeaferDragEvent): void
  abstract onGroupDragEnd(e: LeaferDragEvent): void
  abstract onEditorMove(e: EditorMoveEvent): void
  abstract onEditorScale(e: EditorScaleEvent): void
  abstract onEditorRotate(e: EditorRotateEvent): void
  abstract onEditorSkew(e: EditorSkewEvent): void
  abstract onEditorSelect(e: EditorEvent): void

  abstract onKeyDown(e: KeyEvent): void
  abstract onKeyHold(e: KeyEvent): void
  abstract onKeyUp(e: KeyEvent): void

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

  public findOneTagByTagID(tagID: string) {
    return this.groupTag.findOne(tagID)
  }
}

export default EditorInteraction
