import type { ImageCache } from '~/types/global'
import { FIFOCache } from 'fifo-ttl-cache'

export default defineNuxtPlugin(() => {
  const cache = new FIFOCache<string, ImageCache>(200, Infinity)
  return {
    provide: {
      imageCache: cache,
    },
  }
})
