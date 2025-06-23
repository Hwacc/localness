<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type {
  Props as ImagePreviewProps,
  Emits as ImagePreviewEmits,
} from '~/components/ImagePreview.vue'

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

const emit = defineEmits<
  ImagePreviewEmits & {
    'upload-start': []
    'upload-end': [string]
    error: [any]
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

const fileInput = shallowRef<HTMLInputElement>()
async function onClick() {
  if (disabled) return
  fileInput.value = document.createElement('input')
  fileInput.value!.type = 'file'
  fileInput.value!.accept = 'image/*'
  fileInput.value!.style.display = 'none'
  fileInput.value!.addEventListener('change', onInputChange)
  await nextTick()
  fileInput.value!.click()
}

async function onInputChange(e: any) {
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
    // auto upload
    try {
      emit('upload-start')
      const res = await handleUpload()
      if (!res) return
      const url = await useApi<string>('/api/common/gen-access-url', {
        method: 'POST',
        body: {
          key: res.key,
          deadline: 1,
        },
      })
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
  const uploadToken = await useApi<string>('/api/common/upload-token')
  if (!uploadToken) return null
  const res = await useQiniuUpload(innerFile.value, uploadToken)
  return res
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
    @click="onClick"
    @delete="onDelete"
  />
  <div
    v-else
    :class="
      $cn([
        'w-full aspect-square bg-gray-50/50 flex items-center justify-center border-1 border-dashed border-gray-200 rounded-md hover:border-black group',
        propsClass,
      ])
    "
    @click="onClick"
  >
    <UIcon v-if="!disabled" class="text-gray-200 group-hover:text-black" name="i-lucide:image-plus" size="32" />
  </div>
</template>
