import { joinURL, withTrailingSlash } from 'ufo'
import { v4 as uuidv4 } from 'uuid'

export const LOCAL_OSS_PUBLIC_BASE = '/upload/'

/**
 * Lowercased extension without the dot, `''` when there is none. `split('.')[1]`
 * used to stand in for this, which read `evil.html.png` as an html file and
 * stored it under an extension the uploader chose.
 */
export function fileExtension(name: string) {
  const base = getFileKey(name)
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function fileBaseName(name: string) {
  const base = getFileKey(name)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return base
  return base.slice(0, dot)
}

export function uuidFilename(filename: string) {
  const ext = fileExtension(filename)
  return ext ? `${uuidv4()}.${ext}` : uuidv4()
}

export function getFileKey(filePath = '') {
  const normalized = filePath.replace(/\\/g, '/')
  const lastPart = normalized.split('/').pop()
  return lastPart || ''
}

/** Browser path for a LOCAL-engine object. Empty `ossBaseUrl` used to become `/{uuid}.png`. */
export function localOssPublicPath(key: string, baseUrl?: string | null) {
  const filename = getFileKey(key)
  if (!filename) return ''
  const base = baseUrl?.trim() || LOCAL_OSS_PUBLIC_BASE
  return joinURL(withTrailingSlash(base), filename)
}

/** What a filesystem rejects becomes a space, so "v2/beta" reads as "v2 beta". */
function safeFileNamePart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Name of a downloaded export: the project, plus the release being viewed.
 * Without the second part, two exports of one project land as `X.zip` and
 * `X (1).zip`, which says nothing about which one is v2.
 */
export function exportBundleName(params: {
  projectName: string
  releaseName?: string | null
}) {
  const project = safeFileNamePart(params.projectName) || 'export'
  const release = safeFileNamePart(params.releaseName ?? '')
  return release ? `${project} - ${release}` : project
}
