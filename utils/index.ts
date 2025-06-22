import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...args: any[]) {
  return twMerge(clsx(...args))
}

export async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}