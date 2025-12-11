<script lang="ts">
interface Props {
  title?: string
  label?: string
  value?: string
  textArea?: boolean
  okText?: string
  cancelText?: string
}
</script>

<script lang="ts" setup>
const props = defineProps<Props>()
const emit = defineEmits<{
  close: [string | undefined]
  ok: [string, { close: () => void }]
  cancel: [{ close: () => void }]
}>()

const innerValue = ref(props.value)
watch(
  () => props.value,
  (val) => {
    innerValue.value = val
  }
)
</script>

<template>
  <UModal
    :title="props.title"
    @update:open="(isOpen) => !isOpen && emit('close', '')"
  >
    <template #body>
      <UFormField :label="props.label">
        <UTextarea
          v-if="props.textArea"
          v-model="innerValue"
          class="w-full"
          :maxrows="3"
          autoresize
        />
        <UInput v-else v-model="innerValue" class="w-full" />
      </UFormField>
    </template>
    <template #footer>
      <div class="w-full flex items-center justify-end gap-4">
        <UButton color="neutral" variant="ghost" @click="emit('close', '')">
          {{ props.cancelText || 'Cancel' }}
        </UButton>
        <UButton color="primary" @click="emit('close', innerValue)">
          {{ props.okText || 'OK' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
