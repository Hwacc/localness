<script setup lang="tsx" generic="T extends ILog<Record<string, any>>">
import { UPopover } from '#components'
import type { ILog } from '~~/shared/types/Log'

const props = defineProps<{
  title: string
  history: T[]
}>()
const { title } = toRefs(props)

const beforeDataRenderer = (data: T['beforeData']) => {
  if (!data) return <span>N/A</span>
  return (
    <UPopover mode="hover">
      <span>#{data.id}</span>
      {{
        content: () => (
          <div>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </div>
        ),
      }}
    </UPopover>
  )
}
const afterDataRenderer = (data: T['afterData']) => {
  if (!data) return <span>N/A</span>
  return (
    <UPopover mode="hover">
      {{
        default: () => <span>#{data.id}</span>,
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
        :before-data-renderer="beforeDataRenderer"
        :after-data-renderer="afterDataRenderer"
      />
    </template>
  </UModal>
</template>
