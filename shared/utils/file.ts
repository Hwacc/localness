import { joinURL, withTrailingSlash } from 'ufo'
import { v4 as uuidv4 } from 'uuid'

export const LOCAL_OSS_PUBLIC_BASE = '/upload/'

export function uuidFilename(filename: string) {
  const [_, ext] = filename.split('.')
  return `${uuidv4()}.${ext}`
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

/**
 * Strips what a filesystem rejects (Windows is the strictest) and what looks
 * like a path. Replaced with a space rather than dropped, so "v2/beta" reads as
 * "v2 beta" instead of "v2beta".
 */
function safeFileNamePart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Name of a downloaded export, without extension: the project, plus the release
 * being viewed when there is one.
 *
 * That second part is the whole point — two exports of the same project land in
 * a downloads folder as `MyProject.zip` and `MyProject (1).zip`, which says
 * nothing about which one is v2.
 */
export function exportBundleName(params: {
  projectName: string
  releaseName?: string | null
}) {
  const project = safeFileNamePart(params.projectName) || 'export'
  const release = safeFileNamePart(params.releaseName ?? '')
  return release ? `${project} - ${release}` : project
}
