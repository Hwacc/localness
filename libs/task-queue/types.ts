import type TaskQueue from '.'

export enum TaskStateCode {
  Error = 0,
  Success = 1,
  Timeout = 2,
}

export type QueueResult = {
  code: TaskStateCode
  index: number
  taskID: string
  taskType: 'task' | 'queue'
  error?: Error
  result?: any[] | any
}

export type QueueError = {
  code: TaskStateCode
  error?: Error
  index: number
  taskID: string
  taskType: 'task' | 'queue'
}

export type QueueEventsMap = {
  end: { error: QueueError | undefined; result: Array<QueueResult | null> }
  error: QueueError
  timeout: QueueResult
  success: QueueResult
  start: { task: ITask | TaskQueue }
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
  explosive: boolean
} & Record<string, any>
