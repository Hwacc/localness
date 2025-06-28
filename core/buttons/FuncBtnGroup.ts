import { Group, PointerEvent } from 'leafer-ui'
import { Flow } from '@leafer-in/flow'
import FuncInfoBtn from './FuncInfoBtn'
import FuncOCRBtn from './FuncOCRBtn'
import FuncDeleteBtn from './FuncDeleteBtn'
import { FuncBtnType } from './FuncBtn'
import FuncLockBtn from './FuncLockBtn'

class FuncBtnGroup extends Group {
  private funcBtnFrame: Flow
  public lockBtn: FuncLockBtn
  public infoBtn: FuncInfoBtn
  public ocrBtn: FuncOCRBtn
  public deleteBtn: FuncDeleteBtn

  constructor(...args: any[]) {
    super(...args)

    this.funcBtnFrame = new Flow({
      x: 0,
      y: 0,
      fill: '#f7f7f7',
      cornerRadius: 4,
      padding: 4,
      width: 120,
      height: 28,
      gap: 'auto',
    })

    this.lockBtn = new FuncLockBtn({ verticalAlign: 'middle' })
    this.infoBtn = new FuncInfoBtn({ verticalAlign: 'middle' })
    this.ocrBtn = new FuncOCRBtn({ verticalAlign: 'middle' })
    this.deleteBtn = new FuncDeleteBtn({ verticalAlign: 'middle' })

    this.infoBtn.on(PointerEvent.TAP, () => {
      this.emit('btn-click', { type: FuncBtnType.INFO })
    })
    this.ocrBtn.on(PointerEvent.TAP, () => {
      this.emit('btn-click', { type: FuncBtnType.OCR })
    })
    this.deleteBtn.on(PointerEvent.TAP, () => {
      this.emit('btn-click', { type: FuncBtnType.DELETE })
    })
    this.lockBtn.on(
      'custom-tap',
      ({ payload }: { payload: { locked: boolean } }) => {
        this.emit('btn-click', { type: FuncBtnType.LOCK, payload })
      }
    )

    this.funcBtnFrame.add(this.lockBtn)
    this.funcBtnFrame.add(this.infoBtn)
    this.funcBtnFrame.add(this.ocrBtn)
    this.funcBtnFrame.add(this.deleteBtn)

    this.add(this.funcBtnFrame)
  }
}

export default FuncBtnGroup
