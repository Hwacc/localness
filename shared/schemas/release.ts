import { z } from 'zod/v4'

/**
 * Release labels. The name's *content* is judged by `releaseNameRejectReason`
 * in the server helper rather than by zod, so an empty name reports the rule's
 * message instead of a schema path error.
 */
export const zReleaseCreate = z.object({ name: z.string() })
export type ZReleaseCreate = z.infer<typeof zReleaseCreate>

export const zReleaseRename = z.object({ name: z.string() })
export type ZReleaseRename = z.infer<typeof zReleaseRename>

/** One call covers one kind, so a rejected id is unambiguous to report. */
export const zReleaseMembership = z.object({
  releaseId: z.number().int().positive(),
  kind: z.enum(['page', 'key']),
  ids: z.array(z.number().int().positive()),
  mode: z.enum(['add', 'remove']),
})
export type ZReleaseMembership = z.infer<typeof zReleaseMembership>
