import { z } from 'zod/v4'
import { IMPORT_MAX_KEYS } from '#shared/utils/i18n-import'
import { zNilable } from './common'

export const zI18nKeyPatch = z.object({
  key: z.string().min(1).optional(),
  description: zNilable(z.string()).optional(),
})
export type ZI18nKeyPatch = z.infer<typeof zI18nKeyPatch>

export const zI18nGitSyncToggle = z.object({
  enabled: z.boolean(),
})
export type ZI18nGitSyncToggle = z.infer<typeof zI18nGitSyncToggle>

/** `.max` is headroom, not a limit the UI can reach: selection is page-scoped. */
export const zI18nGitSyncBulk = z.object({
  enabled: z.boolean(),
  keyIds: z.array(z.number().int().positive()).min(1).max(500),
})
export type ZI18nGitSyncBulk = z.infer<typeof zI18nGitSyncBulk>

/** `.max` is a guard for hand-rolled callers: the UI can never select this many. */
export const zI18nTransfer = z.object({
  mode: z.enum(['copy', 'move']),
  targetProjectId: z.number().int().positive(),
  keyIds: z.array(z.number().int().positive()).min(1).max(200),
})
export type ZI18nTransfer = z.infer<typeof zI18nTransfer>

export const zGenI18nKey = z.object({
  projectPrompt: zNilable(z.string()),
  pagePrompt: zNilable(z.string()),
  pageImage: zNilable(z.string()),
  tagID: z.number().nonnegative(),
  tagSourceText: z.string(),
  tagI18nKey: zNilable(z.string()),
  tagPrompt: zNilable(z.string()),
})
export type ZGenI18nKey = z.infer<typeof zGenI18nKey>

/**
 * Naming a key for an entry rather than a tag. No tag id, and no page-level
 * guidance: an entry's tags can sit on several pages, so the project's own
 * prompt is the only instruction that is certain to apply.
 */
export const zGenI18nKeyForProject = z.object({
  sourceText: z.string().min(1),
})
export type ZGenI18nKeyForProject = z.infer<typeof zGenI18nKeyForProject>

/**
 * An import, already parsed and mapped by the client: `locale → key → text`.
 * Text is re-normalised on the server, so a hand-rolled caller gets the same
 * rules as the UI.
 */
export const zI18nImportPreview = z.object({
  locales: z
    .record(z.string().min(1), z.record(z.string(), z.string()))
    .refine(
      (locales) => {
        const keys = new Set<string>()
        for (const entries of Object.values(locales)) {
          for (const key of Object.keys(entries)) keys.add(key)
        }
        return keys.size <= IMPORT_MAX_KEYS
      },
      { message: `An import can carry at most ${IMPORT_MAX_KEYS} keys` }
    ),
})
export type ZI18nImportPreview = z.infer<typeof zI18nImportPreview>

export const zI18nImportApply = zI18nImportPreview.extend({
  /** `changed` keys the user ticked. Everything else that differs is left alone. */
  overwriteKeys: z.array(z.string()).max(IMPORT_MAX_KEYS),
  releaseId: z.number().int().positive().optional(),
})
export type ZI18nImportApply = z.infer<typeof zI18nImportApply>
