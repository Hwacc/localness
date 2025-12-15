<script setup lang="tsx" generic="T extends ILog<Record<string, any>>">
import type { TableColumn } from '@nuxt/ui'
import type { ComponentProps } from 'vue-component-type-helpers'
import { UAvatar, UBadge } from '#components'
import { LogAction, LogStatus } from '~~/shared/constants/log'
import dayjs from 'dayjs'

const props = defineProps<{
  history: T[]
  columns?: TableColumn<T>[]
  beforeDataRenderer?: (data: T['beforeData']) => VNode
  afterDataRenderer?: (data: T['afterData']) => VNode
}>()
const { history } = toRefs(props)

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
          <UAvatar src={user?.avatar} />
          <span>{user?.nickname ?? user?.username}</span>
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
