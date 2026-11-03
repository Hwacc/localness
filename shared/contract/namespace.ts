import { z } from 'zod/v4'
import { idSchema } from './release'

/**
 * A declared key namespace. Keys are grouped by name — a key belongs to the
 * namespace it starts with, followed by a separator — so this carries no list
 * of keys and never renames one.
 */
export const keyNamespaceSchema = z.object({
  id: idSchema,
  name: z.string(),
  sort: z.number(),
})
export type KeyNamespace = z.infer<typeof keyNamespaceSchema>

/** `GET /api/projects/:id/i18n-keys/namespaces` */
export const i18nKeyNamespaceCountsSchema = z.object({
  total: z.number(),
  ungrouped: z.number(),
  /** Namespace id → keys in it. */
  byId: z.record(z.string(), z.number()),
  /** First segments shared by Ungrouped keys, worth declaring. */
  suggestions: z.array(z.object({ name: z.string(), count: z.number() })),
})
export type I18nKeyNamespaceCounts = z.infer<typeof i18nKeyNamespaceCountsSchema>
