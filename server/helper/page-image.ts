import prisma from '#server/libs/prisma'

/**
 * Drop a screenshot that a re-import just replaced.
 *
 * Each import uploads a new object, then points the page at it. Without this
 * the previous file stays in local storage forever. A key still referenced by
 * any page — this one, if the pointer did not move, or another — is left alone.
 */
export async function discardReplacedPageImage(
  storage: { removeItem: (key: string) => Promise<unknown> },
  previousKey: string
) {
  const stillUsed = await prisma.page.count({ where: { image: previousKey } })
  if (stillUsed > 0) return
  await storage.removeItem(previousKey)
}
