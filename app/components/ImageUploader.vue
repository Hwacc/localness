<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type {
  Props as ImagePreviewProps,
  Emits as ImagePreviewEmits,
} from '~/components/ImagePreview.vue'
import { IMAGE_EXTENSIONS, IMAGE_MAX_BYTES } from '#shared/constants'
import { fileExtension } from '#shared/utils/file'

const {
  url = '',
  disabled = false,
  deleteable = true,
  file = undefined,
  autoUpload = false,
  limitSize = 0,
  fallbackText = '',
  class: propsClass = '',
} = defineProps<
  ImagePreviewProps & {
    file?: File
    autoUpload?: boolean
    limitSize?: number
    class?: HTMLAttributes['class']
  }
>()

const emit = defineEmits<
  ImagePreviewEmits & {
    'upload-start': []
    'upload-end': [string]
    error: [any]
  }
>()

const toast = useToast()
const ossUploader = useOSSUpload()

const innerUrl = ref<string | null>(url)
const innerFile = shallowRef<File | undefined>(file)
const previewUrl = computed(() => {
  if (innerUrl.value) return innerUrl.value
  if (innerFile.value) return URL.createObjectURL(innerFile.value)
  return ''
})

const fileInput = shallowRef<HTMLInputElement>()
async function onClick() {
  if (disabled) return
  fileInput.value = document.createElement('input')
  fileInput.value!.type = 'file'
  fileInput.value!.accept = IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(',')
  fileInput.value!.style.display = 'none'
  fileInput.value!.addEventListener('change', onInputChange)
  await nextTick()
  fileInput.value!.click()
}

async function onInputChange(e: any) {
  const _file = e.target?.files[0]
  if (!_file) return
  // Extension, not `type`: the server decides on the extension, so a check on
  // the browser's guessed MIME could pass here and still be rejected there.
  if (!IMAGE_EXTENSIONS.includes(fileExtension(_file.name) as never)) {
    toast.add({
      title: 'Error',
      description: `Only ${IMAGE_EXTENSIONS.join(', ')} images are accepted`,
      color: 'error',
    })
    return
  }
  innerUrl.value = URL.createObjectURL(_file)
  innerFile.value = _file
  if (autoUpload) {
    // auto upload
    try {
      emit('upload-start')
      const res = await handleUpload()
      if (!res) return
      const url = await useApi<string>(`/upload/${res.key}?deadline=1`)
      innerUrl.value = url
      emit('upload-end', url)
    } catch (error) {
      toast.add({
        title: 'Error',
        description: 'Failed to upload image',
        color: 'error',
      })
      emit('error', error)
    }
  }
  fileInput.value = undefined
}

function onDelete() {
  innerUrl.value = ''
  innerFile.value = undefined
  emit('delete')
}

async function handleUpload() {
  if (!innerFile.value) {
    return null
  }
  const maxBytes = limitSize > 0 ? limitSize : IMAGE_MAX_BYTES
  if (innerFile.value.size > maxBytes) {
    toast.add({
      title: 'Error',
      description: `Image must be smaller than ${Math.round(maxBytes / 1024 / 1024)}MB`,
      color: 'error',
    })
    return null
  }
  return await ossUploader.upload(innerFile.value)
}

defineExpose({
  upload: handleUpload,
})
</script>

<template>
  <ImagePreview
    v-if="previewUrl"
    :class="propsClass"
    :url="previewUrl"
    :disabled="disabled"
    :deleteable="deleteable"
    :fallback-text="fallbackText"
    @click="onClick"
    @delete="onDelete"
  />
  <div
    v-else
    :class="
      $cn([
        'w-full aspect-square bg-muted/50 flex items-center justify-center border-1 border-dashed border-muted rounded-md hover:border-highlighted group',
        propsClass,
      ])
    "
    @click="onClick"
  >
    <UIcon
      v-if="!disabled"
      class="text-muted group-hover:text-highlighted"
      name="i-lucide:image-plus"
      size="32"
    />
  </div>
</template>
