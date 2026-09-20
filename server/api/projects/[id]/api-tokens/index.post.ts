import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'
import {
  apiTokenName,
  apiTokenPrefix,
  generateApiToken,
  hashApiToken,
} from '#server/helper/api-token'

/**
 * @route POST /api/projects/:id/api-tokens
 * @description Create a token. Any Team Member may — the credential only ever
 * returns published copy, which is strictly less than a member already reads and
 * writes in the UI, and members already hold Git credentials for this project.
 * The plaintext is returned only here; no read path ever returns it.
 */

/** List shape. Never includes the hash, and never the plaintext. */
function shapeToken(row: {
  id: number
  name: string
  prefix: string
  createdAt: Date
  revokedAt: Date | null
  lastUsedAt: Date | null
}) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
  }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const access = await requireProjectAccess(event, projectId)

  const body = await readBody(event)
  const name = apiTokenName(body?.name)
  const plaintext = generateApiToken()

  const created = await prisma.apiToken.create({
    data: {
      projectId,
      createdBy: numericID(access.userId),
      name,
      tokenHash: hashApiToken(plaintext),
      prefix: apiTokenPrefix(plaintext),
    },
  })

  return { token: plaintext, ...shapeToken(created) }
})