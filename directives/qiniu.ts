import type { Directive } from 'vue'
import { useImage } from '@vueuse/core'

const doQiniu = async (el, binding) => {
  const qImage = useQiniuImage()
  const { value, arg } = binding

  const isBg = arg === 'background' || arg === 'bg'
  const isLoadingUrl = ref<boolean>(true)
  const url = await qImage.get(value)
  isLoadingUrl.value = false

  const timestamp = new Date().getTime()
  const urlWithTimestamp = `${url}${
    url.includes('?') ? '&' : '?'
  }t=${timestamp}`

  const { isLoading: isLoadingImg, error } = useImage({
    src: urlWithTimestamp,
  })

  function setImage() {
    if (isLoadingUrl.value || isLoadingImg.value) {
      if (isBg) {
        el.style.backgroundImage = `url('https://placehold.co/600x400')`
      } else {
        el.src = 'https://placehold.co/600x400'
      }
    } else if (!isLoadingImg.value) {
      if (isBg) {
        el.style.backgroundImage = `url('${urlWithTimestamp}')`
      } else {
        el.src = urlWithTimestamp
      }
    } else if (error.value) {
      console.log('error', error.value)
      if (isBg) {
        el.style.backgroundImage = `url('https://placehold.co/600x400')`
      } else {
        el.src = 'https://placehold.co/600x400'
      }
    }
  }
  watchEffect(setImage)
}

export const qiniuDirective: Directive = {
  async mounted(el, binding) {
    await doQiniu(el, binding)
  },
  async updated(el, binding) {
    const { value, oldValue } = binding
    if (value === oldValue) return
    await doQiniu(el, binding)
  },
}
