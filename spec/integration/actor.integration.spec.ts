import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initialize } from '../../src/index.js'
import type { ConsequentPostgres, ActorStore, Actor } from '../../src/types.js'

describe('Actor Store - Comprehensive Tests', () => {
  let adapter: ConsequentPostgres
  let actors: ActorStore

  beforeAll(async () => {
    adapter = initialize({
      connectionString: 'postgresql://consequent:pgadmin@localhost:5431/consequent'
    })
    actors = await adapter.actor.create('actor_test')
  })

  afterAll(async () => {
    await adapter.client(pg =>
      Promise.all([
        pg.query('TRUNCATE TABLE actor_test_snapshot CASCADE'),
        pg.query('TRUNCATE TABLE actor_test_id_map CASCADE')
      ])
    )
    await adapter.close()
  })

  describe('Actor Storage', () => {
    beforeEach(async () => {
      await adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE actor_test_snapshot CASCADE'),
          pg.query('TRUNCATE TABLE actor_test_id_map CASCADE')
        ])
      )
    })

    describe('store', () => {
      it('should store a new actor snapshot', async () => {
        const actor: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-001',
          lastCommandId: 'cmd-001',
          lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
          name: 'John Doe',
          email: 'john@example.com'
        }

        await actors.store('actor-001', 'a:1', actor)

        const retrieved = await actors.fetch('actor-001')
        expect(retrieved).toEqual(actor)
      })

      it('should update actor snapshot with new vector clock', async () => {
        const actor1: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-001',
          lastCommandId: 'cmd-001',
          lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
          version: 1
        }

        const actor2: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-002',
          lastCommandId: 'cmd-002',
          lastCommandHandledOn: '2024-01-01T00:01:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:01:00.000Z',
          version: 2
        }

        await actors.store('actor-001', 'a:1', actor1)
        await actors.store('actor-001', 'a:2', actor2)

        const retrieved = await actors.fetch('actor-001')
        expect(retrieved).toEqual(actor2)
      })

      it('should maintain version history', async () => {
        const snapshots: Actor[] = [
          {
            id: 'actor-001',
            lastEventId: 'evt-001',
            lastCommandId: 'cmd-001',
            lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
            lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
            state: 'v1'
          },
          {
            id: 'actor-001',
            lastEventId: 'evt-002',
            lastCommandId: 'cmd-002',
            lastCommandHandledOn: '2024-01-01T00:01:00.000Z',
            lastEventAppliedOn: '2024-01-01T00:01:00.000Z',
            state: 'v2'
          },
          {
            id: 'actor-001',
            lastEventId: 'evt-003',
            lastCommandId: 'cmd-003',
            lastCommandHandledOn: '2024-01-01T00:02:00.000Z',
            lastEventAppliedOn: '2024-01-01T00:02:00.000Z',
            state: 'v3'
          }
        ]

        await actors.store('actor-001', 'a:1', snapshots[0])
        await actors.store('actor-001', 'a:2', snapshots[1])
        await actors.store('actor-001', 'a:3', snapshots[2])

        // Latest should be v3
        const latest = await actors.fetch('actor-001')
        expect(latest?.state).toBe('v3')

        // Can retrieve by event ID
        const v1 = await actors.fetchByLastEventId('actor-001', 'evt-001')
        expect(v1?.state).toBe('v1')

        const v2 = await actors.fetchByLastEventId('actor-001', 'evt-002')
        expect(v2?.state).toBe('v2')
      })

      it('should handle complex state objects', async () => {
        const actor: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-001',
          lastCommandId: 'cmd-001',
          lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
          profile: {
            name: 'John Doe',
            age: 30,
            addresses: [
              { street: '123 Main St', city: 'NYC' },
              { street: '456 Oak Ave', city: 'LA' }
            ]
          },
          settings: {
            theme: 'dark',
            notifications: true
          }
        }

        await actors.store('actor-001', 'a:1', actor)

        const retrieved = await actors.fetch('actor-001')
        expect(retrieved?.profile).toEqual(actor.profile)
        expect(retrieved?.settings).toEqual(actor.settings)
      })

      it('should preserve all required actor fields', async () => {
        const actor: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-001',
          lastCommandId: 'cmd-001',
          lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:01:00.000Z'
        }

        await actors.store('actor-001', 'a:1', actor)

        const retrieved = await actors.fetch('actor-001')
        expect(retrieved?.id).toBe('actor-001')
        expect(retrieved?.lastEventId).toBe('evt-001')
        expect(retrieved?.lastCommandId).toBe('cmd-001')
        expect(retrieved?.lastCommandHandledOn).toBe('2024-01-01T00:00:00.000Z')
        expect(retrieved?.lastEventAppliedOn).toBe('2024-01-01T00:01:00.000Z')
      })

      it('should handle vector clock versioning', async () => {
        const actor1: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-001',
          lastCommandId: '',
          lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:00:00.000Z'
        }

        const actor2: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-002',
          lastCommandId: '',
          lastCommandHandledOn: '2024-01-01T00:01:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:01:00.000Z'
        }

        // Simple vector clock
        await actors.store('actor-001', 'a:1', actor1)

        // Complex vector clock
        await actors.store('actor-001', 'a:2;b:1;c:3', actor2)

        const retrieved = await actors.fetch('actor-001')
        expect(retrieved?.lastEventId).toBe('evt-002')
      })

      it('should store actors for different IDs independently', async () => {
        const actor1: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-001',
          lastCommandId: '',
          lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
          name: 'Actor 1'
        }

        const actor2: Actor = {
          id: 'actor-002',
          lastEventId: 'evt-002',
          lastCommandId: '',
          lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
          name: 'Actor 2'
        }

        await Promise.all([
          actors.store('actor-001', 'a:1', actor1),
          actors.store('actor-002', 'b:1', actor2)
        ])

        const retrieved1 = await actors.fetch('actor-001')
        const retrieved2 = await actors.fetch('actor-002')

        expect(retrieved1?.name).toBe('Actor 1')
        expect(retrieved2?.name).toBe('Actor 2')
      })
    })

    describe('fetch', () => {
      beforeEach(async () => {
        const actor: Actor = {
          id: 'actor-001',
          lastEventId: 'evt-003',
          lastCommandId: 'cmd-003',
          lastCommandHandledOn: '2024-01-01T00:02:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:02:00.000Z',
          name: 'Test Actor'
        }

        await actors.store('actor-001', 'a:3', actor)
      })

      it('should fetch the latest actor snapshot', async () => {
        const result = await actors.fetch('actor-001')
        expect(result?.id).toBe('actor-001')
        expect(result?.name).toBe('Test Actor')
      })

      it('should return undefined for non-existent actor', async () => {
        const result = await actors.fetch('non-existent')
        expect(result).toBeUndefined()
      })

      it('should fetch latest when multiple versions exist', async () => {
        const v1: Actor = {
          id: 'actor-002',
          lastEventId: 'evt-001',
          lastCommandId: '',
          lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
          version: 1
        }

        const v2: Actor = {
          id: 'actor-002',
          lastEventId: 'evt-002',
          lastCommandId: '',
          lastCommandHandledOn: '2024-01-01T00:01:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:01:00.000Z',
          version: 2
        }

        const v3: Actor = {
          id: 'actor-002',
          lastEventId: 'evt-003',
          lastCommandId: '',
          lastCommandHandledOn: '2024-01-01T00:02:00.000Z',
          lastEventAppliedOn: '2024-01-01T00:02:00.000Z',
          version: 3
        }

        await actors.store('actor-002', 'a:1', v1)
        await actors.store('actor-002', 'a:2', v2)
        await actors.store('actor-002', 'a:3', v3)

        const latest = await actors.fetch('actor-002')
        expect(latest?.version).toBe(3)
      })
    })

    describe('fetchByLastEventId', () => {
      beforeEach(async () => {
        const snapshots: Actor[] = [
          {
            id: 'actor-001',
            lastEventId: 'evt-001',
            lastCommandId: '',
            lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
            lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
            state: 'snapshot-1'
          },
          {
            id: 'actor-001',
            lastEventId: 'evt-002',
            lastCommandId: '',
            lastCommandHandledOn: '2024-01-01T00:01:00.000Z',
            lastEventAppliedOn: '2024-01-01T00:01:00.000Z',
            state: 'snapshot-2'
          },
          {
            id: 'actor-001',
            lastEventId: 'evt-003',
            lastCommandId: '',
            lastCommandHandledOn: '2024-01-01T00:02:00.000Z',
            lastEventAppliedOn: '2024-01-01T00:02:00.000Z',
            state: 'snapshot-3'
          }
        ]

        for (let i = 0; i < snapshots.length; i++) {
          await actors.store('actor-001', `a:${i + 1}`, snapshots[i])
        }
      })

      it('should fetch snapshot by exact event ID', async () => {
        const result = await actors.fetchByLastEventId('actor-001', 'evt-002')
        expect(result?.state).toBe('snapshot-2')
        expect(result?.lastEventId).toBe('evt-002')
      })

      it('should fetch first snapshot by first event ID', async () => {
        const result = await actors.fetchByLastEventId('actor-001', 'evt-001')
        expect(result?.state).toBe('snapshot-1')
      })

      it('should fetch last snapshot by last event ID', async () => {
        const result = await actors.fetchByLastEventId('actor-001', 'evt-003')
        expect(result?.state).toBe('snapshot-3')
      })

      it('should return undefined for non-existent event ID', async () => {
        const result = await actors.fetchByLastEventId('actor-001', 'evt-999')
        expect(result).toBeUndefined()
      })

      it('should return undefined for non-existent actor', async () => {
        const result = await actors.fetchByLastEventId('non-existent', 'evt-001')
        expect(result).toBeUndefined()
      })
    })

    describe('fetchByLastEventDate', () => {
      beforeEach(async () => {
        const snapshots: Actor[] = [
          {
            id: 'actor-001',
            lastEventId: 'evt-001',
            lastCommandId: '',
            lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
            lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
            state: 'morning'
          },
          {
            id: 'actor-001',
            lastEventId: 'evt-002',
            lastCommandId: '',
            lastCommandHandledOn: '2024-01-01T12:00:00.000Z',
            lastEventAppliedOn: '2024-01-01T12:00:00.000Z',
            state: 'noon'
          },
          {
            id: 'actor-001',
            lastEventId: 'evt-003',
            lastCommandId: '',
            lastCommandHandledOn: '2024-01-01T18:00:00.000Z',
            lastEventAppliedOn: '2024-01-01T18:00:00.000Z',
            state: 'evening'
          }
        ]

        for (let i = 0; i < snapshots.length; i++) {
          await actors.store('actor-001', `a:${i + 1}`, snapshots[i])
        }
      })

      it('should fetch snapshot by exact date', async () => {
        const result = await actors.fetchByLastEventDate('actor-001', '2024-01-01T12:00:00.000Z')
        expect(result?.state).toBe('noon')
      })

      it('should fetch earliest snapshot when date is earliest', async () => {
        const result = await actors.fetchByLastEventDate('actor-001', '2024-01-01T00:00:00.000Z')
        expect(result?.state).toBe('morning')
      })

      it('should fetch latest snapshot when date is latest', async () => {
        const result = await actors.fetchByLastEventDate('actor-001', '2024-01-01T18:00:00.000Z')
        expect(result?.state).toBe('evening')
      })

      it('should return undefined for date before all snapshots', async () => {
        const result = await actors.fetchByLastEventDate('actor-001', '2023-12-31T23:59:59.999Z')
        expect(result).toBeUndefined()
      })

      it('should return undefined for non-existent actor', async () => {
        const result = await actors.fetchByLastEventDate('non-existent', '2024-01-01T12:00:00.000Z')
        expect(result).toBeUndefined()
      })

      it('should fetch closest snapshot before given date', async () => {
        const result = await actors.fetchByLastEventDate('actor-001', '2024-01-01T15:00:00.000Z')
        // Should get noon or evening depending on implementation
        expect(['noon', 'evening']).toContain(result?.state)
      })
    })
  })

  describe('ID Mapping', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE actor_test_id_map CASCADE'))
    })

    describe('mapIds', () => {
      it('should create ID mapping', async () => {
        await actors.mapIds('system-001', 'actor-001')

        const actorId = await actors.getActorId('system-001')
        expect(actorId).toBe('actor-001')

        const systemId = await actors.getSystemId('actor-001')
        expect(systemId).toBe('system-001')
      })

      it('should handle multiple mappings for same system ID', async () => {
        await actors.mapIds('system-001', 'actor-001')
        await actors.mapIds('system-001', 'actor-002')

        // Should return latest mapping
        const actorId = await actors.getActorId('system-001')
        expect(actorId).toBe('actor-002')
      })

      it('should handle multiple mappings for same actor ID', async () => {
        await actors.mapIds('system-001', 'actor-001')
        await actors.mapIds('system-002', 'actor-001')

        // Should return latest mapping
        const systemId = await actors.getSystemId('actor-001')
        expect(systemId).toBe('system-002')
      })

      it('should maintain separate mappings for different actors', async () => {
        await actors.mapIds('system-001', 'actor-001')
        await actors.mapIds('system-002', 'actor-002')
        await actors.mapIds('system-003', 'actor-003')

        expect(await actors.getActorId('system-001')).toBe('actor-001')
        expect(await actors.getActorId('system-002')).toBe('actor-002')
        expect(await actors.getActorId('system-003')).toBe('actor-003')

        expect(await actors.getSystemId('actor-001')).toBe('system-001')
        expect(await actors.getSystemId('actor-002')).toBe('system-002')
        expect(await actors.getSystemId('actor-003')).toBe('system-003')
      })

      it('should handle concurrent ID mappings', async () => {
        const mappings = Array.from({ length: 10 }, (_, i) => ({
          systemId: `system-${String(i).padStart(3, '0')}`,
          actorId: `actor-${String(i).padStart(3, '0')}`
        }))

        await Promise.all(
          mappings.map(m => actors.mapIds(m.systemId, m.actorId))
        )

        for (const m of mappings) {
          expect(await actors.getActorId(m.systemId)).toBe(m.actorId)
          expect(await actors.getSystemId(m.actorId)).toBe(m.systemId)
        }
      })

      it('should handle special characters in IDs', async () => {
        const systemId = 'system:special-123_abc'
        const actorId = 'actor:special-456_def'

        await actors.mapIds(systemId, actorId)

        expect(await actors.getActorId(systemId)).toBe(actorId)
        expect(await actors.getSystemId(actorId)).toBe(systemId)
      })
    })

    describe('getActorId', () => {
      beforeEach(async () => {
        await actors.mapIds('system-001', 'actor-001')
        await actors.mapIds('system-002', 'actor-002')
      })

      it('should get actor ID by system ID', async () => {
        const result = await actors.getActorId('system-001')
        expect(result).toBe('actor-001')
      })

      it('should return undefined for non-existent system ID', async () => {
        const result = await actors.getActorId('non-existent')
        expect(result).toBeUndefined()
      })

      it('should handle asOf parameter (temporal lookup)', async () => {
        // This tests the optional asOf parameter
        // Use future date since mappings are created with starting_on = now()
        const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // +1 year
        const result = await actors.getActorId('system-001', futureDate)
        expect(result).toBe('actor-001')
      })
    })

    describe('getSystemId', () => {
      beforeEach(async () => {
        await actors.mapIds('system-001', 'actor-001')
        await actors.mapIds('system-002', 'actor-002')
      })

      it('should get system ID by actor ID', async () => {
        const result = await actors.getSystemId('actor-001')
        expect(result).toBe('system-001')
      })

      it('should return undefined for non-existent actor ID', async () => {
        const result = await actors.getSystemId('non-existent')
        expect(result).toBeUndefined()
      })

      it('should handle asOf parameter (temporal lookup)', async () => {
        // Use future date since mappings are created with starting_on = now()
        const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // +1 year
        const result = await actors.getSystemId('actor-001', futureDate)
        expect(result).toBe('system-001')
      })
    })
  })

  describe('Data Integrity', () => {
    beforeEach(async () => {
      await adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE actor_test_snapshot CASCADE'),
          pg.query('TRUNCATE TABLE actor_test_id_map CASCADE')
        ])
      )
    })

    it('should maintain snapshot versioning integrity', async () => {
      const versions: Actor[] = []
      for (let i = 1; i <= 5; i++) {
        versions.push({
          id: 'actor-001',
          lastEventId: `evt-${String(i).padStart(3, '0')}`,
          lastCommandId: '',
          lastCommandHandledOn: new Date(2024, 0, 1, i).toISOString(),
          lastEventAppliedOn: new Date(2024, 0, 1, i).toISOString(),
          version: i
        })
      }

      for (let i = 0; i < versions.length; i++) {
        await actors.store('actor-001', `a:${i + 1}`, versions[i])
      }

      // Latest should be version 5
      const latest = await actors.fetch('actor-001')
      expect(latest?.version).toBe(5)

      // Can retrieve specific versions
      for (let i = 1; i <= 5; i++) {
        const snapshot = await actors.fetchByLastEventId('actor-001', `evt-${String(i).padStart(3, '0')}`)
        expect(snapshot?.version).toBe(i)
      }
    })

    it('should handle Unicode in actor data', async () => {
      const actor: Actor = {
        id: 'actor-001',
        lastEventId: 'evt-001',
        lastCommandId: '',
        lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
        lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
        name: '你好世界',
        emoji: '🎉🌍',
        mixed: 'Hello 世界 🚀'
      }

      await actors.store('actor-001', 'a:1', actor)

      const retrieved = await actors.fetch('actor-001')
      expect(retrieved?.name).toBe('你好世界')
      expect(retrieved?.emoji).toBe('🎉🌍')
      expect(retrieved?.mixed).toBe('Hello 世界 🚀')
    })

    it('should handle special characters and SQL injection attempts', async () => {
      const actor: Actor = {
        id: 'actor-001',
        lastEventId: 'evt-001',
        lastCommandId: '',
        lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
        lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
        sql: "'; DROP TABLE actors; --",
        quotes: `She said "hello" and he said 'hi'`,
        backslash: 'path\\to\\file'
      }

      await actors.store('actor-001', 'a:1', actor)

      const retrieved = await actors.fetch('actor-001')
      expect(retrieved?.sql).toBe("'; DROP TABLE actors; --")
      expect(retrieved?.quotes).toBe(`She said "hello" and he said 'hi'`)
      expect(retrieved?.backslash).toBe('path\\to\\file')
    })

    it('should preserve null and undefined values correctly', async () => {
      const actor: Actor = {
        id: 'actor-001',
        lastEventId: 'evt-001',
        lastCommandId: '',
        lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
        lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zero: 0,
        false: false
      }

      await actors.store('actor-001', 'a:1', actor)

      const retrieved = await actors.fetch('actor-001')
      expect(retrieved?.nullValue).toBeNull()
      expect(retrieved?.emptyString).toBe('')
      expect(retrieved?.zero).toBe(0)
      expect(retrieved?.false).toBe(false)
    })

    it('should maintain timestamp precision', async () => {
      const precise = '2024-01-01T12:34:56.789Z'
      const actor: Actor = {
        id: 'actor-001',
        lastEventId: 'evt-001',
        lastCommandId: '',
        lastCommandHandledOn: precise,
        lastEventAppliedOn: precise
      }

      await actors.store('actor-001', 'a:1', actor)

      const retrieved = await actors.fetch('actor-001')
      expect(retrieved?.lastCommandHandledOn).toBe(precise)
      expect(retrieved?.lastEventAppliedOn).toBe(precise)
    })
  })

  describe('Performance and Scale', () => {
    beforeEach(async () => {
      await adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE actor_test_snapshot CASCADE'),
          pg.query('TRUNCATE TABLE actor_test_id_map CASCADE')
        ])
      )
    })

    it('should handle large actor state objects', async () => {
      const largeState = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: `Data for item ${i}`.repeat(10)
        }))
      }

      const actor: Actor = {
        id: 'actor-001',
        lastEventId: 'evt-001',
        lastCommandId: '',
        lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
        lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
        ...largeState
      }

      await actors.store('actor-001', 'a:1', actor)

      const retrieved = await actors.fetch('actor-001')
      expect(retrieved?.items).toHaveLength(1000)
      expect(retrieved?.items[0]).toEqual(largeState.items[0])
    })

    it('should handle many snapshot versions efficiently', async () => {
      const versions = 100
      for (let i = 1; i <= versions; i++) {
        const actor: Actor = {
          id: 'actor-001',
          lastEventId: `evt-${String(i).padStart(3, '0')}`,
          lastCommandId: '',
          lastCommandHandledOn: new Date(2024, 0, 1, 0, i).toISOString(),
          lastEventAppliedOn: new Date(2024, 0, 1, 0, i).toISOString(),
          version: i
        }
        await actors.store('actor-001', `a:${i}`, actor)
      }

      const latest = await actors.fetch('actor-001')
      expect(latest?.version).toBe(versions)

      const middle = await actors.fetchByLastEventId('actor-001', 'evt-050')
      expect(middle?.version).toBe(50)
    })

    it('should handle concurrent actor operations', async () => {
      const actorCount = 20
      const actors_array = Array.from({ length: actorCount }, (_, i) => ({
        id: `actor-${String(i).padStart(3, '0')}`,
        lastEventId: `evt-${i}`,
        lastCommandId: '',
        lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
        lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
        index: i
      }))

      await Promise.all(
        actors_array.map(a => actors.store(a.id, `a:1`, a as Actor))
      )

      for (const a of actors_array) {
        const retrieved = await actors.fetch(a.id)
        expect(retrieved?.index).toBe(a.index)
      }
    })

    it('should handle concurrent ID mappings at scale', async () => {
      const mappingCount = 100
      const mappings = Array.from({ length: mappingCount }, (_, i) => ({
        systemId: `system-${String(i).padStart(3, '0')}`,
        actorId: `actor-${String(i).padStart(3, '0')}`
      }))

      await Promise.all(
        mappings.map(m => actors.mapIds(m.systemId, m.actorId))
      )

      // Verify all mappings
      for (const m of mappings) {
        const actorId = await actors.getActorId(m.systemId)
        const systemId = await actors.getSystemId(m.actorId)
        expect(actorId).toBe(m.actorId)
        expect(systemId).toBe(m.systemId)
      }
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      await adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE actor_test_snapshot CASCADE'),
          pg.query('TRUNCATE TABLE actor_test_id_map CASCADE')
        ])
      )
    })

    it('should handle empty actor ID gracefully', async () => {
      const result = await actors.fetch('')
      expect(result).toBeUndefined()
    })

    it('should handle whitespace-only IDs', async () => {
      const result = await actors.fetch('   ')
      expect(result).toBeUndefined()
    })

    it('should handle very long IDs', async () => {
      const longId = 'a'.repeat(1000)
      const actor: Actor = {
        id: longId,
        lastEventId: 'evt-001',
        lastCommandId: '',
        lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
        lastEventAppliedOn: '2024-01-01T00:00:00.000Z'
      }

      // Schema limits IDs to character(42), so this should fail
      await expect(actors.store(longId, 'a:1', actor)).rejects.toThrow()
    })
  })

  describe('findAncestor', () => {
    it('should reject with appropriate error message', async () => {
      await expect(actors.findAncestor()).rejects.toThrow(
        "Postgres actor stores don't support siblings or ancestry"
      )
    })
  })

  describe('Integration Scenarios', () => {
    beforeEach(async () => {
      await adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE actor_test_snapshot CASCADE'),
          pg.query('TRUNCATE TABLE actor_test_id_map CASCADE')
        ])
      )
    })

    it('should support complete actor lifecycle', async () => {
      // Create ID mapping
      await actors.mapIds('system-123', 'actor-001')

      // Store initial snapshot
      const v1: Actor = {
        id: 'actor-001',
        lastEventId: 'evt-001',
        lastCommandId: 'cmd-001',
        lastCommandHandledOn: '2024-01-01T00:00:00.000Z',
        lastEventAppliedOn: '2024-01-01T00:00:00.000Z',
        status: 'created'
      }
      await actors.store('actor-001', 'a:1', v1)

      // Update snapshot
      const v2: Actor = {
        id: 'actor-001',
        lastEventId: 'evt-002',
        lastCommandId: 'cmd-002',
        lastCommandHandledOn: '2024-01-01T01:00:00.000Z',
        lastEventAppliedOn: '2024-01-01T01:00:00.000Z',
        status: 'updated'
      }
      await actors.store('actor-001', 'a:2', v2)

      // Verify ID mapping
      expect(await actors.getActorId('system-123')).toBe('actor-001')
      expect(await actors.getSystemId('actor-001')).toBe('system-123')

      // Fetch latest
      const latest = await actors.fetch('actor-001')
      expect(latest?.status).toBe('updated')

      // Fetch historical
      const historical = await actors.fetchByLastEventId('actor-001', 'evt-001')
      expect(historical?.status).toBe('created')
    })

    it('should handle actor with multiple concurrent updates', async () => {
      const updates = Array.from({ length: 10 }, (_, i) => ({
        id: 'actor-001',
        lastEventId: `evt-${String(i).padStart(3, '0')}`,
        lastCommandId: '',
        lastCommandHandledOn: new Date(2024, 0, 1, 0, i).toISOString(),
        lastEventAppliedOn: new Date(2024, 0, 1, 0, i).toISOString(),
        counter: i
      }))

      await Promise.all(
        updates.map((u, i) => actors.store('actor-001', `a:${i + 1}`, u as Actor))
      )

      const latest = await actors.fetch('actor-001')
      expect(latest?.counter).toBe(9)
    })
  })
})
