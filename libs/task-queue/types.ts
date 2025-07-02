export enum TaskState {
  Error = -2,
  Timeout = -1,
  Success = 1,
  Pending = 2,
  Running = 3,
}

export type QueueResult = {
  id: string
  index: number
  state: TaskState
  type: 'task' | 'queue'
  error?: Error
  result?: any[] | any
}

export type QueueError = {
  id: string
  state: TaskState
  error?: Error
  index: number
  type: 'task' | 'queue'
}

export type QueueEventsMap = {
  end: { error: QueueError | undefined; result: Array<QueueResult | null> }
  error: QueueError
  timeout: QueueResult
  success: QueueResult
  start: QueueResult
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
    id: string
    state: TaskState
    type: 'task' | 'queue'
    createAt: number
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
  state: TaskState
  type: 'task' | 'queue'
  createAt: number
  name?: string
  description?: string
  concurrency?: number
  timeout?: number
  autostart?: boolean
  explosive?: boolean
} & Record<string, any>
