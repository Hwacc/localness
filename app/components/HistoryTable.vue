<script setup lang="tsx" generic="T extends ILog<Record<string, any>>">
import type { TableColumn } from '@nuxt/ui'
import type { ComponentProps } from 'vue-component-type-helpers'
import { UBadge, UTooltip, UserAvatar } from '#components'
import { LogAction, LogStatus } from '~~/shared/constants/log'
import dayjs from 'dayjs'

const props = defineProps<{
  history: T[]
  columns?: TableColumn<T>[]
  beforeDataRenderer?: (data: T['beforeData']) => VNode
  afterDataRenderer?: (data: T['afterData']) => VNode
}>()
const { history } = toRefs(props)

const CLIENT_NAMES: Record<string, string> = {
  cli: 'CLI',
  vscode: 'VS Code',
  figma: 'Figma',
}

/**
 * Token writes carry the tool that made them (`cli/0.1.0`), and whether an
 * agent drove it; the badge names both, the tooltip the exact version.
 */
function clientBadge(row: object) {
  const { client, agent } = row as { client?: string | null; agent?: boolean }
  if (!client) return null
  const name = client.split('/')[0]!
  const label = CLIENT_NAMES[name] ?? name
  return (
    <UTooltip text={`${client}${agent ? ' (agent)' : ''}`}>
      <UBadge color={agent ? 'warning' : 'neutral'} variant="subtle" size="sm">
        {agent ? `${label} · Agent` : label}
      </UBadge>
    </UTooltip>
  )
}

const computedColumns = computed<TableColumn<T>[]>(() => [
  // default columns
  {
    id: 'id',
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => `#${row.getValue('id')}`,
  },
  {
    id: 'action',
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => {
      const action = row.getValue('action')
      let text = 'Unknown'
      let color: ComponentProps<typeof UBadge>['color'] = 'neutral'
      switch (action) {
        case LogAction.CREATE:
          text = 'Create'
          color = 'success'
          break
        case LogAction.UPDATE:
          text = 'Update'
          color = 'primary'
          break
        case LogAction.DELETE:
          text = 'Delete'
          color = 'error'
          break
      }
      return (
        <UBadge color={color} variant="outline">
          {text}
        </UBadge>
      )
    },
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status')
      let text = 'Unknown'
      let color: ComponentProps<typeof UBadge>['color'] = 'neutral'
      switch (status) {
        case LogStatus.SUCCESS:
          text = 'Success'
          color = 'success'
          break
        case LogStatus.FAILED:
          text = 'Failed'
          color = 'error'
          break
        case LogStatus.REFUSED:
          text = 'Refused'
          color = 'warning'
          break
      }
      return <UBadge color={color}>{text}</UBadge>
    },
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Created At',
    cell: ({ row }) => {
      return dayjs(row.getValue('createdAt')).format('YYYY-MM-DD HH:mm:ss')
    },
  },
  {
    id: 'user',
    accessorKey: 'user',
    header: 'User',
    cell: ({ row }) => {
      const user = row.getValue('user') as IUser
      return (
        <div class="flex items-center gap-2">
          <UserAvatar
            avatar={user?.avatar}
            name={user?.nickname ?? user?.username}
            size="md"
          />
          <span>{user?.nickname ?? user?.username}</span>
          {clientBadge(row.original)}
        </div>
      )
    },
  },
  {
    id: 'beforeData',
    accessorKey: 'beforeData',
    header: 'Before',
    cell: ({ row }) => {
      const beforeData = row.getValue('beforeData') as T['beforeData']
      return props.beforeDataRenderer?.(beforeData) ?? beforeData
    },
  },
  {
    id: 'afterData',
    accessorKey: 'afterData',
    header: 'After',
    cell: ({ row }) => {
      const afterData = row.getValue('afterData') as T['afterData']
      return props.afterDataRenderer?.(afterData) ?? afterData
    },
  },
  ...(props.columns ?? []),
])
</script>

<template>
  <UTable :data="history" :columns="computedColumns" class="w-full" />
</template>
