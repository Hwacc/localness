import { v4 as uuidv4 } from 'uuid'

export function uuidFilename(filename: string) {
  const [_, ext] = filename.split('.')
  return `${uuidv4()}.${ext}`
}

export function getFileKey(filePath = '') {
  const normalized = filePath.replace(/\\/g, '/')
  const lastPart = normalized.split('/').pop()
  return lastPart || ''
}
