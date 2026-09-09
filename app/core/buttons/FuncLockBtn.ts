import { Box, PointerEvent } from 'leafer-ui'
import FuncBtn, { FuncBtnType, lockNormalSVG, lockOpenSVG } from './FuncBtn'

@FuncBtn(FuncBtnType.LOCK)
class FuncLockBtn extends Box {
  tagLocked = false
  slocked!: boolean
  constructor(...args: any[]) {
    super(...args)
    Object.defineProperty(this, 'slocked', {
      get: () => this.tagLocked,
      set: (locked: boolean) => {
        this.tagLocked = locked
        this.children[0]?.set({ url: locked ? lockNormalSVG : lockOpenSVG })
      },
    })
    this.on(PointerEvent.TAP, () => {
      this.slocked = !this.slocked
      this.emit('custom-tap', {
        type: FuncBtnType.LOCK,
        payload: { locked: this.tagLocked },
      })
    })
  }
}

export default FuncLockBtn
