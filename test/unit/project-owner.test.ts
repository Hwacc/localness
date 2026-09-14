import { describe, expect, it } from 'vitest'
import { TeamRole } from '#shared/constants'
import {
  addProjectOwnerRejectReason,
  isImplicitProjectSteward,
  isProjectSteward,
  removeProjectOwnerRejectReason,
} from '#server/helper/project-owner'

describe('isProjectSteward', () => {
  it('treats a Team OWNER as an implicit steward without a table row', () => {
    expect(isImplicitProjectSteward(TeamRole.OWNER)).toBe(true)
    expect(
      isProjectSteward({
        userId: 1,
        teamRole: TeamRole.OWNER,
        ownerUserIds: [],
      })
    ).toBe(true)
  })

  it('treats an explicit ProjectOwner row as steward', () => {
    expect(
      isProjectSteward({
        userId: 2,
        teamRole: TeamRole.MEMBER,
        ownerUserIds: [2],
      })
    ).toBe(true)
  })

  it('rejects a plain member with no row', () => {
    expect(
      isProjectSteward({
        userId: 3,
        teamRole: TeamRole.MEMBER,
        ownerUserIds: [2],
      })
    ).toBe(false)
  })
})

describe('addProjectOwnerRejectReason', () => {
  const base = {
    actorIsTeamOwner: true,
    targetUserId: 2,
    teamMemberIds: [1, 2],
    teamRoleByUserId: { 1: TeamRole.OWNER, 2: TeamRole.MEMBER },
    ownerUserIds: [] as number[],
  }

  it('adds a team member who is not already a steward', () => {
    expect(addProjectOwnerRejectReason(base)).toBeNull()
  })

  it('rejects a non-team-owner actor', () => {
    expect(
      addProjectOwnerRejectReason({ ...base, actorIsTeamOwner: false })
    ).toBe('not-team-owner')
  })

  it('rejects a user who is not on the team', () => {
    expect(
      addProjectOwnerRejectReason({ ...base, targetUserId: 99 })
    ).toBe('not-member')
  })

  it('rejects an implicit Team OWNER as already steward', () => {
    expect(
      addProjectOwnerRejectReason({ ...base, targetUserId: 1 })
    ).toBe('already-steward')
  })
})

describe('removeProjectOwnerRejectReason', () => {
  it('removes an explicit Project Owner', () => {
    expect(
      removeProjectOwnerRejectReason({
        actorIsTeamOwner: true,
        targetUserId: 2,
        teamRoleByUserId: { 1: TeamRole.OWNER, 2: TeamRole.MEMBER },
        ownerUserIds: [2],
      })
    ).toBeNull()
  })

  it('refuses to remove an implicit Team OWNER', () => {
    expect(
      removeProjectOwnerRejectReason({
        actorIsTeamOwner: true,
        targetUserId: 1,
        teamRoleByUserId: { 1: TeamRole.OWNER },
        ownerUserIds: [1],
      })
    ).toBe('implicit-team-owner')
  })

  it('rejects a non-team-owner actor', () => {
    expect(
      removeProjectOwnerRejectReason({
        actorIsTeamOwner: false,
        targetUserId: 2,
        teamRoleByUserId: { 2: TeamRole.MEMBER },
        ownerUserIds: [2],
      })
    ).toBe('not-team-owner')
  })
})
