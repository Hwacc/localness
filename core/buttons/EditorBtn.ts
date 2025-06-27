import { Platform, type Box, type IBoxInputData, PointerEvent } from 'leafer-ui'
import { assign } from 'lodash-es'
import '@leafer-in/state'

export type EditorBtnType = 'delete' | 'info' | 'ocr'

const deleteNormal = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>',
  'svg'
)
const deleteActive = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><path fill="none" stroke="#FF3737" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>',
  'svg'
)
const infoNormal = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="black" d="M12 7q-.825 0-1.412-.587T10 5t.588-1.412T12 3t1.413.588T14 5t-.587 1.413T12 7m0 14q-.625 0-1.062-.437T10.5 19.5v-9q0-.625.438-1.062T12 9t1.063.438t.437 1.062v9q0 .625-.437 1.063T12 21"/></svg>',
  'svg'
)
const infoActive = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="#3498DB" d="M12 7q-.825 0-1.412-.587T10 5t.588-1.412T12 3t1.413.588T14 5t-.587 1.413T12 7m0 14q-.625 0-1.062-.437T10.5 19.5v-9q0-.625.438-1.062T12 9t1.063.438t.437 1.062v9q0 .625-.437 1.063T12 21"/></svg>',
  'svg'
)
const ocrNormal = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE --><path fill="black" d="M2 5v14h12v-2h-2c-1.11 0-2-.89-2-2V9c0-1.11.89-2 2-2h2V5m0 2v2h2V7m-2 2h-2v6h2m0 0v2h2v-2M5 7h2c1.11 0 2 .89 2 2v6c0 1.11-.89 2-2 2H5c-1.11 0-2-.89-2-2V9c0-1.11.89-2 2-2m12 0v10h2v-4h1v1h1v3h2v-3h-1v-2h1V8h-1V7M5 9v6h2V9m12 0h2v2h-2Z"/></svg>',
  'svg'
)
const ocrActive = Platform.toURL(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE --><path fill="#34C759" d="M2 5v14h12v-2h-2c-1.11 0-2-.89-2-2V9c0-1.11.89-2 2-2h2V5m0 2v2h2V7m-2 2h-2v6h2m0 0v2h2v-2M5 7h2c1.11 0 2 .89 2 2v6c0 1.11-.89 2-2 2H5c-1.11 0-2-.89-2-2V9c0-1.11.89-2 2-2m12 0v10h2v-4h1v1h1v3h2v-3h-1v-2h1V8h-1V7M5 9v6h2V9m12 0h2v2h-2Z"/></svg>',
  'svg'
)

export default function EditorBtn(type: EditorBtnType) {
  const baseProps = {
    around: 'center',
    cornerRadius: 4,
    cursor: 'pointer',
    button: true,
  }
  const deleteIcon = {
    tag: 'Image',
    url: deleteNormal,
    width: 20,
    height: 20,
    hoverStyle: { fill: 'red' },
  }
  const infoIcon = {
    tag: 'Image',
    url: infoNormal,
    width: 20,
    height: 20,
  }
  const ocrIcon = {
    tag: 'Image',
    url: ocrNormal,
    width: 20,
    height: 20,
  }

  return function <T extends { new (...args: any[]): Box }>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        const props = args[0] || {}
        let children: any[] = []
        switch (type) {
          case 'delete':
            children = [deleteIcon]
            break
          case 'info':
            children = [infoIcon]
            break
          case 'ocr':
            children = [ocrIcon]
            break
        }
        super(assign({}, baseProps, { children }, props))
        this.on(PointerEvent.ENTER, () => {
          if (type === 'delete') this.children[0].set({ url: deleteActive })
          if (type === 'info') this.children[0].set({ url: infoActive })
          if (type === 'ocr') this.children[0].set({ url: ocrActive })
        })
        this.on(PointerEvent.LEAVE, () => {
          if (type === 'delete') this.children[0].set({ url: deleteNormal })
          if (type === 'info') this.children[0].set({ url: infoNormal })
          if (type === 'ocr') this.children[0].set({ url: ocrNormal })
        })
      }
      static one(props: IBoxInputData) {
        return new this(props)
      }
    }
  }
}
