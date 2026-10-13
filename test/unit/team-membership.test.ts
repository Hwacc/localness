import { describe, expect, it } from 'vitest'
import { JoinRequestStatus, TeamRole } from '#shared/constants'
import {
  joinRequestApplyRejectReason,
  joinRequestDecideRejectReason,
  memberRemovalRejectReason,
  roleChangeRejectReason,
  teamDeleteRejectReason,
} from '#server/helper/team-membership'

const owner = (userId: number) => ({ userId, role: TeamRole.OWNER })
const member = (userId: number) => ({ userId, role: TeamRole.MEMBER })

describe('roleChangeRejectReason', () => {
  it('promotes a MEMBER to OWNER', () => {
    const members = [owner(1), member(2)]
    expect(roleChangeRejectReason(members, 2, TeamRole.OWNER)).toBeNull()
  })

  it('rejects a role the member already has', () => {
    const members = [owner(1), member(2)]
    expect(roleChangeRejectReason(members, 2, TeamRole.MEMBER)).toBe('unchanged')
  })

  it('rejects a target who is not on the team', () => {
    expect(roleChangeRejectReason([owner(1)], 99, TeamRole.OWNER)).toBe(
      'not-member'
    )
  })

  it('refuses to demote the only OWNER', () => {
    const members = [owner(1), member(2)]
    expect(roleChangeRejectReason(members, 1, TeamRole.MEMBER)).toBe(
      'last-owner'
    )
  })

  it('demotes an OWNER once a second one exists', () => {
    const members = [owner(1), owner(2)]
    expect(roleChangeRejectReason(members, 1, TeamRole.MEMBER)).toBeNull()
  })

  // Promote-then-leave is the documented handoff, so the intermediate state has
  // to be reachable in this order.
  it('allows promote then demote of the original OWNER', () => {
    const before = [owner(1), member(2)]
    expect(roleChangeRejectReason(before, 2, TeamRole.OWNER)).toBeNull()
    const after = [owner(1), owner(2)]
    expect(roleChangeRejectReason(after, 1, TeamRole.MEMBER)).toBeNull()
  })
})

describe('memberRemovalRejectReason', () => {
  it('removes a MEMBER', () => {
    expect(memberRemovalRejectReason([owner(1), member(2)], 2)).toBeNull()
  })

  it('rejects a target who is not on the team', () => {
    expect(memberRemovalRejectReason([owner(1)], 99)).toBe('not-member')
  })

  it('refuses to remove the last OWNER', () => {
    expect(memberRemovalRejectReason([owner(1), member(2)], 1)).toBe(
      'last-owner'
    )
  })

  it('refuses to remove a sole OWNER who is also the only member', () => {
    expect(memberRemovalRejectReason([owner(1)], 1)).toBe('last-owner')
  })

  it('removes an OWNER once a second one exists', () => {
    expect(memberRemovalRejectReason([owner(1), owner(2)], 1)).toBeNull()
  })
})

describe('teamDeleteRejectReason', () => {
  it('deletes a team whose only member is the actor', () => {
    expect(teamDeleteRejectReason([owner(1)], 0, 1)).toBeNull()
  })

  it('rejects an actor who is not on the team', () => {
    expect(teamDeleteRejectReason([owner(1)], 0, 99)).toBe('not-member')
  })

  it('refuses while other members remain', () => {
    expect(teamDeleteRejectReason([owner(1), member(2)], 0, 1)).toBe(
      'has-members'
    )
  })

  // Deleting a team must never be a way to drop translation data by accident.
  it('refuses while the team still holds projects', () => {
    expect(teamDeleteRejectReason([owner(1)], 3, 1)).toBe('has-projects')
  })

  it('reports remaining members before projects', () => {
    expect(teamDeleteRejectReason([owner(1), member(2)], 3, 1)).toBe(
      'has-members'
    )
  })
})

describe('joinRequestApplyRejectReason', () => {
  it('allows a stranger to apply', () => {
    expect(
      joinRequestApplyRejectReason({
        isMember: false,
        existingStatus: null,
        ownerCount: 1,
      })
    ).toBeNull()
  })

  it('allows re-applying after a rejection', () => {
    expect(
      joinRequestApplyRejectReason({
        isMember: false,
        existingStatus: JoinRequestStatus.REJECTED,
        ownerCount: 1,
      })
    ).toBeNull()
  })

  it('rejects a member', () => {
    expect(
      joinRequestApplyRejectReason({
        isMember: true,
        existingStatus: null,
        ownerCount: 1,
      })
    ).toBe('already-member')
  })

  it('rejects a second pending request', () => {
    expect(
      joinRequestApplyRejectReason({
        isMember: false,
        existingStatus: JoinRequestStatus.PENDING,
        ownerCount: 1,
      })
    ).toBe('already-pending')
  })

  it('fails closed when the team has no owner', () => {
    expect(
      joinRequestApplyRejectReason({
        isMember: false,
        existingStatus: null,
        ownerCount: 0,
      })
    ).toBe('no-owner')
  })

  it('reports membership before the pending request', () => {
    expect(
      joinRequestApplyRejectReason({
        isMember: true,
        existingStatus: JoinRequestStatus.PENDING,
        ownerCount: 1,
      })
    ).toBe('already-member')
  })
})

describe('joinRequestDecideRejectReason', () => {
  it('lets an owner decide a pending request', () => {
    expect(
      joinRequestDecideRejectReason({ status: JoinRequestStatus.PENDING }, TeamRole.OWNER)
    ).toBeNull()
  })

  it('rejects a missing request', () => {
    expect(joinRequestDecideRejectReason(null, TeamRole.OWNER)).toBe('missing')
  })

  // An OWNER demoted after the notification was sent still holds the row.
  it('rejects a MEMBER acting on the request', () => {
    expect(
      joinRequestDecideRejectReason(
        { status: JoinRequestStatus.PENDING },
        TeamRole.MEMBER
      )
    ).toBe('not-owner')
  })

  it('rejects a non-member actor', () => {
    expect(
      joinRequestDecideRejectReason({ status: JoinRequestStatus.PENDING }, null)
    ).toBe('not-owner')
  })

  it('rejects an already-decided request', () => {
    expect(
      joinRequestDecideRejectReason(
        { status: JoinRequestStatus.APPROVED },
        TeamRole.OWNER
      )
    ).toBe('already-decided')
  })

  it('checks the role before the status', () => {
    expect(
      joinRequestDecideRejectReason(
        { status: JoinRequestStatus.APPROVED },
        TeamRole.MEMBER
      )
    ).toBe('not-owner')
  })
})
