import prisma from '#server/libs/prisma'

/**
 * A cheap stamp of everything a Consistency scan reads from a project's rows:
 * per table a row count and the newest `updated_at`. Counts catch deletes;
 * the max catches edits and inserts. `julianday()` because the column holds
 * two text formats — Prisma writes ISO (`…T…+00:00`) while the raw publish /
 * unpublish SQL writes `CURRENT_TIMESTAMP` (`YYYY-MM-DD HH:MM:SS`), and those
 * do not compare correctly as strings. Tags count only while bound to one of
 * the project's keys: that is the `tagCount` the rules see.
 */
const CONTENT_STAMP_SQL = `SELECT
  (SELECT COUNT(*) || ':' || IFNULL(MAX(julianday("updated_at")), 0)
     FROM "I18nKey" WHERE "project_id" = ?) AS "keys",
  (SELECT COUNT(*) || ':' || IFNULL(MAX(julianday(lv."updated_at")), 0)
     FROM "LocaleValue" lv JOIN "I18nKey" k ON k."id" = lv."i18n_key_id"
     WHERE k."project_id" = ?) AS "values",
  (SELECT COUNT(*) || ':' || IFNULL(MAX(julianday(t."updated_at")), 0)
     FROM "Tag" t JOIN "I18nKey" k ON k."id" = t."i18n_key_id"
     WHERE k."project_id" = ?) AS "tags"`

export async function consistencyContentStamp(projectId: number): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ keys: string; values: string; tags: string }>
  >(CONTENT_STAMP_SQL, projectId, projectId, projectId)
  const row = rows[0]
  return row ? `${row.keys}|${row.values}|${row.tags}` : ''
}
