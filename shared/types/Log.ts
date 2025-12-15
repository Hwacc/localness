import type { ID } from '.'
import type { LogAction, LogStatus } from '../constants/log'
import type { IUser } from './User'

export interface ILog<T extends Record<string, any>> {
  id: ID
  action: LogAction
  status: LogStatus
  createdAt: string
  userID: ID
  beforeData: T | null
  afterData: T | null
  user: IUser | null
}
