import type { GitSyncLayout, GitSyncLayoutContext } from '../types'
import {
  listLocaleFiles,
  localeFilesScopeError,
  parseLocaleFilesOptions,
  readLocaleFileMaps,
  readLocaleFileSource,
  unwritableSourceKeys,
  writeLocaleFileSource,
  type LocaleFilesContext,
} from './files'

async function localeFilesContext(
  ctx: GitSyncLayoutContext
): Promise<LocaleFilesContext> {
  return {
    repoRoot: ctx.repoRoot,
    dir: ctx.scope,
    options: parseLocaleFilesOptions(ctx.options),
    localeMap: ctx.localeMap,
    locales: await ctx.loadLocales(),
  }
}

/** `locale-files`: one JSON per locale, rewritten in place on push. */
export const localeFiles: GitSyncLayout = {
  scopeError: (scope, options) =>
    localeFilesScopeError(scope, parseLocaleFilesOptions(options)),
  discover: null,
  listFiles: async (ctx, seen) => listLocaleFiles(await localeFilesContext(ctx), seen),
  readLocales: (ctx, files) => readLocaleFileMaps(ctx.repoRoot, files),
  readSource: async (ctx, sourceLocale) =>
    readLocaleFileSource(await localeFilesContext(ctx), sourceLocale),
  // One file per locale, rewritten in place: nothing records which source a
  // translation was made from.
  sourceTextFor: async () => () => null,
  unwritableKeys: async (ctx, sourceLocale, keys) =>
    unwritableSourceKeys(await localeFilesContext(ctx), sourceLocale, keys),
  writeSource: async (ctx, sourceLocale, entries) => {
    const written = await writeLocaleFileSource(
      await localeFilesContext(ctx),
      sourceLocale,
      entries
    )
    return { ...written, summary: `update ${written.relPath}` }
  },
}
