import type { ITask, ITaskJob } from './interfaces'
import { keysIn } from 'lodash-es'

class Task implements ITask {
  job: ITaskJob
  info: ITask['info']

  constructor(job: ITaskJob , info: ITask['info']) {
    const defaultInfo = {
      id: `Task-${Date.now()}`,
    }
    this.info = { ...defaultInfo, ...info }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this
    this.job = new Proxy(job, {
      get: (target, param, receiver) => {
        if (param === 'task') return that
        if (keysIn(target).includes(param as string))
          return that.info[param as string]
        return Reflect.get(target, param, receiver)
      },
    })
  }
}

export { Task }
