import type { Directive } from 'vue'
import { useImage } from '@vueuse/core'
import { hasProtocol } from 'ufo'
import { OSSEngine } from '#shared/constants'
import { runInNuxtApp } from '~/utils/nuxt-app'

const doImage = async (el: HTMLElement, binding: any) => {
  const { ossEngine, ossBaseUrl } = useRuntimeConfig().public
  const ossImage = useOSSImage()
  const { value, arg } = binding

  const isBg = arg === 'background' || arg === 'bg'
  if (isBg) {
    el.style.backgroundImage = `url("${IMAGE_LOADING_PLACEHOLDER}")`
  } else {
    ;(el as HTMLImageElement).src = IMAGE_LOADING_PLACEHOLDER
  }
  let url = value

  if (ossEngine === OSSEngine.LOCAL) {
    // Empty ossBaseUrl is a prefix of every string — do not skip resolve.
    const hasLocalPrefix = Boolean(ossBaseUrl) && value.startsWith(ossBaseUrl)
    if (!hasProtocol(value) && !hasLocalPrefix) {
      url = await ossImage.get(value)
    }
  } else {
    if (!hasProtocol(value)) {
      url = await ossImage.get(value)
    }
  }

  if (isBg) {
    const { isLoading, error } = await useImage({ src: url })
    watchEffect(() => {
      if (!isLoading.value && !error.value) {
        el.style.backgroundImage = `url('${url}')`
      } else if (!isLoading.value && error.value) {
        console.error('image load error', error.value)
        el.style.backgroundImage = `url("${IMAGE_ERROR_PLACEHOLDER}")`
      }
    })
  } else {
    ;(el as HTMLImageElement).src = url
    ;(el as HTMLImageElement).onerror = (e) => {
      console.error('image load error', e)
      // Clear the handler first: if the placeholder itself ever failed this
      // would loop on every error.
      ;(el as HTMLImageElement).onerror = null
      ;(el as HTMLImageElement).src = IMAGE_ERROR_PLACEHOLDER
    }
  }
}

export const ossImageDirective: Directive = {
  async mounted(el, binding) {
    await runInNuxtApp(() => doImage(el, binding))
  },
  async updated(el, binding) {
    const { value, oldValue } = binding
    if (value === oldValue) return
    await runInNuxtApp(() => doImage(el, binding))
  },
}
