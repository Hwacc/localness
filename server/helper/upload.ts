import { createError } from 'h3'
import {
  IMAGE_EXTENSIONS,
  IMAGE_MAX_BYTES,
  SKILL_EXTENSIONS,
  SKILL_KEY_PREFIX,
  SKILL_MAX_BYTES,
  UPLOAD_CONTENT_TYPES,
} from '#shared/constants'
import { fileExtension } from '#shared/utils/file'

/**
 * What `/upload` accepts and how it hands bytes back. The rules live here rather
 * than in the endpoints because `test/stubs/h3.ts` only stands in for
 * `createError`, so anything left in a `.ts` endpoint is untestable — which is
 * also why `createError` is imported instead of left to Nitro's auto-import.
 *
 * Before this, the endpoint took any bytes under any extension the uploader
 * picked, and the download route returned a Buffer with no `Content-Type`.
 */

export type UploadKind = 'image' | 'skill'

const RULES: Record<UploadKind, { extensions: readonly string[]; maxBytes: number }> = {
  image: { extensions: IMAGE_EXTENSIONS, maxBytes: IMAGE_MAX_BYTES },
  skill: { extensions: SKILL_EXTENSIONS, maxBytes: SKILL_MAX_BYTES },
}

export function uploadKind(requestedKey: string): UploadKind {
  return requestedKey.startsWith(SKILL_KEY_PREFIX) ? 'skill' : 'image'
}

export function assertUploadExtension(kind: UploadKind, filename: string) {
  const ext = fileExtension(filename)
  if (!ext || !RULES[kind].extensions.includes(ext)) {
    throw createError({
      statusCode: 415,
      statusMessage: `Unsupported file type, expected one of: ${RULES[kind].extensions.join(', ')}`,
    })
  }
  return ext
}

export function assertUploadSize(kind: UploadKind, bytes: number) {
  const { maxBytes } = RULES[kind]
  if (bytes > maxBytes) {
    throw createError({
      statusCode: 413,
      statusMessage: `File is too large, limit is ${Math.round(maxBytes / 1024 / 1024)}MB`,
    })
  }
}

/**
 * `inline` only for images: anything else is downloaded rather than rendered, so
 * a file that slipped through under an allowed extension cannot execute in our
 * origin. Unknown extensions get the opaque type instead of being guessed at.
 */
export function contentTypeForKey(key: string): { type: string; inline: boolean } {
  const ext = fileExtension(key)
  const type = UPLOAD_CONTENT_TYPES[ext]
  if (!type) return { type: 'application/octet-stream', inline: false }
  return { type, inline: type.startsWith('image/') }
}
