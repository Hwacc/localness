<script setup lang="ts">
defineProps<{
  label: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    class="atlassian-btn inline-flex w-full items-center justify-center gap-2 rounded-[4px] px-3 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    :disabled="disabled"
    @click="emit('click')"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      fill="currentColor"
      class="size-4.5 shrink-0 text-white"
      aria-hidden="true"
    >
      <path
        d="M35.6 108.3H15.8c-1.9 0-3.1-1.9-2.2-3.6L48.9 22c.9-1.8 3.5-1.8 4.4 0l14.3 28.7-32 57.6z"
      />
      <path
        d="M92.4 108.3h19.8c1.9 0 3.1-1.9 2.2-3.6L65.6 8.1c-.9-1.8-3.5-1.8-4.4 0L46.9 36.8l45.5 71.5z"
        opacity="0.55"
      />
    </svg>
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.atlassian-btn {
  background-color: #0052cc;
}
.atlassian-btn:hover:not(:disabled) {
  background-color: #0065ff;
}
.atlassian-btn:focus-visible {
  outline: 2px solid #4c9aff;
  outline-offset: 2px;
}
</style>
