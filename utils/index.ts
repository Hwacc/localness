import clsx from 'clsx'
import SparkMD5 from 'spark-md5'
import { twMerge } from 'tailwind-merge'

export function cn(...args: any[]) {
  return twMerge(clsx(...args))
}

export async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export const timestampFilename = (file: File) => {
  const [filename, ext] = file.name.split('.')
  const timestamp = Date.now()
  return `${filename}-${timestamp}.${ext}`
}

export const fpTranslation = (origin: string) => {
  const normalizedOrigin = origin.replace(/\s+/g, '').trim()
  return SparkMD5.hash(normalizedOrigin)
}