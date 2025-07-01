import type TaskQueue from './task-queue'
import type { Task } from './task-queue'

export enum TaskStateCode {
  Error = 0,
  Success = 1,
  Timeout = 2,
}

export type QueueResult = {
  code: TaskStateCode
  error?: Error
  result?: any[] | any
  task: Task | TaskQueue
}

export type QueueError = {
  code: TaskStateCode
  error?: Error
  task: Task | TaskQueue
}

export type QueueEventsMap = {
  end: { error: QueueError | undefined; result: Array<QueueResult | null> }
  error: { error: QueueError }
  timeout: {
    next: (error?: QueueError, ...result: any[]) => void
    task: Task | TaskQueue
  }
  success: { result: QueueResult }
  start: { task: Task | TaskQueue }
}

export interface ITaskJobCallback {
  (error?: QueueError, result?: QueueResult): void
}
export interface ITaskJob {
  (callback?: ITaskJobCallback): Promise<any> | null | undefined
  timeout?: number // to override queue timeout
}

export interface ITask {
  job: ITaskJob
  options: {
    id?: string
    name?: string
    description?: string
    progress?: number
    timeout?: number
  } & Record<string, any>
}

export class QueueEvent<
  Name extends keyof QueueEventsMap,
  Detail extends QueueEventsMap[Name]
> extends Event {
  detail: Detail
  constructor(name: Name, detail: Detail) {
    super(name)
    this.detail = detail
  }
}

export type QueueOptions = {
  id: string
  name: string
  description: string
  concurrency: number
  timeout: number
  autostart: boolean
}
