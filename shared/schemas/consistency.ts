import { z } from 'zod/v4'

/** Whitelist toggle on the Consistency page: groupId is opaque, rule-computed. */
export const zConsistencyIgnore = z.object({
  ruleId: z.string().min(1),
  groupId: z.string().min(1),
  ignored: z.boolean(),
})
export type ZConsistencyIgnore = z.infer<typeof zConsistencyIgnore>

/** Resolve drawer: the members of one finding, by id. */
export const zConsistencyKeysQuery = z.object({
  keyIds: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((part) => Number(part))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
    .pipe(z.array(z.number()).min(1).max(50)),
})

const zCsv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    )
    .pipe(z.array(item).max(100))

const zReportSeverity = z.enum(['error', 'warning', 'info'])
const zReportCategory = z.enum(['duplicate', 'mismatch', 'lint', 'orphan'])

/** The Consistency report filter as query params; empty = no restriction. */
const zConsistencyFilterQuery = z.object({
  severities: zCsv(zReportSeverity),
  locales: zCsv(z.string().max(64)),
  ruleIds: zCsv(z.string().max(64)),
  q: z.string().max(200).optional().default(''),
})

/**
 * The report summary. `limits` (`duplicate:40,lint:20`) asks for more than the
 * first page of a category — a reload keeps the rows already shown.
 */
export const zConsistencyReportQuery = zConsistencyFilterQuery.extend({
  limits: zCsv(
    z
      .string()
      .regex(/^(duplicate|mismatch|lint|orphan):\d{1,4}$/)
      .transform((part) => {
        const [category, count] = part.split(':')
        return [zReportCategory.parse(category), Number(count)] as const
      })
  ),
})
export type ZConsistencyReportQuery = z.infer<typeof zConsistencyReportQuery>

const zPageQuery = {
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(20),
}

/** One more page of one category, under the same filter. */
export const zConsistencyFindingsQuery = zConsistencyFilterQuery.extend({
  category: zReportCategory,
  ...zPageQuery,
})

/** One page of the whitelisted findings. */
export const zConsistencyIgnoredQuery = z.object(zPageQuery)

/**
 * Merge duplicates into one key. `picks` maps a locale to the key whose draft
 * the keeper takes; omitted locales use the plan's default.
 */
export const zConsistencyMerge = z.object({
  keeperId: z.number().int().positive(),
  mergeKeyIds: z.array(z.number().int().positive()).min(1).max(50),
  picks: z.record(z.string().min(1), z.number().int().positive()).default({}),
})
export type ZConsistencyMerge = z.infer<typeof zConsistencyMerge>

/** Fix one locale of one key and publish it in the same write. */
export const zConsistencyFix = z.object({
  keyId: z.number().int().positive(),
  locale: z.string().min(1),
  text: z.string().refine((value) => value.trim() !== '', 'Text is required'),
})
export type ZConsistencyFix = z.infer<typeof zConsistencyFix>

/** Keys the drawer just wrote; their single-key findings are redone at once. */
export const zConsistencyRecheckKeys = z.object({
  keyIds: z.array(z.number().int().positive()).min(1).max(200),
})
export type ZConsistencyRecheckKeys = z.infer<typeof zConsistencyRecheckKeys>
