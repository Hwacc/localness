import { z } from 'zod/v4'

/** A row id, which the API sends as a number but the UI also carries as text. */
export const idSchema = z.union([z.string(), z.number()])

/**
 * A release label on a project. Filter-only: it groups a project's pages and
 * entries by the version they shipped in, and never carries a second copy of
 * any text.
 */
export const projectReleaseSchema = z.object({
  id: idSchema,
  name: z.string(),
  sort: z.number(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type ProjectRelease = z.infer<typeof projectReleaseSchema>

/** `POST /api/v1/release-membership` */
export const releaseMembershipResultSchema = z.object({
  ok: z.boolean(),
  /** How many ids actually changed; repeating an add reports 0. */
  changed: z.number(),
})
export type ReleaseMembershipResult = z.infer<
  typeof releaseMembershipResultSchema
>
