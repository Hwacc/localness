import prisma from '#server/libs/prisma'
import type {
  I18nTransferMode,
  I18nTransferSkipReason,
} from '#shared/types/I18nKey'

/**
 * Copy or move I18nKeys, with every LocaleValue, into another Project.
 *
 * A transfer carries text and nothing else. Tags stay drawn on the source's
 * pages, Release labels belong to a Project so the target starts Unassigned,
 * and a GitSyncBase means "the platform last synced this from Git" — false for
 * a key that has just arrived.
 */

export class TransferError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'TransferError'
  }
}

export function throwTransferHttp(error: unknown): never {
  if (error instanceof TransferError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
    })
  }
  throw error
}

export type TransferRejection = 'empty-selection' | 'same-project' | 'foreign-keys'

export const TRANSFER_REJECTION_MESSAGES: Record<TransferRejection, string> = {
  'empty-selection': 'Select at least one translation to transfer',
  'same-project': 'Pick a project other than this one',
  'foreign-keys': 'Some translations are not in this project',
}

/** Decidable from the request alone, before anything is loaded. */
export function transferRejectReason(input: {
  sourceProjectId: number
  targetProjectId: number
  requestedIds: number[]
}): TransferRejection | null {
  if (!input.requestedIds.length) return 'empty-selection'
  if (input.sourceProjectId === input.targetProjectId) return 'same-project'
  return null
}

/**
 * Ids the caller named that the source project does not own. A forged id is a
 * caller bug rather than a per-key skip, so it refuses the whole request the
 * way `assertEntriesInProject` does for releases.
 */
export function foreignKeyIds(requested: number[], owned: number[]): number[] {
  const present = new Set(owned)
  return requested.filter((id) => !present.has(id))
}

export function distinctIds(ids: number[]): number[] {
  return [...new Set(ids)]
}

/** A source key with the fields the list DTO omits — `II18nKeyRow` has no `type` or `fingerprint`. */
export type TransferSourceKey = {
  id: number
  key: string
  type: string
  origin: string
  fingerprint: string
  description: string | null
  locales: Array<{
    locale: string
    draftText: string | null
    publishedText: string | null
  }>
}

export type TransferPlan = {
  written: TransferSourceKey[]
  skipped: Array<{ key: string; reason: I18nTransferSkipReason }>
}

/**
 * Which keys can land in the target. Conflict is judged by the key string
 * alone: `@@unique([projectId, key])` is what would reject the insert, and a
 * matching fingerprint is not a match.
 */
export function planTransfer(input: {
  source: TransferSourceKey[]
  targetKeys: string[]
}): TransferPlan {
  const taken = new Set(input.targetKeys)
  const written: TransferSourceKey[] = []
  const skipped: TransferPlan['skipped'] = []
  for (const sourceKey of input.source) {
    if (taken.has(sourceKey.key)) {
      skipped.push({ key: sourceKey.key, reason: 'key-exists' })
      continue
    }
    written.push(sourceKey)
  }
  return { written, skipped }
}

/**
 * One row per source locale, both texts verbatim — a published key stays
 * published in the target. Every source locale row travels, including ones the
 * target does not configure: the text lives on `LocaleValue`, not on
 * `settings.locales`.
 */
export function localeWritesFor(key: TransferSourceKey, i18nKeyId: number) {
  return key.locales.map((locale) => ({
    i18nKeyId,
    locale: locale.locale,
    draftText: locale.draftText,
    publishedText: locale.publishedText,
  }))
}

export type TransferResult = {
  mode: I18nTransferMode
  sourceProjectId: number
  targetProjectId: number
  copied: number
  removed: number
  skipped: TransferPlan['skipped']
  failed: Array<{ key: string }>
  movedIds: number[]
}

/**
 * Runs one batch. Each key gets its own transaction: the spec allows a batch to
 * partly succeed, and a move is a two-sided write that must not be able to land
 * the target insert without the source delete.
 */
export async function transferKeys(params: {
  mode: I18nTransferMode
  sourceProjectId: number
  targetProjectId: number
  keyIds: number[]
}): Promise<TransferResult> {
  const keyIds = distinctIds(params.keyIds)
  const rejection = transferRejectReason({
    sourceProjectId: params.sourceProjectId,
    targetProjectId: params.targetProjectId,
    requestedIds: keyIds,
  })
  if (rejection) {
    throw new TransferError(400, TRANSFER_REJECTION_MESSAGES[rejection])
  }

  const source = await prisma.i18nKey.findMany({
    where: { id: { in: keyIds }, projectId: params.sourceProjectId },
    select: {
      id: true,
      key: true,
      type: true,
      origin: true,
      fingerprint: true,
      description: true,
      locales: {
        select: { locale: true, draftText: true, publishedText: true },
      },
    },
  })
  const foreign = foreignKeyIds(
    keyIds,
    source.map((row) => row.id)
  )
  if (foreign.length) {
    throw new TransferError(
      400,
      `${TRANSFER_REJECTION_MESSAGES['foreign-keys']}: ${foreign.join(', ')}`
    )
  }

  const targetRows = await prisma.i18nKey.findMany({
    where: {
      projectId: params.targetProjectId,
      key: { in: source.map((row) => row.key) },
    },
    select: { key: true },
  })
  const plan = planTransfer({
    source,
    targetKeys: targetRows.map((row) => row.key),
  })

  const result: TransferResult = {
    mode: params.mode,
    sourceProjectId: params.sourceProjectId,
    targetProjectId: params.targetProjectId,
    copied: 0,
    removed: 0,
    skipped: plan.skipped,
    failed: [],
    movedIds: [],
  }

  for (const sourceKey of plan.written) {
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.i18nKey.create({
          data: {
            projectId: params.targetProjectId,
            key: sourceKey.key,
            // Explicit: the column defaults to STRING, so omitting it would
            // silently retype a non-string key.
            type: sourceKey.type,
            origin: sourceKey.origin,
            fingerprint: sourceKey.fingerprint,
            description: sourceKey.description,
          },
          select: { id: true },
        })

        // Written directly rather than through `upsertLocaleDrafts`, which sets
        // `publishedText: null` on create and never updates it — it cannot
        // reproduce a published key.
        await tx.localeValue.createMany({
          data: localeWritesFor(sourceKey, created.id),
        })

        if (params.mode !== 'move') return

        // Nulled before the delete: `TranslationLog.i18nKey` is
        // `onDelete: NoAction`, so the delete aborts on an FK error otherwise.
        await tx.translationLog.updateMany({
          where: { i18nKeyId: sourceKey.id },
          data: { i18nKeyId: null },
        })

        // The source's GitSyncBase rows are deliberately LEFT ALONE. They record
        // what the platform and Git last agreed on, which is exactly what lets
        // the next pull conclude "Git is unchanged and the platform dropped this
        // key" — `keep-ours`, which pull filters out entirely. Deleting them
        // would read as "the two sides never agreed", turning the same key into
        // `apply-theirs`, i.e. a pending pull that re-creates it here.
        //
        // The target gets no base: it never synced this key from Git.

        // An open conflict card would re-create the key by name if it were
        // resolved after the move.
        await tx.gitSyncConflict.deleteMany({
          where: {
            projectId: params.sourceProjectId,
            key: sourceKey.key,
            status: 'open',
          },
        })

        // Before the delete: afterwards `where: { i18nKeyId }` matches nothing.
        // Only the denormalised string — leaving it would let the next tag save
        // post the old name back and re-create the key.
        await tx.tag.updateMany({
          where: { i18nKeyId: sourceKey.id },
          data: { i18nKey: null },
        })

        // LocaleValue and I18nKeyRelease cascade; Tag.i18nKeyId is SetNull. The
        // Tag rows themselves stay — a move relocates text, it does not
        // dismantle the screenshot.
        await tx.i18nKey.delete({ where: { id: sourceKey.id } })
      })

      result.copied += 1
      if (params.mode === 'move') {
        result.removed += 1
        result.movedIds.push(sourceKey.id)
      }
    } catch (error) {
      console.error('transfer failed', sourceKey.key, error)
      result.failed.push({ key: sourceKey.key })
    }
  }

  return result
}
