import { Platform, type Box, type IBoxInputData, PointerEvent } from 'leafer-ui'
import { assign } from 'lodash-es'
import '@leafer-in/state'

export enum FuncBtnType {
  DELETE = 'delete',
  INFO = 'info',
  OCR = 'ocr',
  LOCK = 'lock',
}

export const deleteNormalSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>',
  'svg'
)
export const deleteActiveSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="#FF3737" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>',
  'svg'
)
export const infoNormalSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="black" d="M12 7q-.825 0-1.412-.587T10 5t.588-1.412T12 3t1.413.588T14 5t-.587 1.413T12 7m0 14q-.625 0-1.062-.437T10.5 19.5v-9q0-.625.438-1.062T12 9t1.063.438t.437 1.062v9q0 .625-.437 1.063T12 21"/></svg>',
  'svg'
)
export const infoActiveSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="#3498DB" d="M12 7q-.825 0-1.412-.587T10 5t.588-1.412T12 3t1.413.588T14 5t-.587 1.413T12 7m0 14q-.625 0-1.062-.437T10.5 19.5v-9q0-.625.438-1.062T12 9t1.063.438t.437 1.062v9q0 .625-.437 1.063T12 21"/></svg>',
  'svg'
)
export const ocrNormalSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE --><path fill="black" d="M2 5v14h12v-2h-2c-1.11 0-2-.89-2-2V9c0-1.11.89-2 2-2h2V5m0 2v2h2V7m-2 2h-2v6h2m0 0v2h2v-2M5 7h2c1.11 0 2 .89 2 2v6c0 1.11-.89 2-2 2H5c-1.11 0-2-.89-2-2V9c0-1.11.89-2 2-2m12 0v10h2v-4h1v1h1v3h2v-3h-1v-2h1V8h-1V7M5 9v6h2V9m12 0h2v2h-2Z"/></svg>',
  'svg'
)
export const ocrActiveSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE --><path fill="#34C759" d="M2 5v14h12v-2h-2c-1.11 0-2-.89-2-2V9c0-1.11.89-2 2-2h2V5m0 2v2h2V7m-2 2h-2v6h2m0 0v2h2v-2M5 7h2c1.11 0 2 .89 2 2v6c0 1.11-.89 2-2 2H5c-1.11 0-2-.89-2-2V9c0-1.11.89-2 2-2m12 0v10h2v-4h1v1h1v3h2v-3h-1v-2h1V8h-1V7M5 9v6h2V9m12 0h2v2h-2Z"/></svg>',
  'svg'
)
export const lockNormalSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><g fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="16" r="1"/><rect width="18" height="12" x="3" y="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></g></svg>',
  'svg'
)
export const lockActiveSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><g fill="none" stroke="#808080" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="16" r="1"/><rect width="18" height="12" x="3" y="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></g></svg>',
  'svg'
)
export const lockOpenSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><g fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="16" r="1"/><rect width="18" height="12" x="3" y="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 9.33-2.5"/></g></svg>',
  'svg'
)
export const lockOpenActiveSVG = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><g fill="none" stroke="#808080" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="16" r="1"/><rect width="18" height="12" x="3" y="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 9.33-2.5"/></g></svg>',
  'svg'
)

export default function FuncBtn(type: FuncBtnType) {
  const baseProps = {
    around: 'center',
    cornerRadius: 4,
    cursor: 'pointer',
    button: true,
  }
  const deleteIcon = {
    tag: 'Image',
    url: deleteNormalSVG,
    width: 20,
    height: 20,
    hoverStyle: { fill: 'red' },
  }
  const infoIcon = {
    tag: 'Image',
    url: infoNormalSVG,
    width: 20,
    height: 20,
  }
  const ocrIcon = {
    tag: 'Image',
    url: ocrNormalSVG,
    width: 20,
    height: 20,
  }
  const lockIcon = {
    tag: 'Image',
    url: lockNormalSVG,
    width: 20,
    height: 20,
  }

  return function <T extends { new (...args: any[]): Box }>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        const props = args[0] || {}
        let children: any[] = []
        switch (type) {
          case FuncBtnType.DELETE:
            children = [deleteIcon]
            break
          case FuncBtnType.INFO:
            children = [infoIcon]
            break
          case FuncBtnType.OCR:
            children = [ocrIcon]
            break
          case FuncBtnType.LOCK:
            children = [lockIcon]
            break
        }
        super(assign({}, baseProps, { children }, props))
        if(type === FuncBtnType.LOCK) {
          console.log('test', this.locked)
          this.children[0].set({ url: this.locked ? lockNormalSVG : lockOpenSVG })
        }
        this.on(PointerEvent.ENTER, () => {
          switch (type) {
            case FuncBtnType.DELETE:
              this.children[0].set({ url: deleteActiveSVG })
              break
            case FuncBtnType.INFO:
              this.children[0].set({ url: infoActiveSVG })
              break
            case FuncBtnType.OCR:
              this.children[0].set({ url: ocrActiveSVG })
              break
            case FuncBtnType.LOCK:
              this.children[0].set({ url: this.locked ? lockActiveSVG : lockOpenActiveSVG })
              break
          }
        })
        this.on(PointerEvent.LEAVE, () => {
          switch (type) {
            case FuncBtnType.DELETE:
              this.children[0].set({ url: deleteNormalSVG })
              break
            case FuncBtnType.INFO:
              this.children[0].set({ url: infoNormalSVG })
              break
            case FuncBtnType.OCR:
              this.children[0].set({ url: ocrNormalSVG })
              break
            case FuncBtnType.LOCK:
              this.children[0].set({ url: this.locked ? lockNormalSVG : lockOpenSVG })
              break
          }
        })
      }
      static one(props: IBoxInputData) {
        return new this(props)
      }
    }
  }
}
