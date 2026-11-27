import { z } from 'zod/v4'

/** Cells one batch may hold. Bigger runs are cut, not refused. */
export const AI_TRANSLATE_MAX_CELLS = 200

const id = z.number().int().positive()

/** Start a batch: which keys, which languages, and how far it may reach. */
export const zAiTranslateCreate = z.object({
  keyIds: z.array(id).min(1).max(1000),
  locales: z.array(z.string().min(1)).min(1).max(50),
  overwriteDraft: z.boolean().default(false),
  includePublished: z.boolean().default(false),
})
export type ZAiTranslateCreate = z.infer<typeof zAiTranslateCreate>

/** The rows the reviewer kept, with their text as edited in the preview. */
export const zAiTranslateApply = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().refine((value) => value.trim() !== '', 'Text is required'),
      })
    )
    .min(1)
    .max(AI_TRANSLATE_MAX_CELLS),
})
export type ZAiTranslateApply = z.infer<typeof zAiTranslateApply>

/** One cell, translated token by token. */
export const zAiTranslateSingle = z.object({
  keyId: id,
  locale: z.string().min(1),
  /** False streams a proposal and leaves saving to a later accept. */
  save: z.boolean().default(true),
})
export type ZAiTranslateSingle = z.infer<typeof zAiTranslateSingle>

/** A proposal the reviewer accepted, as it stands in the field. */
export const zAiTranslateAccept = z.object({
  keyId: id,
  locale: z.string().min(1),
  text: z.string().refine((value) => value.trim() !== '', 'Text is required'),
})
export type ZAiTranslateAccept = z.infer<typeof zAiTranslateAccept>
