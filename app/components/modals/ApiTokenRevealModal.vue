<script setup lang="ts">
const props = defineProps<{
  token: string
  name: string
  /**
   * Run when the modal is dismissed, before it closes. `overlay.create` keeps
   * the props it was opened with in the app-wide overlay store, and closing does
   * not clear them — so the plaintext has to be wiped there explicitly.
   */
  onDismiss?: () => void
}>()

const emit = defineEmits<{
  close: [boolean]
}>()

const toast = useToast()

/**
 * Only one exit, so both paths land here: the Dismiss button, and the
 * `update:open` that the overlay's close handler feeds back. First one wins.
 */
let dismissed = false
function dismiss() {
  if (dismissed) return
  dismissed = true
  props.onDismiss?.()
  emit('close', false)
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.token)
    toast.add({
      title: 'Token copied',
      color: 'success',
      icon: 'i-lucide:check',
    })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}
</script>

<template>
  <UModal
    title="Copy this token now"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-lg' }"
    @update:open="(isOpen) => !isOpen && dismiss()"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted">
          This is the only time
          <span class="font-medium text-default">{{ props.name }}</span>
          is shown. The server keeps only a hash, so there is no way to display
          it again.
        </p>
        <div class="flex items-center gap-2">
          <code
            class="flex-1 min-w-0 truncate rounded bg-elevated/60 p-2 text-xs"
            >{{ props.token }}</code
          >
          <UButton
            size="xs"
            icon="i-lucide:copy"
            @click="copy"
          >
            Copy
          </UButton>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex items-center justify-end">
        <UButton @click="dismiss">Dismiss</UButton>
      </div>
    </template>
  </UModal>
</template>
