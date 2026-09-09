<script setup lang="ts">
const open = ref(false)

const sections = [
  {
    title: 'Canvas',
    items: [
      {
        icon: 'i-lucide:search',
        label: 'Zoom',
        hint: 'Use minus, plus, or the percent menu to zoom the screenshot.',
      },
      {
        icon: 'i-lucide:hand',
        label: 'Drag',
        hint: 'Pan the canvas. Tags are not selected in this mode.',
      },
    ],
  },
  {
    title: 'Modes',
    items: [
      {
        icon: 'i-lucide:pencil-ruler',
        label: 'Add Tag',
        hint: 'Default. Click a tag to select it. Drag to draw a new box — including over a locked tag.',
      },
      {
        icon: 'i-lucide:square-pen',
        label: 'Edit Tags',
        hint: 'Move or resize unlocked boxes. Locked boxes stay in place.',
      },
    ],
  },
  {
    title: 'Stroke',
    items: [
      {
        icon: 'i-lucide:minus',
        label: 'Width & color',
        hint: 'Applies to new boxes you draw.',
      },
    ],
  },
  {
    title: 'Selected tag',
    items: [
      {
        icon: 'i-lucide:info',
        label: 'Info',
        hint: 'View or edit the translation key and details.',
      },
      {
        icon: 'i-lucide:scan-text',
        label: 'OCR',
        hint: 'Read text from the screenshot inside the box.',
      },
      {
        icon: 'i-lucide:link',
        label: 'Link',
        hint: 'Bind this tag to an existing translation key.',
      },
      {
        icon: 'i-lucide:lock',
        label: 'Lock',
        hint: 'Prevent move and resize. You can still draw a new tag on top.',
      },
      {
        icon: 'i-lucide:x',
        label: 'Delete',
        hint: 'Remove the selected tag from this page.',
      },
    ],
  },
] as const
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Editor help"
    description="Modes, tag actions, and shortcuts."
    side="right"
    :close="{ icon: 'i-lucide:x' }"
    :ui="{ body: 'p-4 sm:p-4', header: 'p-4 sm:p-4' }"
    class="max-w-md"
  >
    <UTooltip text="Help">
      <UButton
        icon="i-lucide:circle-help"
        size="md"
        color="neutral"
        variant="outline"
      />
    </UTooltip>
    <template #body>
      <div class="flex flex-col gap-5">
        <section
          v-for="section in sections"
          :key="section.title"
          class="flex flex-col gap-2"
        >
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ section.title }}
          </h2>
          <div class="flex flex-col gap-1.5">
            <div
              v-for="item in section.items"
              :key="item.label"
              class="flex items-start gap-3 rounded-lg border border-default px-3 py-2.5"
            >
              <UIcon
                :name="item.icon"
                class="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span class="min-w-0">
                <span class="block text-sm font-medium">{{ item.label }}</span>
                <span class="mt-0.5 block text-xs text-muted">{{
                  item.hint
                }}</span>
              </span>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Shortcut
          </h2>
          <div
            class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2.5"
          >
            <span class="min-w-0">
              <span class="block text-sm font-medium">Save</span>
              <span class="mt-0.5 block text-xs text-muted"
                >Save the current page</span
              >
            </span>
            <span class="flex shrink-0 items-center gap-1">
              <UKbd value="Ctrl" />
              <UKbd value="S" />
            </span>
          </div>
        </section>
      </div>
    </template>
  </USlideover>
</template>
