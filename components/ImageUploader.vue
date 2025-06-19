<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { Props as ImagePreviewProps } from '~/components/ImagePreview.vue'

const {
  url = '',
  disabled = false,
  deleteable = true,
  file = undefined,
  autoUpload = false,
  class: propsClass = '',
} = defineProps<
  ImagePreviewProps & {
    file?: File
    autoUpload?: boolean
    class?: HTMLAttributes['class']
  }
>()

const toast = useToast()

const innerUrl = ref<string>(url)
const innerFile = shallowRef<File | undefined>(file)
const previewUrl = computed(() => {
  if (innerUrl.value) return innerUrl.value
  if (innerFile.value) return URL.createObjectURL(innerFile.value)
  return ''
})

function onInputChange(e: any) {
  const _file = e.target?.files[0]
  if (!_file) return
  if (_file.type.indexOf('image') < 0) {
    toast.add({
      title: 'Error',
      description: 'File is not an image',
      color: 'error',
    })
    return
  }
  innerUrl.value = URL.createObjectURL(_file)
  innerFile.value = _file
  if (autoUpload) {
    //TODO: upload
  }
}

async function onClick() {
  if (disabled) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.style.display = 'none'
  input.addEventListener('change', onInputChange)
  await nextTick()
  input.click()
}
</script>

<template>
  <div>
    <ImagePreview
      v-if="previewUrl"
      :class="propsClass"
      :url="previewUrl"
      :disabled="disabled"
      :deleteable="deleteable"
      @click="onClick"
    />
    <div
      v-else
      :class="[
        'w-full aspect-square bg-gray-50/50 flex items-center justify-center border-1 border-dashed border-gray-200 rounded-md hover:border-black',
        propsClass,
      ]"
      @click="onClick"
    >
      <UButton v-if="!disabled" color="neutral" label="Upload Image" />
    </div>
  </div>
</template>
