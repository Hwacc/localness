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

self.addEventListener('message', (evt) => {
  console.log('export worker receive message', evt)
  const { bell, payload, type } = evt.data
  switch (bell) {
    case 'set-data':
      console.log('set data', payload)
      break
  }
  if (type === 'async') {
    sendMessage(bell, 'ok')
  }
})

// Notify that the worker is ready
sendMessage('worker-ready', { status: 'ready' })
