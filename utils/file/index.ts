

export const timestampFilename = (file: File) => {
  const [filename, ext] = file.name.split('.')
  const timestamp = Date.now()
  return `${filename}-${timestamp}.${ext}`
}