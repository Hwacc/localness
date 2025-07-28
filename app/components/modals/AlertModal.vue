<script lang="ts">
type ModalTypes = 'info' | 'delete' | 'warning'

interface Props {
  mode: ModalTypes
  title?: string
  message?: string
  okText?: string
  cancelText?: string
  loading?: boolean
  interceptCancel?: boolean
  slots?: {
    body?: (props: {
      mode: ModalTypes
      close: (isOk: boolean) => void
      emit: any
    }) => VNode
    footer?: (props: {
      mode: ModalTypes
      close: (isOk: boolean) => void
      emit: any
    }) => VNode
  }
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
  <UModal
    :title="props.title"
    @update:open="(isOpen) => !isOpen && emit('close', false)"
  >
    <template #body>
      <slot
        name="body"
        v-bind="{ close: (isOk: boolean) => emit('close', isOk) }"
      >
        <component
          :is="props.slots?.body?.({
            close: (isOk: boolean) => emit('close', isOk), 
            mode: props.mode,
            emit
          })"
          v-if="props.slots?.body"
        />
        <p v-else>{{ props.message }}</p>
      </slot>
    </template>
    <template #footer>
      <slot
        name="footer"
        v-bind="{ close: (isOk: boolean) => emit('close', isOk) }"
      >
        <component
          :is="props.slots?.footer?.({
            close: (isOk: boolean) => emit('close', isOk), 
            emit,
            mode: props.mode,
          })"
          v-if="props.slots?.footer"
        />
        <div v-else class="w-full flex items-center justify-end gap-4">
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
      </slot>
    </template>
  </UModal>
</template>
