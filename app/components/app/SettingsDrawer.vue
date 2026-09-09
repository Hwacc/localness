<script setup lang="ts">
const colorMode = useColorMode()
const open = ref(false)

const themeOptions = [
  { value: 'light', label: 'Light', icon: 'i-lucide:sun', hint: 'Always use light theme' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide:moon', hint: 'Always use dark theme' },
  { value: 'system', label: 'System', icon: 'i-lucide:monitor', hint: 'Follow the OS setting' },
] as const

function setTheme(value: (typeof themeOptions)[number]['value']) {
  colorMode.preference = value
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Settings"
    description="App preferences. More options will land here later."
    side="left"
    :close="{ icon: 'i-lucide:x' }"
    :ui="{ body: 'p-4 sm:p-4', header: 'p-4 sm:p-4' }"
    class="max-w-sm"
  >
    <UTooltip text="Settings" :content="{ side: 'right' }">
      <UButton
        icon="i-lucide:settings"
        size="md"
        color="neutral"
        variant="ghost"
      />
    </UTooltip>
    <template #body>
      <section class="flex flex-col gap-3">
        <div>
          <h2 class="text-sm font-semibold">Appearance</h2>
          <p class="mt-0.5 text-xs text-muted">Theme for the whole app</p>
        </div>
        <div class="flex flex-col gap-1.5">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
            :class="
              colorMode.preference === option.value
                ? 'border-primary bg-primary/10'
                : 'border-default hover:bg-elevated'
            "
            @click="setTheme(option.value)"
          >
            <UIcon :name="option.icon" class="mt-0.5 shrink-0" />
            <span class="min-w-0">
              <span class="block text-sm font-medium">{{ option.label }}</span>
              <span class="block text-xs text-muted">{{ option.hint }}</span>
            </span>
          </button>
        </div>
      </section>
    </template>
  </USlideover>
</template>
