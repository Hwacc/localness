import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BACKUP_MARKER,
  backupName,
  backupsToPrune,
  nextRunAt,
  parseBackupTime,
  runBackup,
  sqliteFilePath,
} from '#server/libs/backup'

describe('backup schedule', () => {
  it('parses HH:MM and rejects the rest', () => {
    expect(parseBackupTime('03:00')).toEqual({ hour: 3, minute: 0 })
    expect(parseBackupTime('3:30')).toEqual({ hour: 3, minute: 30 })
    expect(parseBackupTime('24:00')).toBeNull()
    expect(parseBackupTime('3am')).toBeNull()
  })

  it('picks today when the time is still ahead, tomorrow otherwise', () => {
    const time = { hour: 3, minute: 0 }
    const before = nextRunAt(new Date(2026, 9, 26, 1, 0, 0), time)
    expect([before.getDate(), before.getHours()]).toEqual([26, 3])
    const exactly = nextRunAt(new Date(2026, 9, 26, 3, 0, 0), time)
    expect(exactly.getDate()).toBe(27)
    const after = nextRunAt(new Date(2026, 9, 26, 15, 0, 0), time)
    expect(after.getDate()).toBe(27)
  })
})

describe('backup names and retention', () => {
  it('names in local time, sortable', () => {
    expect(backupName(new Date(2026, 9, 6, 3, 4, 5))).toBe(
      'localness-20261006-030405'
    )
  })

  it('keeps the newest N and never touches foreign entries', () => {
    const names = [
      'localness-20261001-030000',
      'localness-20261003-030000',
      'localness-20261002-030000',
      'localness-20261004-030000',
      '.localness-backup',
      'notes',
    ]
    expect(backupsToPrune(names, 3)).toEqual(['localness-20261001-030000'])
    expect(backupsToPrune(names, 0)).toHaveLength(3)
  })

  it('resolves a sqlite file url', () => {
    const abs = resolve('/data/x.db')
    expect(sqliteFilePath(`file:${abs}`)).toBe(abs)
    expect(sqliteFilePath('file:./dev.db', resolve('/cwd'))).toBe(
      resolve('/cwd', 'dev.db')
    )
  })
})

describe('runBackup', () => {
  let root: string
  let dbPath: string
  let uploadsDir: string
  let backupDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'backup-test-'))
    dbPath = join(root, 'live.db')
    uploadsDir = join(root, 'uploads')
    backupDir = join(root, 'nas')
    mkdirSync(uploadsDir)
    mkdirSync(backupDir)
    writeFileSync(join(uploadsDir, 'a.png'), 'png-bytes')
    const db = new Database(dbPath)
    db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('hello');")
    db.close()
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const options = (now: Date, keep = 3) => ({
    dbPath,
    uploadsDir,
    backupDir,
    keep,
    now,
  })

  it('refuses a directory without the marker, writing nothing', () => {
    expect(() => runBackup(options(new Date(2026, 9, 1, 3)))).toThrow(
      BACKUP_MARKER
    )
    expect(readdirSync(backupDir)).toEqual([])
  })

  it('writes a restorable database and the uploads', () => {
    writeFileSync(join(backupDir, BACKUP_MARKER), '')
    const { name } = runBackup(options(new Date(2026, 9, 1, 3)))
    const copy = new Database(join(backupDir, name, 'localness.db'), {
      readonly: true,
    })
    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'hello' })
    copy.close()
    expect(readFileSync(join(backupDir, name, 'uploads', 'a.png'), 'utf8')).toBe(
      'png-bytes'
    )
  })

  it('works when uploads live elsewhere', () => {
    writeFileSync(join(backupDir, BACKUP_MARKER), '')
    rmSync(uploadsDir, { recursive: true })
    const { name } = runBackup(options(new Date(2026, 9, 1, 3)))
    expect(existsSync(join(backupDir, name, 'localness.db'))).toBe(true)
    expect(existsSync(join(backupDir, name, 'uploads'))).toBe(false)
  })

  it('rotates after success and leaves no staging folder', () => {
    writeFileSync(join(backupDir, BACKUP_MARKER), '')
    for (let day = 1; day <= 4; day++) {
      runBackup(options(new Date(2026, 9, day, 3)))
    }
    expect(readdirSync(backupDir).sort()).toEqual([
      BACKUP_MARKER,
      'localness-20261002-030000',
      'localness-20261003-030000',
      'localness-20261004-030000',
    ])
  })

  it('keeps existing backups when the database cannot be read', () => {
    writeFileSync(join(backupDir, BACKUP_MARKER), '')
    runBackup(options(new Date(2026, 9, 1, 3)))
    expect(() =>
      runBackup({ ...options(new Date(2026, 9, 2, 3)), dbPath: join(root, 'missing.db') })
    ).toThrow()
    expect(readdirSync(backupDir).sort()).toEqual([
      BACKUP_MARKER,
      'localness-20261001-030000',
    ])
  })
})
