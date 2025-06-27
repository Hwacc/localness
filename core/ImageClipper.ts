class ImageClipper {
  worker: Worker
  ready: boolean = false
  decodeCanvas: HTMLCanvasElement
  decodeCanvasCtx: CanvasRenderingContext2D | null = null
  constructor() {
    this.worker = new Worker('/workers/image-worker.js')
    this.worker.addEventListener('message', (e: MessageEvent) => {
      const { type } = e.data
      switch (type) {
        case 'canvas-ready':
          this.ready = true
          break
      }
    })
    this.worker.postMessage({ type: 'init-canvas' })
    this.decodeCanvas = document.createElement('canvas')
    this.decodeCanvasCtx = this.decodeCanvas.getContext('2d')
  }

  private waitUtilCanvasReady(task: (data: any) => void) {
    const _listener = (e: MessageEvent) => {
      const { type, data } = e.data
      if (type === 'canvas-ready') {
        task(data)
        this.worker.removeEventListener('message', _listener)
      }
    }
    this.worker.addEventListener('message', _listener)
  }

  public setImage(imgUrl: string) {
    const postSetImage = () => {
      const _listener = (e: MessageEvent) => {
        const { type } = e.data
        if (type === 'set-image') {
          this.worker.removeEventListener('message', _listener)
        }
      }
      this.worker.addEventListener('message', _listener)
      this.worker.postMessage({
        type: 'set-image',
        data: { imgUrl },
      })
    }
    if (!this.ready) {
      this.waitUtilCanvasReady(postSetImage)
      return
    }
    postSetImage()
  }

  public async clip({
    x,
    y,
    width,
    height,
  }: {
    x: number
    y: number
    width: number
    height: number
  }) {
    return new Promise((resolve, reject) => {
      const _listener = async (
        e: MessageEvent<{ type: string; data: any }>
      ) => {
        const { type, data: payload } = e.data
        if (type === 'process-image' && payload.operation === 'clip') {
          const bitmap = payload.data as ImageBitmap
          this.decodeCanvas.width = bitmap.width
          this.decodeCanvas.height = bitmap.height
          this.decodeCanvasCtx?.drawImage(bitmap, 0, 0)
          resolve(this.decodeCanvas.toDataURL('image/jpeg', 0.5))
        } else if (type === 'error') {
          reject(payload)
        }
        this.worker.removeEventListener('message', _listener)
      }
      this.worker.addEventListener('message', _listener)
      this.worker.postMessage({
        type: 'process-image',
        data: { operation: 'clip', params: { x, y, width, height } },
      })
    })
  }
}

export default ImageClipper
