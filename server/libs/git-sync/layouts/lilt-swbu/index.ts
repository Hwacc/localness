import type { GitSyncLayout } from '../types'
import {
  isLiltProduct,
  liltBatchIdOf,
  listLiltProducts,
  listRemoteFiles,
  readBatchSources,
  readMergedSourceLocale,
  readSelectedLocaleMaps,
  writeSourceBatch,
} from './batches'
import { localeToRemote } from './locale-map'

/**
 * `lilt-swbu`: a LILT product folder. Push appends a batch under `source/`;
 * LILT answers with `translated/` batches carrying the same batch id. The
 * folder may be shared by several projects; `ctx.share` picks this one's batches.
 */
export const liltSwbu: GitSyncLayout = {
  scopeError: (scope) =>
    isLiltProduct(scope) ? null : 'Invalid product folder name',
  discover: listLiltProducts,
  listFiles: (ctx, seen) =>
    listRemoteFiles(ctx.repoRoot, ctx.scope, ctx.localeMap, seen, ctx.share),
  readLocales: (ctx, files) => readSelectedLocaleMaps(ctx.repoRoot, files),
  readSource: (ctx, sourceLocale) =>
    readMergedSourceLocale(
      ctx.repoRoot,
      ctx.scope,
      sourceLocale,
      ctx.localeMap,
      ctx.share
    ),
  sourceTextFor: async (ctx, files, sourceLocale) => {
    const batches = await readBatchSources(ctx.repoRoot, files, ctx.scope, sourceLocale)
    return (relPath, key) => {
      const batchId = liltBatchIdOf(relPath)
      return (batchId && batches.get(batchId)?.get(key)) ?? null
    }
  },
  // Flat JSON holds any key.
  unwritableKeys: async () => new Set(),
  writeSource: async (ctx, sourceLocale, entries) => {
    const filename = await writeSourceBatch({
      repoRoot: ctx.repoRoot,
      product: ctx.scope,
      sourceRemoteLocale: localeToRemote(sourceLocale, ctx.localeMap),
      tag: ctx.share.tag,
      entries,
    })
    // Empty sha: a fresh batch is ours by construction.
    return {
      relPath: `${ctx.scope}/source/${filename}`,
      sha: '',
      summary: `source batch ${filename}`,
    }
  },
}
