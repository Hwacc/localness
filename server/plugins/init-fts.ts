import prisma from '#server/libs/prisma'

export default defineNitroPlugin(async () => {
  const result = await prisma.$queryRawUnsafe<any[]>(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='I18nKey_FTS';
  `)

  if (result.length === 0) {
    console.log('[FTS] I18nKey_FTS Initializing...')
    await prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE I18nKey_FTS USING fts5(
        origin,
        content='I18nKey',
        content_rowid='id'
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS I18nKey_FTS_AfterInsert
      AFTER INSERT ON I18nKey
      BEGIN
        INSERT INTO I18nKey_FTS (rowid, origin)
        VALUES (new.id, new.origin);
      END;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS I18nKey_FTS_AfterUpdate
      AFTER UPDATE ON I18nKey
      BEGIN
        UPDATE I18nKey_FTS
        SET origin = new.origin
        WHERE rowid = new.id;
      END;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS I18nKey_FTS_AfterDelete
      AFTER DELETE ON I18nKey
      BEGIN
        DELETE FROM I18nKey_FTS WHERE rowid = old.id;
      END;
    `)
    await prisma.$executeRawUnsafe(
      `INSERT INTO I18nKey_FTS(I18nKey_FTS) VALUES('rebuild');`
    )
    console.log('[FTS] I18nKey_FTS Done.')
  } else {
    console.log('[FTS] I18nKey_FTS Already initialized.')
    console.log('[FTS] I18nKey_FTS Syncing...')
    await prisma.$executeRawUnsafe(
      `INSERT INTO I18nKey_FTS(I18nKey_FTS) VALUES('rebuild');`
    )
    console.log('[FTS] I18nKey_FTS Synced.')
  }
})
