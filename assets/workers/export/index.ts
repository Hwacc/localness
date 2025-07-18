import type { IProject } from '~/types/Project'
import { ExportWorkerBells } from './types'
import { Painter } from './src/Painter'

let projectData: IProject

const painter = new Painter()
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
  const { bell, payload, type } = evt.data
  switch (bell) {
    case ExportWorkerBells.SET_DATA:
      projectData = payload
      break
    case ExportWorkerBells.PRE_PAINT:
      painter.setImage(payload.image)
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

    default:
      break
  }
})
