import type { ID } from '.'
import type { NotificationAction, NotificationType } from '#shared/constants'

export interface INotification {
  id: ID
  userId: ID
  type: NotificationType | string
  title: string
  body: string
  payload: unknown
  readAt: string | null
  actedAt: string | null
  action: NotificationAction | string
  createdAt: string
}
