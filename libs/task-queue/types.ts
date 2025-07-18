export enum TaskState {
  Error = -2,
  Timeout = -1,
  Success = 1,
  Pending = 2,
  Running = 3,
}

export interface IQueueResultBase {
  id: string
  index: number
  state: TaskState
  type: 'task' | 'queue'
  info: {
    name?: string
    description?: string
    progress?: number
  } & Record<string, any>
}

export interface IQueueResultSuccess extends IQueueResultBase {
  result?: any[] | any
}

export interface IQueueResultError extends IQueueResultBase {
  error?: Error
}
export interface IQueueResultTimeout extends IQueueResultBase {
  [key: string]: any
}

export type QueueEventsMap = {
  end: {
    error: IQueueResultError | undefined
    result: Array<IQueueResultSuccess | null>
  }
  error: IQueueResultError | null
  timeout: IQueueResultTimeout | null
  success: IQueueResultSuccess | null
  start: IQueueResultSuccess | null
}

export interface ITaskJobCallback {
  (error?: IQueueResultError, result?: IQueueResultSuccess): void
}
export interface ITaskJob {
  (callback: ITaskJobCallback, context: Record<string, any>):
    | Promise<any>
    | null
    | undefined
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
  context?: Record<string, any>
  name?: string
  description?: string
  concurrency?: number
  timeout?: number
  autostart?: boolean
  explosive?: boolean
} & Record<string, any>
