import { describe, it, expect } from 'vitest'
import { isConcurrentCreateRace } from '../../src/sql.js'

// Pure unit coverage for isConcurrentCreateRace -- no database needed. See
// sql.ts's own comment on CONCURRENT_CREATE_RACE_CODES for why each of
// these four codes specifically is treated as a benign race rather than a
// real failure.
describe('isConcurrentCreateRace', () => {
  it.each(['23505', '42P07', '42710', '40001'])('treats %s as a concurrent-create race', (code) => {
    expect(isConcurrentCreateRace({ code })).toBe(true)
  })

  it('does not treat an unrelated error code as a race', () => {
    expect(isConcurrentCreateRace({ code: '08006' })).toBe(false)
  })

  it('does not treat an error with no code as a race', () => {
    expect(isConcurrentCreateRace(new Error('boom'))).toBe(false)
    expect(isConcurrentCreateRace(undefined)).toBe(false)
  })
})
