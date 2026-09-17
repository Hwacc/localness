/**
 * Fixed usernames/passwords/ids for the API test database. IDs are safe to
 * hardcode because `global-setup.ts` recreates the sqlite file from scratch
 * (autoincrement starts at 1) before every `pnpm test:api` run.
 */
export const FIXTURES = {
  owner: { username: 'gitsync-owner', password: 'Passw0rd1' },
  outsider: { username: 'gitsync-outsider', password: 'Passw0rd2' },
  admin: { username: 'access-admin', password: 'Passw0rd3' },
  teamId: 1,
  projectId: 1,
}
