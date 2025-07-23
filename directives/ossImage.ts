import type { Directive } from 'vue'
import { useImage } from '@vueuse/core'
import { hasProtocol } from 'ufo'
import { OSSEngine } from '~/constants'

const doImage = async (el: HTMLElement, binding: any) => {
  const { ossEngine, ossBaseUrl } = useRuntimeConfig().public
  const ossImage = useOSSImage()
  const { value, arg } = binding

  const isBg = arg === 'background' || arg === 'bg'
  if (isBg) {
    el.style.backgroundImage = `url('http://iph.href.lu/600x400?text=Loading...')`
  } else {
    ;(el as HTMLImageElement).src = 'http://iph.href.lu/600x400?text=Loading...'
  }
  let url = value

  if (ossEngine === OSSEngine.LOCAL) {
    if (!hasProtocol(value) && !value.startsWith(ossBaseUrl)) {
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
        el.style.backgroundImage = `url('http://iph.href.lu/600x400?text=Error')`
      }
    })
  } else {
    ;(el as HTMLImageElement).src = url
    ;(el as HTMLImageElement).onerror = (e) => {
      console.error('image load error', e)
      ;(el as HTMLImageElement).src =
        'http://iph.href.lu/600x400?fg=666666&bg=f4cccc&&text=Error'
    }
  }
}

export const ossImageDirective: Directive = {
  async mounted(el, binding) {
    await doImage(el, binding)
  },
  async updated(el, binding) {
    const { value, oldValue } = binding
    if (value === oldValue) return
    await doImage(el, binding)
  },
}
