<script lang="ts">
type ModalTypes = 'info' | 'delete' | 'warning'

interface Props {
  mode: ModalTypes
  title: string
  message: string
  okText?: string
  loading?: boolean
}
</script>

<script lang="ts" setup>
const props = defineProps<Props>()
const emit = defineEmits<{
  close: [boolean]
  ok: [mode: ModalTypes, { close: () => void }]
}>()

const onCancel = () => {
  emit('close', false)
}
const onOk = () => {
  emit('ok', props.mode, { close: () => emit('close', true) })
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
          label="Cancel"
          :disabled="props.loading"
          color="neutral"
          variant="ghost"
          @click="onCancel"
        />
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
