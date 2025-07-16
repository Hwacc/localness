


function sendMessage(type: string, payload: any) {
  if (payload?.data instanceof ImageBitmap) {
    self.postMessage(
      {
        type,
        data: payload,
      },
      [payload?.data]
    )
    return
  }
  self.postMessage({
    type,
    data: payload,
  })
}

// Notify that the worker is ready
sendMessage('worker-ready', { status: 'ready' })