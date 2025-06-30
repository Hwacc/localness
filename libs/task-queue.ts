import type { ITaskJob } from '~/types/interfaces'
import { Task } from '~/types/Task'

const has = Object.prototype.hasOwnProperty

type EventsMap = {
  end: { error?: Error }
  error: { error: Error; job: ITaskJob }
  timeout: { next: (err?: Error, ...result: any[]) => void; job: ITaskJob }
  success: { result: any[] }
  start: { job?: ITaskJob }
}

export class QueueEvent<
  Name extends keyof EventsMap,
  Detail extends EventsMap[Name]
> extends Event {
  detail: Detail
  constructor(name: Name, detail: Detail) {
    super(name)
    this.detail = detail
  }
}

type QueueOptions = {
  concurrency?: number
  timeout?: number
  autostart?: boolean
  results?: any[]
}
export default class Queue extends EventTarget {
  concurrency: number
  timeout: number
  autostart: boolean
  results: any[] | null
  pending: number
  session: number
  running: boolean
  tasks: Array<Task | Queue>
  timers: number[]

  constructor(options: QueueOptions = {}) {
    super()
    const {
      concurrency = Infinity,
      timeout = 0,
      autostart = false,
      results = null,
    } = options
    this.concurrency = concurrency
    this.timeout = timeout
    this.autostart = autostart
    this.results = results
    this.pending = 0
    this.session = 0
    this.running = false
    this.tasks = []
    this.timers = []
    this.addEventListener('error', this._errorHandler)
  }

  _errorHandler(evt: any) {
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
    if (this.autostart) this._start()
    return methodResult
  }

  unshift(...tasks: Task[]) {
    const methodResult = this.tasks.unshift(...tasks)
    if (this.autostart) this._start()
    return methodResult
  }

  // splice(start, deleteCount, ...workers) {
  //   this.jobs.splice(start, deleteCount, ...workers)
  //   if (this.autostart) this._start()
  //   return this
  // }

  get length() {
    return this.pending + this.tasks.length
  }

  start(callback?: (error: Error | undefined, results: any[] | null) => void) {
    if (this.running) throw new Error('already started')
    let awaiter
    if (callback) {
      this._addCallbackToEndEvent(callback)
    } else {
      awaiter = this._createPromiseToEndEvent()
    }
    this._start()
    return awaiter
  }

  _start() {
    this.running = true
    if (this.pending >= this.concurrency) {
      return
    }
    if (this.tasks.length === 0) {
      if (this.pending === 0) {
        this.done()
      }
      return
    }
    const task = this.tasks.shift()
    const session = this.session

    let job!: ITaskJob
    if (task instanceof Queue) {
      job = new Proxy(
        async function () {
          return new Promise<any[] | null>((resolve, reject) => {
            task.addEventListener('end', (evt: any) => {
              if (evt.detail?.error) reject(evt.detail.error)
              else resolve(evt.detail?.results)
            })
            task.start()
          })
        },
        {
          get: (target, param, receiver) => {
            if (param === 'timeout') return task.timeout
            return Reflect.get(target, param, receiver)
          },
        }
      )
    } else if (task instanceof Task) {
      job = task.job
    }

    const timeout =
      job && has.call(job, 'timeout') ? job.timeout : this.timeout
    let once = true
    let timeoutId: number | null = null
    let didTimeout = false
    let resultIndex: number | null = null
    const next = (error?: Error, ...result: any[]) => {
      if (once && this.session === session) {
        once = false
        this.pending--
        if (timeoutId !== null) {
          this.timers = this.timers.filter((tID) => tID !== timeoutId)
          clearTimeout(timeoutId)
        }
        if (error) {
          this.dispatchEvent(new QueueEvent('error', { error, job }))
        } else if (!didTimeout) {
          if (resultIndex !== null && this.results !== null) {
            this.results[resultIndex] = [...result]
          }
          this.dispatchEvent(
            new QueueEvent('success', { result: [...result], job })
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
    if (timeout) {
      timeoutId = setTimeout(() => {
        didTimeout = true
        this.dispatchEvent(
          new QueueEvent('timeout', { next, job })
        )
        next()
      }, timeout) as unknown as number
      this.timers.push(timeoutId)
    }
    if (this.results != null) {
      resultIndex = this.results.length
      this.results[resultIndex] = null
    }
    this.pending++
    this.dispatchEvent(new QueueEvent('start', { job }))
    const jobPromise = job?.(next)
    if (jobPromise && jobPromise instanceof Promise) {
      jobPromise
        .then(function (result) {
          return next(undefined, result)
        })
        .catch(function (err) {
          return next(err || true)
        })
    }
    if (this.running && this.tasks.length > 0) {
      this._start()
    }
  }

  stop() {
    this.running = false
  }

  end(error = undefined) {
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

  _addCallbackToEndEvent(
    cb: (error: Error | undefined, results: any[] | null) => void
  ) {
    const onend = (evt: any) => {
      this.removeEventListener('end', onend)
      cb(evt.detail.error, this.results)
    }
    this.addEventListener('end', onend)
  }

  _createPromiseToEndEvent() {
    return new Promise((resolve, reject) => {
      this._addCallbackToEndEvent((error, results) => {
        if (error) reject(error)
        else resolve(results)
      })
    })
  }

  done(error = undefined) {
    this.session++
    this.running = false
    this.dispatchEvent(new QueueEvent('end', { error }))
  }
}
