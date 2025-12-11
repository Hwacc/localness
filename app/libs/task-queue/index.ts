/**
 * @description TaskQueue is a queue to manage tasks
 * reference queue.js at: https://github.com/jessetane/queue
 */

import { flatten, isArray, merge } from 'lodash-es'
import type {
  IQueueResultSuccess,
  IQueueResultError,
  ITask,
  ITaskJob,
  QueueOptions,
} from './types'
import { QueueEvent, TaskState } from './types'

const has = Object.prototype.hasOwnProperty

export class Task implements ITask {
  job: ITaskJob
  options: ITask['options']

  constructor(job: ITaskJob, options: Partial<ITask['options']> = {}) {
    this.options = {
      ...options,
      ...{
        id: `Task-${Math.random().toString(36).substring(2, 10)}`,
        state: TaskState.Pending,
        type: 'task',
        createAt: Date.now(),
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this
    // to Proxy job to let anonymous function can get timeout
    this.job = new Proxy(job, {
      get: (target, param, receiver) => {
        if (param === 'timeout') return that.options.timeout
        return Reflect.get(target, param, receiver)
      },
    })
  }
}

export default class TaskQueue extends EventTarget {
  options!: QueueOptions
  pending: number
  session: number
  running: boolean
  tasks: Array<Task | TaskQueue>
  timers: number[]

  context: Record<string, any>

  private recordResults: Array<IQueueResultSuccess | null> = [] // record queue result

  constructor(options: Partial<QueueOptions> = {}) {
    super()
    const defaultOptions: Partial<QueueOptions> = {
      concurrency: Infinity,
      timeout: 0,
      autostart: false,
      explosive: false,
    }
    this.options = {
      ...defaultOptions,
      ...options,
      ...{
        id: `Queue-${Math.random().toString(36).substring(2, 10)}`,
        state: TaskState.Pending,
        type: 'queue',
        createAt: Date.now(),
      },
    }
    this.pending = 0
    this.session = 0
    this.running = false
    this.tasks = []
    this.timers = []

    this.context = new Proxy(this.options.context || {}, {
      get: (target, prop, receiver) => {
        return Reflect.get(target, prop, receiver)
      },
      set: (target, prop, receiver) => {
        return Reflect.set(target, prop, receiver)
      },
    })

    if (this.options.explosive) {
      this.addEventListener('error', this.explodeError)
    }
  }

  private explodeError(evt: any) {
    this.end(evt.detail.error)
  }

  pop() {
    return this.tasks.pop()
  }

  shift() {
    return this.tasks.shift()
  }

  slice(start: number, end: number) {
    this.tasks = this.tasks.slice(start, end)
    return this
  }

  reverse() {
    this.tasks.reverse()
    return this
  }

  push(...tasks: Task[]) {
    const methodResult = this.tasks.push(...tasks)
    if (this.options.autostart) this._start()
    return methodResult
  }

  unshift(...tasks: Task[]) {
    const methodResult = this.tasks.unshift(...tasks)
    if (this.options.autostart) this._start()
    return methodResult
  }

  patch(...queues: TaskQueue[]) {
    queues.forEach((q) => (q.options.autostart = false))
    const methodsResult = this.tasks.push(...queues)
    if (this.options.autostart) this._start()
    return methodsResult
  }

  unshiftPatch(...queues: TaskQueue[]) {
    queues.forEach((q) => (q.options.autostart = false))
    const methodsResult = this.tasks.unshift(...queues)
    if (this.options.autostart) this._start()
    return methodsResult
  }

  /**
   * find task by id
   * @param task Task | TaskQueue | string
   * @returns Task | TaskQueue | undefined
   */
  find(task: Task | TaskQueue | string | undefined) {
    if (!task) return
    if (typeof task === 'string') {
      const findIndex = this.tasks.findIndex((t) => t.options.id === task)
      return this.tasks[findIndex]
    }
    return this.tasks.find((t) => t.options.id === task.options.id)
  }

  /**
   * remove task by id
   * @param task Task | TaskQueue | string
   */
  remove(task: Task | TaskQueue | string | undefined) {
    if (!task) return
    if (typeof task === 'string') {
      const findIndex = this.tasks.findIndex((t) => t.options.id === task)
      this.tasks.splice(findIndex, 1)
      return
    }
    this.tasks = this.tasks.filter((t) => t.options.id !== task.options.id)
  }

  get length() {
    return this.pending + this.tasks.length
  }

  public start(
    callback?: (
      error: IQueueResultError | undefined,
      results: Array<IQueueResultSuccess | null>
    ) => void
  ) {
    if (this.running) throw new Error('already started')
    let awaiter
    if (callback) {
      this.addCallbackToEndEvent(callback)
    } else {
      awaiter = this.createPromiseToEndEvent()
    }
    this._start()
    return awaiter
  }

  private _start() {
    this.running = true
    if (this.pending >= this.options.concurrency!) {
      return
    }
    if (this.tasks.length === 0) {
      if (this.pending === 0) {
        this.done()
      }
      return
    }

    // task cannot be null
    const task = this.tasks.shift() as Task | TaskQueue
    const session = this.session

    let job!: ITaskJob
    let timeout: number | undefined = this.options.timeout
    // try to get job from task or queue
    if (task instanceof TaskQueue) {
      // this task is a queue, so we wrap it as job like
      job = async (_, context) => {
        return new Promise<any[] | null>((resolve, reject) => {
          task.context = merge(context, task.context)
          task.start((error, results) => {
            if (error) reject(error)
            else resolve(results)
          })
        })
      }
      // if job is a queue, we don't use main queue's timeout
      timeout = undefined
    } else if (task instanceof Task) {
      // this task is normal task
      job = task.job
      if (has.call(job, 'timeout') || job.timeout) {
        timeout = job.timeout ?? this.options.timeout
      }
    }

    // let's rock
    let once = true
    let timeoutId: number | null = null
    let didTimeout = false
    let resultIndex: number = 0

    /**
     * next is a callback to handle the result of a job
     * @param error
     * @param result
     */
    const next = (err?: IQueueResultError, ...res: any[]) => {
      if (once && this.session === session) {
        once = false
        this.pending--
        if (timeoutId !== null) {
          this.timers = this.timers.filter((tID) => tID !== timeoutId)
          clearTimeout(timeoutId)
        }
        if (err) {
          this.recordResults[resultIndex] = err
          this.dispatchEvent(new QueueEvent('error', err))
          if (this.options.explosive) {
            this.end(err)
            return
          }
        } else if (!didTimeout) {
          const flatRes =
            res.length === 0 ? null : res.length === 1 ? res[0] : flatten(res)
          const preResult: IQueueResultSuccess = {
            id: task.options.id!,
            index: resultIndex,
            state: TaskState.Success,
            type: task.options.type,
            info: task.options,
            result: flatRes,
          }
          const sendSuccess = () => {
            this.recordResults[resultIndex] = preResult
            this.dispatchEvent(new QueueEvent('success', preResult))
          }
          if (task instanceof TaskQueue && isArray(flatRes)) {
            const someTimeout = flatRes.some(
              (r) => r.state === TaskState.Timeout
            )
            const someError = flatRes.some((r) => r.state === TaskState.Error)
            if (someTimeout) {
              preResult.state = TaskState.Timeout
              this.recordResults[resultIndex] = preResult
              this.dispatchEvent(new QueueEvent('timeout', preResult))
            }
            if (someError) {
              preResult.state = TaskState.Error
              this.recordResults[resultIndex] = preResult
              this.dispatchEvent(new QueueEvent('error', preResult))
            } else sendSuccess()
          } else sendSuccess()
        }

        // continue
        if (this.session === session) {
          if (this.pending === 0 && this.tasks.length === 0) {
            this.done()
          } else if (this.running) {
            this._start()
          }
        }
      }
    }

    // if has timeout, we set a timeout
    if (timeout) {
      timeoutId = setTimeout(() => {
        didTimeout = true
        this.recordResults[resultIndex] = {
          id: task.options.id!,
          index: resultIndex,
          state: TaskState.Timeout,
          type: task.options.type,
          info: task.options,
        }
        this.dispatchEvent(
          new QueueEvent('timeout', this.recordResults[resultIndex] ?? null)
        )
        next()
      }, timeout) as unknown as number
      this.timers.push(timeoutId)
    }

    // before do job, expand records
    resultIndex = this.recordResults.length
    this.recordResults[resultIndex] = null

    this.pending++
    this.dispatchEvent(
      new QueueEvent('start', {
        id: task.options.id!,
        index: resultIndex,
        state: TaskState.Running,
        type: task.options.type,
        info: task.options,
      })
    ) // dispatch start event
    // do a job
    const jobPromise = job?.(next, this.context)
    if (jobPromise && jobPromise instanceof Promise) {
      jobPromise
        .then(function (result) {
          return next(undefined, result)
        })
        .catch(function (err) {
          return next({
            id: task.options.id!,
            index: resultIndex,
            state: TaskState.Error,
            type: task.options.type,
            info: task.options,
            error: err || new Error('Unknown error'),
          })
        })
    }
    // if queue is running, still going on
    if (this.running && this.tasks.length > 0) {
      this._start()
    }
  }

  stop() {
    this.running = false
  }

  end(error?: IQueueResultError) {
    this.clearTimers()
    this.tasks.length = 0
    this.pending = 0
    this.done(error)
  }

  clearTimers() {
    this.timers.forEach((timer) => {
      clearTimeout(timer)
    })
    this.timers = []
  }

  private addCallbackToEndEvent(
    cb: (
      error: IQueueResultError | undefined,
      results: Array<IQueueResultSuccess | null>
    ) => void
  ) {
    const onEnd = (evt: any) => {
      this.removeEventListener('end', onEnd)
      cb(evt.detail.error, evt.detail.result)
    }
    this.addEventListener('end', onEnd)
  }

  private createPromiseToEndEvent() {
    return new Promise((resolve) => {
      this.addCallbackToEndEvent((error, results) => {
        resolve({ error, results })
      })
    })
  }

  done(error?: IQueueResultError) {
    this.session++
    this.running = false
    this.dispatchEvent(
      new QueueEvent('end', {
        error,
        result: this.recordResults,
      })
    )
    // when down reset records
    this.context = new Proxy(this.options.context || {}, {
      get: (target, prop, receiver) => {
        return Reflect.get(target, prop, receiver)
      },
      set: (target, prop, receiver) => {
        return Reflect.set(target, prop, receiver)
      },
    })
    this.recordResults = []
  }
}
