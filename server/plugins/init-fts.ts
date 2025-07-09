import prisma from '~/server/libs/prisma'

export default defineNitroPlugin(async () => {
  const result = await prisma.$queryRawUnsafe<any[]>(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='Translation_FTS';
  `)

  console.log(result)

  if (result.length === 0) {
    console.log('[FTS] Translation_FTS Initializing...')
    await prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE Translation_FTS USING fts5(origin, en, zh_cn);
    `)

    // create trigger
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS Translation_FTS_AfterInsert
      AFTER INSERT ON Translation
      BEGIN
        INSERT INTO Translation_FTS (rowid, origin, en, zh_cn)
        VALUES (new.id, new.origin, new.en, new.zh_cn);
      END;
    `)

    // update trigger
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS Translation_FTS_AfterUpdate
      AFTER UPDATE ON Translation
      BEGIN
        UPDATE Translation_FTS
        SET origin = new.origin,
            en = new.en,
            zh_cn = new.zh_cn
        WHERE rowid = new.id;
      END;
    `)

    // delete trigger
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS Translation_FTS_AfterDelete
      AFTER DELETE ON Translation
      BEGIN
        DELETE FROM Translation_FTS WHERE rowid = old.id;
      END;
    `)
    console.log('[FTS] Translation_FTS Done.')
  } else {
    console.log('[FTS] Translation_FTS Already initialized.')
  }
})
