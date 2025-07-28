import { ExportWorkerBells } from './types'
import { Painter } from './src/Painter'
import { Lister } from './src/Lister'

const painter = new Painter()
const lister = new Lister()

painter.on('ready', () => {
  sendMessage(ExportWorkerBells.READY, { status: 'ready' })
})
painter.on('image-loaded', () => {
  sendMessage(ExportWorkerBells.PRE_PAINT, { status: 'ok' })
})
painter.on('image-error', () => {
  sendMessage(`error:${ExportWorkerBells.PAINT}`, { status: 'error' })
})

function sendMessage(bell: string, payload: any, error?: any) {
  if (payload?.data instanceof ImageBitmap) {
    self.postMessage(
      {
        bell,
        result: payload,
        error,
      },
      [payload?.data]
    )
    return
  }
  self.postMessage({ bell, result: payload, error })
}

self.addEventListener('message', (evt: MessageEvent) => {
  console.log('Export worker receive message', evt)
  const { bell, payload } = evt.data
  switch (bell) {
    case ExportWorkerBells.PRE_PAINT:
      painter.setImage(payload.image)
      break
    case ExportWorkerBells.SET_TAGS:
      painter.setTags(payload.tags)
      sendMessage(ExportWorkerBells.SET_TAGS, { status: 'ok' })
      break
    case ExportWorkerBells.PAINT:
      painter.export().then((res) => {
        console.log('Export worker send message', res)
        sendMessage(ExportWorkerBells.PAINT, {
          status: 'ok',
          data: res.data,
        })
      })
      break
    case ExportWorkerBells.GENERATE_XLSX:
      lister.setTags(payload.tags)
      lister.generateXlsx().then((res) => {
        sendMessage(ExportWorkerBells.GENERATE_XLSX, {
          status: 'ok',
          data: res,
        })
      }).catch((error) => {
        sendMessage(`error:${ExportWorkerBells.GENERATE_XLSX}`, {
          status: 'error',
          error,
        })
      })
      break
    default:
      break
  }
})
