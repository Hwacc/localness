import prisma from '#server/libs/prisma'
import {
  GIT_SYNC_AUTO_ACTOR,
  GitSyncPreviewKind,
  GitSyncPreviewStatus,
} from '#shared/constants'
import { notifyGitPullReady } from '#server/helper/notifications'
import { remoteHeadSha } from '#server/libs/git-sync/remote/git-remote'
import { previewPull } from '#server/libs/git-sync/sync'
import {
  createAutoPull,
  parseAutoPullMinutes,
} from '#server/libs/git-sync/auto-pull'

/**
 * Polls each auto-pull remote with `git ls-remote` and, when its head moved,
 * prepares the open conflict cards and tells the project's owners. It never
 * applies anything. `NUXT_GIT_AUTO_PULL_MINUTES` sets the interval (default
 * 120, 0 turns it off). A failed round is a log line; the next one retries.
 */
export default defineNitroPlugin(() => {
  const minutes = parseAutoPullMinutes(process.env.NUXT_GIT_AUTO_PULL_MINUTES)
  if (minutes === null) {
    console.warn(
      `[git-auto-pull] NUXT_GIT_AUTO_PULL_MINUTES "${process.env.NUXT_GIT_AUTO_PULL_MINUTES}" is not a number of minutes. Auto pull is off.`
    )
    return
  }
  if (minutes === 0) return
  const intervalMs = minutes * 60_000

  const poller = createAutoPull(
    {
      listBindings: () =>
        prisma.gitSyncBinding.findMany({
          where: {
            autoPull: true,
            enabled: true,
            token: { not: '' },
            remoteUrl: { not: '' },
          },
          select: {
            projectId: true,
            remoteUrl: true,
            branch: true,
            credentialKind: true,
            token: true,
            lastRemoteSha: true,
            leaseUntil: true,
          },
        }),
      remoteHead: remoteHeadSha,
      hasHumanPreview: async (projectId) =>
        Boolean(
          await prisma.gitSyncPreview.findFirst({
            where: {
              projectId,
              kind: GitSyncPreviewKind.PULL,
              status: GitSyncPreviewStatus.PENDING,
              expiresAt: { gt: new Date() },
              createdBy: { not: GIT_SYNC_AUTO_ACTOR },
            },
            select: { id: true },
          })
        ),
      probe: async (projectId) => {
        const preview = await previewPull(projectId, GIT_SYNC_AUTO_ACTOR)
        await prisma.gitSyncPreview.update({
          where: { id: preview.previewId },
          data: { status: GitSyncPreviewStatus.CANCELLED },
        })
        return {
          applyTheirs: preview.counts['apply-theirs'],
          conflicts: preview.counts.conflict,
        }
      },
      saveHead: async (projectId, sha) => {
        await prisma.gitSyncBinding.update({
          where: { projectId },
          data: { lastRemoteSha: sha },
        })
      },
      notify: notifyGitPullReady,
    },
    intervalMs
  )

  const schedule = () => setTimeout(run, intervalMs).unref()
  const run = async () => {
    try {
      await poller.runRound()
    } catch (error) {
      console.error('[git-auto-pull] round failed:', error)
    } finally {
      schedule()
    }
  }

  console.log(`[git-auto-pull] checking every ${minutes} min`)
  schedule()
})
