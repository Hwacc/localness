// Single OffscreenCanvas instance
let canvas = null
let ctx = null
let globalImageData = null

// Initialize the OffscreenCanvas
function initCanvas(width = 300, height = 300) {
  canvas = new OffscreenCanvas(width, height)
  ctx = canvas.getContext('2d', { willReadFrequently: true })
  return true
}

// Set Image from URL
async function setImage(imgUrl) {
  if (!canvas) {
    throw new Error('Canvas not initialized. Call init first.')
  }
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(imgUrl)
      const blob = await response.blob()
      const imageBitmap = await createImageBitmap(blob)
      canvas.width = imageBitmap.width
      canvas.height = imageBitmap.height
      ctx.drawImage(imageBitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve(imageData)
    } catch (error) {
      reject(error)
    }
  })
}

// Process image data
async function processImage(operation, params = {}) {
  if (!ctx) return null
  switch (operation) {
    case 'clip':
      const { x, y, width, height } = params
      const clipedData = ctx.getImageData(x, y, width, height)
      const clipedImageBitmap = await createImageBitmap(clipedData)
      return clipedImageBitmap

    case 'resize':
      const { newWidth, newHeight } = params
      const resizedCanvas = new OffscreenCanvas(newWidth, newHeight)
      const resizedCtx = resizedCanvas.getContext('2d')
      resizedCtx.drawImage(canvas, 0, 0, newWidth, newHeight)
      return resizedCtx.getImageData(0, 0, newWidth, newHeight)

    default:
      return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }
}

function sendMessage(type, payload) {
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

// Handle incoming messages
self.onmessage = async function (e) {
  const { type, data } = e.data
  try {
    switch (type) {
      case 'init-canvas':
        initCanvas()
        sendMessage('canvas-ready', { status: 'ready' })
        break

      case 'set-image': {
        if (!canvas) {
          throw new Error('Canvas not initialized. Call init first.')
        }
        globalImageData = await setImage(data.imgUrl)
        sendMessage('set-image', { status: 'ok' })
        break
      }

      case 'process-image': {
        if (!globalImageData) {
          throw new Error('No image data available. Set image first.')
        }
        const result = await processImage(data.operation, data.params)
        sendMessage('process-image', {
          status: 'ok',
          operation: data.operation,
          data: result,
        })
        break
      }

      case 'get-image-bitmap': {
        if (!globalImageData) {
          throw new Error('No image data available')
        }
        const result = await createImageBitmap(globalImageData)
        sendMessage('get-image-bitmap', { status: 'ok', data: result })
        break
      }

      default:
        throw new Error('Unknown message type: ' + type)
    }
  } catch (error) {
    sendMessage('error', { error: error.message })
  }
}

// Notify that the worker is ready
sendMessage('worker-ready', { status: 'ready' })
