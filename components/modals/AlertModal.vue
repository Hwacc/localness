<script lang="ts">
type ModalTypes = 'info' | 'delete' | 'warning'

interface Props {
  mode: ModalTypes
  title: string
  message: string
  okText?: string
  cancelText?: string
  loading?: boolean
  interceptCancel?: boolean
}
</script>

<script lang="ts" setup>
const props = defineProps<Props>()
const emit = defineEmits<{
  close: [boolean]
  ok: [mode: ModalTypes, { close: () => void }]
  cancel: [mode: ModalTypes, { close: () => void }]
}>()

const onOk = () => {
  emit('ok', props.mode, { close: () => emit('close', true) })
}

const onCancel = () => {
  if (props.interceptCancel) {
    emit('cancel', props.mode, { close: () => emit('close', true) })
  } else {
    emit('close', false)
  }
}
</script>

<template>
  <UModal :close="{ onClick: () => emit('close', false) }" :title="props.title">
    <template #body>
      <p>{{ props.message }}</p>
    </template>
    <template #footer>
      <div class="w-full flex items-center justify-end gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="!props.interceptCancel && props.loading"
          :loading="props.interceptCancel && props.loading"
          @click="onCancel"
        >
          {{ props.cancelText || 'Cancel' }}
        </UButton>
        <UButton
          v-if="props.mode === 'info'"
          :loading="props.loading"
          @click="onOk"
        >
          {{ props.okText || 'OK' }}
        </UButton>
        <UButton
          v-if="props.mode === 'delete'"
          color="error"
          :loading="props.loading"
          @click="onOk"
        >
          {{ props.okText || 'Delete' }}
        </UButton>
        <UButton
          v-if="props.mode === 'warning'"
          color="warning"
          :loading="props.loading"
          @click="onOk"
        >
          {{ props.okText || 'OK' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
