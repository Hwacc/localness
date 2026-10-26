import { z } from 'zod/v4'

/**
 * Export takes an explicit selection, not filters: the user picks keys in the
 * step 2 table, so search / status / date filtering happens there and never
 * reaches this endpoint. What you saw in the table is what gets exported.
 */
export const zExportSelection = z.object({
  /** Pages whose screenshots are exported, and the scope for tag rows. */
  pages: z.array(z.string()),
  /** Keys chosen in the picker table. */
  keyIds: z.array(z.number().int().positive()),
  /** Locale columns, in the order they should appear. */
  locales: z.array(z.string().min(1)),
  /** Keep the project's fallback locale column even if it was not picked. */
  includeFallbackLocale: z.boolean().default(true),
})
export type ZExportSelection = z.infer<typeof zExportSelection>

export const zExport = zExportSelection.extend({
  fileFormat: z.array(
    z.string().refine((v) => v === 'xlsx' || v === 'json', {
      message: 'fileFormat must be xlsx or json',
    })
  ),
})
export type ZExport = z.infer<typeof zExport>

export const zPublish = z.object({
  keyIds: z.array(z.number().int().positive()).optional(),
  /**
   * Restrict the change to these locales. Omitted means every locale on the
   * selected keys — callers that only touched one locale (a single cell) must
   * pass it, or they publish someone else's unrelated draft.
   */
  locales: z.array(z.string().min(1)).optional(),
  /**
   * Exact `key + locale` pairs, addressed by key name. For callers holding a
   * heterogeneous set (git pull results): `keyIds × locales` would be a cross
   * product and would publish pairs the caller never touched.
   */
  rows: z
    .array(
      z.object({
        key: z.string().min(1),
        locale: z.string().min(1),
      })
    )
    .optional(),
})
export type ZPublish = z.infer<typeof zPublish>
