

export interface IPagination<T> {
  page: number
  limit: number
  total: number
  totalPages: number
  data: T
}

export class Pagination<T> implements IPagination<T> {
  page: number
  limit: number
  total: number
  totalPages: number
  data: T
  constructor(page: number, limit: number, total: number, data: T) {
    this.page = page
    this.limit = limit
    this.total = total
    this.totalPages = Math.ceil(total / limit)
    this.data = data
  }

  toJSON() {
    return {
      page: this.page,
      limit: this.limit,
      total: this.total,
      totalPages: this.totalPages,
      data: this.data,
    }
  }
}

  