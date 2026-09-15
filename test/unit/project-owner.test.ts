import { describe, expect, it } from 'vitest'
import {
  addProjectOwnerRejectReason,
  isProjectSteward,
  ownerChangeStatus,
  removeProjectOwnerRejectReason,
} from '#server/helper/project-owner'

describe('isProjectSteward', () => {
  it('does not treat a Team OWNER as steward without a table row', () => {
    expect(
      isProjectSteward({
        userId: 1,
        ownerUserIds: [],
      })
    ).toBe(false)
  })

  it('treats an explicit ProjectOwner row as steward', () => {
    expect(
      isProjectSteward({
        userId: 2,
        ownerUserIds: [2],
      })
    ).toBe(true)
  })

  it('rejects a user who is not in ownerUserIds', () => {
    expect(
      isProjectSteward({
        userId: 3,
        ownerUserIds: [2],
      })
    ).toBe(false)
  })
})

describe('addProjectOwnerRejectReason', () => {
  const base = {
    actorCanAppoint: true,
    targetUserId: 2,
    teamMemberIds: [1, 2],
    ownerUserIds: [1],
  }

  it('adds a team member who is not already a steward', () => {
    expect(addProjectOwnerRejectReason(base)).toBeNull()
  })

  it('rejects an actor who cannot appoint', () => {
    expect(
      addProjectOwnerRejectReason({ ...base, actorCanAppoint: false })
    ).toBe('cannot-appoint')
  })

  it('rejects a user who is not on the team', () => {
    expect(
      addProjectOwnerRejectReason({ ...base, targetUserId: 99 })
    ).toBe('not-member')
  })

  it('rejects someone already listed', () => {
    expect(
      addProjectOwnerRejectReason({ ...base, targetUserId: 1 })
    ).toBe('already-steward')
  })
})

describe('removeProjectOwnerRejectReason', () => {
  it('removes an explicit Project Owner when another remains', () => {
    expect(
      removeProjectOwnerRejectReason({
        actorCanAppoint: true,
        targetUserId: 2,
        ownerUserIds: [1, 2],
      })
    ).toBeNull()
  })

  it('refuses to remove the last Project Owner', () => {
    expect(
      removeProjectOwnerRejectReason({
        actorCanAppoint: true,
        targetUserId: 1,
        ownerUserIds: [1],
      })
    ).toBe('last-owner')
  })

  it('rejects an actor who cannot appoint', () => {
    expect(
      removeProjectOwnerRejectReason({
        actorCanAppoint: false,
        targetUserId: 2,
        ownerUserIds: [1, 2],
      })
    ).toBe('cannot-appoint')
  })
})

describe('ownerChangeStatus', () => {
  it('maps cannot-appoint to 403 and last-owner to 400', () => {
    expect(ownerChangeStatus('cannot-appoint')).toBe(403)
    expect(ownerChangeStatus('last-owner')).toBe(400)
  })
})
