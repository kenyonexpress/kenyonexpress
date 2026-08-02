import { describe, expect, it } from 'vitest'
import { authorizeRoleChange } from './role-change'

const CALLER = 'caller-id'
const TARGET = 'target-id'

describe('authorizeRoleChange', () => {
  // The bug: nothing stopped a caller from changing their own role, so a
  // super_admin could demote themselves into a lockout.
  it('blocks changing your own role, even as super_admin', () => {
    const result = authorizeRoleChange({
      callerId: CALLER,
      callerRole: 'super_admin',
      targetUserId: CALLER,
      newRole: 'customer',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('לא ניתן לשנות את התפקיד של עצמך')
  })

  it('blocks a plain admin from self-changing too', () => {
    const result = authorizeRoleChange({
      callerId: CALLER,
      callerRole: 'admin',
      targetUserId: CALLER,
      newRole: 'vendor',
    })
    expect(result.ok).toBe(false)
  })

  it('lets an admin change another user to a non-admin role', () => {
    const result = authorizeRoleChange({
      callerId: CALLER,
      callerRole: 'admin',
      targetUserId: TARGET,
      newRole: 'vendor',
    })
    expect(result.ok).toBe(true)
  })

  it('stops an admin from granting admin roles to others', () => {
    const result = authorizeRoleChange({
      callerId: CALLER,
      callerRole: 'admin',
      targetUserId: TARGET,
      newRole: 'admin',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('רק מנהל-על יכול להעניק הרשאות מנהל')
  })

  it('lets a super_admin grant admin roles to others', () => {
    const result = authorizeRoleChange({
      callerId: CALLER,
      callerRole: 'super_admin',
      targetUserId: TARGET,
      newRole: 'super_admin',
    })
    expect(result.ok).toBe(true)
  })

  it('checks self-lockout before the admin-grant rule', () => {
    // A super_admin targeting themselves with an admin role: still blocked as
    // self-change, not allowed through the grant path.
    const result = authorizeRoleChange({
      callerId: CALLER,
      callerRole: 'super_admin',
      targetUserId: CALLER,
      newRole: 'admin',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('לא ניתן לשנות את התפקיד של עצמך')
  })
})
