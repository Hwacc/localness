<script setup lang="tsx" generic="T extends ILog<Record<string, any>>">
import { UPopover } from '#components'
import type { ILog } from '~~/shared/types/Log'

const props = defineProps<{
  title: string
  history: T[]
}>()
const { title } = toRefs(props)

/**
 * The stored payload is either an `I18nKey` row (has a numeric id) or a
 * `{locale: value}` map, so `#id` alone renders as a bare `#` on every map.
 * The value type is the tell rather than the key name, because `id` is also a
 * real locale code (Indonesian) — it would show up there as an object.
 */
function describeLogData(data: Record<string, any>): string {
  const { id } = data
  if (typeof id === 'number' || typeof id === 'string') return `#${id}`
  const fields = Object.keys(data)
  if (!fields.length) return 'empty'
  return fields.length === 1 ? '1 locale' : `${fields.length} locales`
}

/*
 * Both columns are handed the same payloads, so they share this renderer.
 *
 * The slot object has to be the component's *only* child: as a sibling of a
 * node the JSX plugin treats it as one more child instead of slots, so the
 * popover receives no `content` (no hover) and the object itself is rendered as
 * `[object Object]`.
 */
const logDataRenderer = (data: T['beforeData']) => {
  if (!data) return <span>N/A</span>
  return (
    <UPopover mode="hover">
      {{
        default: () => <span>{describeLogData(data)}</span>,
        content: () => (
          <div>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </div>
        ),
      }}
    </UPopover>
  )
}
</script>

<template>
  <UModal :title="title" class="max-w-200">
    <template #body>
      <HistoryTable
        :history="history"
        :before-data-renderer="logDataRenderer"
        :after-data-renderer="logDataRenderer"
      />
    </template>
  </UModal>
</template>
