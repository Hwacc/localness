import { Group, PointerEvent } from 'leafer-ui'
import { Flow } from '@leafer-in/flow'
import EditorInfoBtn from './EditorInfoBtn'
import EditorOCRBtn from './EditorOCRBtn'
import EditorDeleteBtn from './EditorDeleteBtn'

class EditorBtnGroup extends Group {
  private FuncBtnFrame: Flow
  private infoBtn: EditorInfoBtn
  private ocrBtn: EditorOCRBtn
  private deleteBtn: EditorDeleteBtn

  constructor(...args: any[]) {
    super(...args)

    this.FuncBtnFrame = new Flow({
      x: 0,
      y: 0,
      fill: '#f7f7f7',
      cornerRadius: 4,
      padding: 4,
      width: 100,
      height: 28,
      gap: 'auto'
    })

    this.infoBtn = new EditorInfoBtn({verticalAlign: 'middle'})
    this.ocrBtn = new EditorOCRBtn({verticalAlign: 'middle'})
    this.deleteBtn = new EditorDeleteBtn({verticalAlign: 'middle'})

    this.infoBtn.on(PointerEvent.TAP, () => {})
    this.ocrBtn.on(PointerEvent.TAP, () => {})
    this.deleteBtn.on(PointerEvent.TAP, () => {})

    this.FuncBtnFrame.add(this.infoBtn)
    this.FuncBtnFrame.add(this.ocrBtn)
    this.FuncBtnFrame.add(this.deleteBtn)

    this.add(this.FuncBtnFrame)
  }
}

export default EditorBtnGroup
