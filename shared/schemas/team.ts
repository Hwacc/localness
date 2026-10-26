import { z } from 'zod/v4'
import { NotificationAction, TeamRole } from '#shared/constants'

export const zTeamInviteCodeCreate = z.object({
  role: z.enum([TeamRole.OWNER, TeamRole.MEMBER]).optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().min(1).nullable().optional(),
})
export type ZTeamInviteCodeCreate = z.infer<typeof zTeamInviteCodeCreate>

export const zTeamInviteJoin = z.object({
  code: z.string().trim().min(1),
})
export type ZTeamInviteJoin = z.infer<typeof zTeamInviteJoin>

/**
 * Inviting a member is by id, not username: the picker resolves a search hit to
 * a user, and nickname/email are neither unique nor stable enough to key on.
 */
export const zTeamInviteMember = z.object({
  userId: z.number().int().positive(),
  role: z.enum([TeamRole.OWNER, TeamRole.MEMBER]).optional(),
})
export type ZTeamInviteMember = z.infer<typeof zTeamInviteMember>

export const zNotificationAct = z.object({
  action: z.enum([
    NotificationAction.ACCEPTED,
    NotificationAction.DECLINED,
  ]),
})
export type ZNotificationAct = z.infer<typeof zNotificationAct>

/** Which Inbox rows an action applies to. Omitted ids means all of them. */
export const zNotificationIds = z.object({
  ids: z.array(z.number().int().positive()).optional(),
})
export type ZNotificationIds = z.infer<typeof zNotificationIds>
