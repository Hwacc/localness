/**
 * @description TaskQueue is a queue to manage tasks
 * reference queue.js at: https://github.com/jessetane/queue
 */

import {
  QueueEvent,
  type QueueOptions,
  type QueueResult,
  type QueueError,
  type ITaskJob,
  TaskStateCode,
  type ITask,
} from './task-queue.types'

const has = Object.prototype.hasOwnProperty

export class Task implements ITask {
  job: ITaskJob
  options: ITask['options']

  constructor(job: ITaskJob, options: ITask['options'] = {}) {
    const defaultOptions = {
      id: `Task-${Date.now()}`,
    }
    this.options = { ...defaultOptions, ...options }
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

  private recordResults: Array<QueueResult | null> = [] // record queue result

  constructor(options: Partial<QueueOptions> = {}) {
    super()
    const defaultOptions: QueueOptions = {
      id: `Queue-${Date.now()}`,
      name: '',
      description: '',
      concurrency: Infinity,
      timeout: 0,
      autostart: false,
    }
    this.options = {
      ...defaultOptions,
      ...options,
    }
    this.pending = 0
    this.session = 0
    this.running = false
    this.tasks = []
    this.timers = []

    // this.addEventListener('error', this._errorHandler)
  }

  // _errorHandler(evt: any) {
  //   this.end(evt.detail.error)
  // }

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

  patch(queue: TaskQueue) {
    queue.options.autostart = false
    const methodsResult = this.tasks.push(queue)
    if (this.options.autostart) this._start()
    return methodsResult
  }

  // find(task: Task | string) {
  //   if (typeof task === 'string') {
  //     const findIndex = this.tasks.findIndex((t) => t.info.id === task)
  //     return this.tasks[findIndex]
  //   }
  //   return this.tasks.find((t) => t.info.id === task.info.id)
  // }

  // splice(start, deleteCount, ...workers) {
  //   this.jobs.splice(start, deleteCount, ...workers)
  //   if (this.autostart) this._start()
  //   return this
  // }

  get length() {
    return this.pending + this.tasks.length
  }

  public start(
    callback?: (
      error: QueueError | undefined,
      results: Array<QueueResult | null>
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
    if (this.pending >= this.options.concurrency) {
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
    let timeout: number | null = this.options.timeout
    // try to get job from task or queue
    if (task instanceof TaskQueue) {
      // this task is a queue, so we wrap it as job like
      job = async () => {
        return new Promise<any[] | null>((resolve, reject) => {
          // we use sub queue's timeout to notify main queue timeout
          task.addEventListener('timeout', () => {
            // should listen sub queue's timeout event to get detail
            this.dispatchEvent(new QueueEvent('timeout', { task, next }))
          })
          task.start((error, results) => {
            console.log('sub queue result', error, results)
            if (error) reject(error)
            else resolve(results)
          })
        })
      }
      // if job is a queue, we don't use main queue's timeout
      timeout = null
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
    const next = (err?: QueueError, ...res: any[]) => {
      if (once && this.session === session) {
        once = false
        this.pending--
        if (timeoutId !== null) {
          this.timers = this.timers.filter((tID) => tID !== timeoutId)
          clearTimeout(timeoutId)
        }
        if (err) {
          this.recordResults[resultIndex] = err
          this.dispatchEvent(new QueueEvent('error', { error: err }))
        } else if (!didTimeout) {
          // if is not time out
          this.recordResults[resultIndex] = {
            code: TaskStateCode.Success,
            result:
              res.length > 1 ? res : res.length === 0 ? undefined : res[0],
            task,
          }
          this.dispatchEvent(
            new QueueEvent('success', {
              result:
                res.length > 1 ? res : res.length === 0 ? undefined : res[0],
            })
          )
        }
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
          code: TaskStateCode.Timeout,
          task,
          result: null,
          error: new Error('Timeout'),
        }
        this.dispatchEvent(new QueueEvent('timeout', { task, next }))
        next({ code: TaskStateCode.Timeout, error: new Error('Timeout'), task })
      }, timeout) as unknown as number
      this.timers.push(timeoutId)
    }

    // before do job, expand records
    resultIndex = this.recordResults.length
    this.recordResults[resultIndex] = null

    this.pending++
    this.dispatchEvent(new QueueEvent('start', { task })) // dispatch start event
    // do a job
    const jobPromise = job?.(next)
    if (jobPromise && jobPromise instanceof Promise) {
      jobPromise
        .then(function (result) {
          return next(undefined, result)
        })
        .catch(function (err) {
          return next({
            code: TaskStateCode.Error,
            error: err || new Error('Unknown error'),
            task,
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

  end(error?: QueueError) {
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
      error: QueueError | undefined,
      results: Array<QueueResult | null>
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

  done(error?: QueueError) {
    this.session++
    this.running = false
    this.dispatchEvent(
      new QueueEvent('end', {
        error,
        result: this.recordResults,
      })
    )
    // when down reset records
    this.recordResults = []
  }
}
