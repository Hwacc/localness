import crypto from 'crypto'

export const hashFilename = (file: File) => {
  const [filename, ext] = file.name.split('.')
  const hash = crypto.createHash('md5').update(filename).digest('hex')
  return `${hash}.${ext}`
}