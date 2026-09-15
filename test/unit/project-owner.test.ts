import { describe, expect, it } from 'vitest'
import {
  addProjectOwnerRejectReason,
  isProjectSteward,
  ownerChangeStatus,
  projectsLeftWithoutOwner,
  removeProjectOwnerRejectReason,
  strandedProjectMessage,
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

describe('projectsLeftWithoutOwner', () => {
  it('flags the project when the leaving user is its only owner', () => {
    expect(
      projectsLeftWithoutOwner({
        targetUserId: 2,
        projects: [{ projectId: 10, ownerUserIds: [2] }],
      })
    ).toEqual([10])
  })

  it('leaves a project with another owner alone', () => {
    expect(
      projectsLeftWithoutOwner({
        targetUserId: 2,
        projects: [{ projectId: 10, ownerUserIds: [1, 2] }],
      })
    ).toEqual([])
  })

  it('ignores projects the leaving user does not own', () => {
    expect(
      projectsLeftWithoutOwner({
        targetUserId: 9,
        projects: [{ projectId: 10, ownerUserIds: [2] }],
      })
    ).toEqual([])
  })

  it('does not flag a project that already has no owner', () => {
    // Legacy rows the backfill missed: the exit loses nothing, and an Admin is
    // the only fix either way.
    expect(
      projectsLeftWithoutOwner({
        targetUserId: 2,
        projects: [{ projectId: 10, ownerUserIds: [] }],
      })
    ).toEqual([])
  })

  it('returns every stranded project, not just the first', () => {
    expect(
      projectsLeftWithoutOwner({
        targetUserId: 2,
        projects: [
          { projectId: 10, ownerUserIds: [2] },
          { projectId: 11, ownerUserIds: [1, 2] },
          { projectId: 12, ownerUserIds: [2, 3] },
          { projectId: 13, ownerUserIds: [2] },
        ],
      })
    ).toEqual([10, 13])
  })

  it('does not confuse string and numeric ids', () => {
    expect(
      projectsLeftWithoutOwner({
        targetUserId: 2,
        projects: [{ projectId: 10, ownerUserIds: [12] }],
      })
    ).toEqual([])
  })
})

describe('strandedProjectMessage', () => {
  it('names the projects that need a new owner', () => {
    expect(strandedProjectMessage(['Alpha', 'Beta'])).toBe(
      'A project must keep at least one Project Owner: appoint another owner for Alpha, Beta'
    )
  })
})
