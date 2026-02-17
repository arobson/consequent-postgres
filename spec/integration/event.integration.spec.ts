import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initialize } from '../../src/index.js'
import type { ConsequentPostgres, EventStore, Event } from '../../src/types.js'

describe('Event Store - Comprehensive Tests', () => {
  let adapter: ConsequentPostgres
  let events: EventStore

  beforeAll(async () => {
    adapter = initialize({
      connectionString: 'postgresql://consequent:pgadmin@localhost:5431/consequent'
    })
    events = await adapter.event.create('event_test')
  })

  afterAll(async () => {
    await adapter.client(pg =>
      Promise.all([
        pg.query('TRUNCATE TABLE event_test_event CASCADE'),
        pg.query('TRUNCATE TABLE event_test_eventpack CASCADE')
      ])
    )
    await adapter.close()
  })

  describe('Event Storage', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE event_test_event CASCADE'))
    })

    describe('storeEvents', () => {
      it('should store a single event', async () => {
        const event: Event = {
          id: 'evt-001',
          _createdOn: '2024-01-01T00:00:00.000Z',
          actorId: 'actor-1',
          vector: 'a:1',
          type: 'UserCreated',
          data: { name: 'John' }
        }

        await events.storeEvents('actor-1', [event])

        const retrieved = await events.getEventsFor('actor-1')
        expect(retrieved).toHaveLength(1)
        expect(retrieved[0]).toMatchObject(event)
      })

      it('should store multiple events in order', async () => {
        const evts: Event[] = [
          { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' },
          { id: 'evt-002', _createdOn: '2024-01-01T00:01:00.000Z', actorId: 'actor-1', vector: 'a:2' },
          { id: 'evt-003', _createdOn: '2024-01-01T00:02:00.000Z', actorId: 'actor-1', vector: 'a:3' }
        ]

        await events.storeEvents('actor-1', evts)

        const retrieved = await events.getEventsFor('actor-1')
        expect(retrieved).toHaveLength(3)
        expect(retrieved.map(e => e.id)).toEqual(['evt-001', 'evt-002', 'evt-003'])
      })

      it('should store events for different actors separately', async () => {
        const actor1Events: Event[] = [
          { id: 'evt-a1-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' },
          { id: 'evt-a1-002', _createdOn: '2024-01-01T00:01:00.000Z', actorId: 'actor-1', vector: 'a:2' }
        ]

        const actor2Events: Event[] = [
          { id: 'evt-a2-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-2', vector: 'b:1' },
          { id: 'evt-a2-002', _createdOn: '2024-01-01T00:01:00.000Z', actorId: 'actor-2', vector: 'b:2' }
        ]

        await Promise.all([
          events.storeEvents('actor-1', actor1Events),
          events.storeEvents('actor-2', actor2Events)
        ])

        const actor1Retrieved = await events.getEventsFor('actor-1')
        const actor2Retrieved = await events.getEventsFor('actor-2')

        expect(actor1Retrieved).toHaveLength(2)
        expect(actor2Retrieved).toHaveLength(2)
        expect(actor1Retrieved.map(e => e.id)).toEqual(['evt-a1-001', 'evt-a1-002'])
        expect(actor2Retrieved.map(e => e.id)).toEqual(['evt-a2-001', 'evt-a2-002'])
      })

      it('should handle empty event array', async () => {
        await events.storeEvents('actor-1', [])
        const retrieved = await events.getEventsFor('actor-1')
        expect(retrieved).toEqual([])
      })

      it('should preserve event metadata', async () => {
        const event: Event = {
          id: 'evt-001',
          _createdOn: '2024-01-01T00:00:00.000Z',
          _actorId: 'actor-1',
          _actorType: 'User',
          _createdBy: 'system',
          _createdById: 'sys-001',
          _initiatedBy: 'admin',
          _initiatedById: 'admin-001',
          actorId: 'actor-1',
          vector: 'a:1',
          type: 'UserCreated',
          customField: 'custom value'
        }

        await events.storeEvents('actor-1', [event])

        const retrieved = await events.getEventsFor('actor-1')
        expect(retrieved[0]).toMatchObject(event)
      })

      it('should handle complex event data structures', async () => {
        const event: Event = {
          id: 'evt-001',
          _createdOn: '2024-01-01T00:00:00.000Z',
          actorId: 'actor-1',
          vector: 'a:1',
          data: {
            nested: {
              deep: {
                value: 'test'
              }
            },
            array: [1, 2, 3],
            mixed: {
              string: 'value',
              number: 42,
              boolean: true,
              null: null
            }
          }
        }

        await events.storeEvents('actor-1', [event])

        const retrieved = await events.getEventsFor('actor-1')
        expect(retrieved[0].data).toEqual(event.data)
      })
    })

    describe('getEventsFor', () => {
      beforeEach(async () => {
        const testEvents: Event[] = [
          { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' },
          { id: 'evt-002', _createdOn: '2024-01-01T00:01:00.000Z', actorId: 'actor-1', vector: 'a:2' },
          { id: 'evt-003', _createdOn: '2024-01-01T00:02:00.000Z', actorId: 'actor-1', vector: 'a:3' },
          { id: 'evt-004', _createdOn: '2024-01-01T00:03:00.000Z', actorId: 'actor-1', vector: 'a:4' },
          { id: 'evt-005', _createdOn: '2024-01-01T00:04:00.000Z', actorId: 'actor-1', vector: 'a:5' }
        ]
        await events.storeEvents('actor-1', testEvents)
      })

      it('should get all events for actor', async () => {
        const result = await events.getEventsFor('actor-1')
        expect(result).toHaveLength(5)
      })

      it('should get events after a specific event ID', async () => {
        const result = await events.getEventsFor('actor-1', 'evt-002')
        expect(result).toHaveLength(3)
        expect(result.map(e => e.id)).toEqual(['evt-003', 'evt-004', 'evt-005'])
      })

      it('should return empty array for non-existent actor', async () => {
        const result = await events.getEventsFor('non-existent')
        expect(result).toEqual([])
      })

      it('should return empty array when lastEventId is the last event', async () => {
        const result = await events.getEventsFor('actor-1', 'evt-005')
        expect(result).toEqual([])
      })

      it('should return all events when lastEventId is before first event', async () => {
        const result = await events.getEventsFor('actor-1', 'evt-000')
        expect(result).toHaveLength(5)
      })
    })

    describe('getEventsSince', () => {
      beforeEach(async () => {
        const testEvents: Event[] = [
          { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' },
          { id: 'evt-002', _createdOn: '2024-01-01T06:00:00.000Z', actorId: 'actor-1', vector: 'a:2' },
          { id: 'evt-003', _createdOn: '2024-01-01T12:00:00.000Z', actorId: 'actor-1', vector: 'a:3' },
          { id: 'evt-004', _createdOn: '2024-01-01T18:00:00.000Z', actorId: 'actor-1', vector: 'a:4' },
          { id: 'evt-005', _createdOn: '2024-01-02T00:00:00.000Z', actorId: 'actor-1', vector: 'a:5' }
        ]
        await events.storeEvents('actor-1', testEvents)
      })

      it('should get events since a specific date', async () => {
        const result = await events.getEventsSince('actor-1', '2024-01-01T12:00:00.000Z')
        expect(result).toHaveLength(3)
        expect(result.map(e => e.id)).toEqual(["evt-003", "evt-004", "evt-005"])
      })

      it('should return empty array when date is after all events', async () => {
        const result = await events.getEventsSince('actor-1', '2024-12-31T23:59:59.999Z')
        expect(result).toEqual([])
      })

      it('should return all events when date is before all events', async () => {
        const result = await events.getEventsSince('actor-1', '2023-12-31T23:59:59.999Z')
        expect(result).toHaveLength(5)
      })

      it('should handle exact timestamp match', async () => {
        const result = await events.getEventsSince('actor-1', '2024-01-01T12:00:00.000Z')
        // Events created exactly at or after the timestamp
        expect(result.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('Event Streaming', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE event_test_event CASCADE'))

      const testEvents: Event[] = [
        { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1', type: 'UserCreated' },
        { id: 'evt-002', _createdOn: '2024-01-01T01:00:00.000Z', actorId: 'actor-1', vector: 'a:2', type: 'UserUpdated' },
        { id: 'evt-003', _createdOn: '2024-01-01T02:00:00.000Z', actorId: 'actor-1', vector: 'a:3', type: 'UserUpdated' },
        { id: 'evt-004', _createdOn: '2024-01-01T03:00:00.000Z', actorId: 'actor-1', vector: 'a:4', type: 'UserDeleted' },
        { id: 'evt-005', _createdOn: '2024-01-01T04:00:00.000Z', actorId: 'actor-1', vector: 'a:5', type: 'UserCreated' }
      ]
      await events.storeEvents('actor-1', testEvents)
    })

    describe('getEventStreamFor', () => {
      it('should stream all events for actor', async () => {
        const stream = await events.getEventStreamFor('actor-1', {})
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toHaveLength(5)
      })

      it('should filter events by custom filter function', async () => {
        const stream = await events.getEventStreamFor('actor-1', {
          filter: (e) => e.type === 'UserUpdated'
        })
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toHaveLength(2)
        expect(collected.every(e => e.type === 'UserUpdated')).toBe(true)
      })

      it('should limit by sinceId', async () => {
        const stream = await events.getEventStreamFor('actor-1', {
          sinceId: 'evt-002'
        })
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toHaveLength(3)
        expect(collected.map(e => e.id)).toEqual(['evt-003', 'evt-004', 'evt-005'])
      })

      it('should limit by untilId', async () => {
        const stream = await events.getEventStreamFor('actor-1', {
          untilId: 'evt-003'
        })
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toHaveLength(3)
        expect(collected.map(e => e.id)).toEqual(['evt-001', 'evt-002', 'evt-003'])
      })

      it('should limit by both sinceId and untilId', async () => {
        const stream = await events.getEventStreamFor('actor-1', {
          sinceId: 'evt-001',
          untilId: 'evt-004'
        })
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toHaveLength(3)
        expect(collected.map(e => e.id)).toEqual(['evt-002', 'evt-003', 'evt-004'])
      })

      it('should limit by since date', async () => {
        const stream = await events.getEventStreamFor('actor-1', {
          since: '2024-01-01T02:00:00.000Z'
        })
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected.length).toBeGreaterThanOrEqual(2)
      })

      it('should limit by until date', async () => {
        const stream = await events.getEventStreamFor('actor-1', {
          until: '2024-01-01T02:00:00.000Z'
        })
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected.length).toBeLessThanOrEqual(3)
      })

      it('should combine date range and filter', async () => {
        const stream = await events.getEventStreamFor('actor-1', {
          since: '2024-01-01T01:00:00.000Z',
          until: '2024-01-01T04:00:00.000Z',
          filter: (e) => e.type === 'UserUpdated'
        })
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected.every(e => e.type === 'UserUpdated')).toBe(true)
      })

      it('should return empty stream for non-existent actor', async () => {
        const stream = await events.getEventStreamFor('non-existent', {})
        const collected: Event[] = []

        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toEqual([])
      })

      it('should handle early stream termination', async () => {
        const stream = await events.getEventStreamFor('actor-1', {})
        const collected: Event[] = []
        let count = 0

        for await (const event of stream) {
          collected.push(event)
          count++
          if (count >= 3) break
        }

        expect(collected).toHaveLength(3)
      })
    })
  })

  describe('Event Packs', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE event_test_eventpack CASCADE'))
    })

    describe('storeEventPack', () => {
      it('should store an event pack', async () => {
        if (!events.storeEventPack) {
          return // Skip if not implemented
        }

        const packEvents: Event[] = [
          { id: 'evt-pack-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' },
          { id: 'evt-pack-002', _createdOn: '2024-01-01T00:01:00.000Z', actorId: 'actor-1', vector: 'a:2' }
        ]

        await events.storeEventPack('actor-1', 'a:2;b:1', packEvents)

        const retrieved = await events.getEventPackFor!('actor-1', 'a:2;b:1')
        expect(retrieved).toEqual(packEvents)
      })

      it('should store multiple event packs for same actor with different vectors', async () => {
        if (!events.storeEventPack) {
          return
        }

        const pack1: Event[] = [
          { id: 'evt-p1-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' }
        ]

        const pack2: Event[] = [
          { id: 'evt-p2-001', _createdOn: '2024-01-01T01:00:00.000Z', actorId: 'actor-1', vector: 'a:2' }
        ]

        await events.storeEventPack('actor-1', 'a:1', pack1)
        await events.storeEventPack('actor-1', 'a:2', pack2)

        const retrieved1 = await events.getEventPackFor!('actor-1', 'a:1')
        const retrieved2 = await events.getEventPackFor!('actor-1', 'a:2')

        expect(retrieved1).toEqual(pack1)
        expect(retrieved2).toEqual(pack2)
      })

      it('should update event pack when storing with same id and vector', async () => {
        if (!events.storeEventPack) {
          return
        }

        const pack1: Event[] = [
          { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' }
        ]

        const pack2: Event[] = [
          { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' },
          { id: 'evt-002', _createdOn: '2024-01-01T00:01:00.000Z', actorId: 'actor-1', vector: 'a:2' }
        ]

        await events.storeEventPack('actor-1', 'a:1', pack1)
        await events.storeEventPack('actor-1', 'a:1', pack2)

        const retrieved = await events.getEventPackFor!('actor-1', 'a:1')
        expect(retrieved).toEqual(pack2)
        expect(retrieved).toHaveLength(2)
      })

      it('should handle empty event pack array', async () => {
        if (!events.storeEventPack) {
          return
        }

        await events.storeEventPack('actor-1', 'a:1', [])

        const retrieved = await events.getEventPackFor!('actor-1', 'a:1')
        expect(retrieved).toEqual([])
      })

      it('should preserve complex vector clocks', async () => {
        if (!events.storeEventPack) {
          return
        }

        const pack: Event[] = [
          { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:5;b:3;c:1' }
        ]

        const complexVector = 'a:5;b:3;c:1;node-123:42'

        await events.storeEventPack('actor-1', complexVector, pack)

        const retrieved = await events.getEventPackFor!('actor-1', complexVector)
        expect(retrieved).toEqual(pack)
      })
    })

    describe('getEventPackFor', () => {
      it('should return undefined for non-existent event pack', async () => {
        if (!events.getEventPackFor) {
          return
        }

        const result = await events.getEventPackFor('non-existent', 'a:1')
        expect(result).toBeUndefined()
      })

      it('should return undefined for wrong vector', async () => {
        if (!events.storeEventPack || !events.getEventPackFor) {
          return
        }

        const pack: Event[] = [
          { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' }
        ]

        await events.storeEventPack('actor-1', 'a:1', pack)

        const result = await events.getEventPackFor('actor-1', 'a:2')
        expect(result).toBeUndefined()
      })

      it('should retrieve pack with large event set', async () => {
        if (!events.storeEventPack || !events.getEventPackFor) {
          return
        }

        const largepack: Event[] = Array.from({ length: 100 }, (_, i) => ({
          id: `evt-${String(i).padStart(3, '0')}`,
          _createdOn: new Date(2024, 0, 1, 0, i).toISOString(),
          actorId: 'actor-1',
          vector: `a:${i + 1}`
        }))

        await events.storeEventPack('actor-1', 'a:100', largepack)

        const retrieved = await events.getEventPackFor('actor-1', 'a:100')
        expect(retrieved).toHaveLength(100)
        expect(retrieved).toEqual(largepack)
      })
    })
  })

  describe('Data Integrity', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE event_test_event CASCADE'))
    })

    it('should maintain event order by ID', async () => {
      const events1: Event[] = [
        { id: 'evt-003', _createdOn: '2024-01-01T02:00:00.000Z', actorId: 'actor-1', vector: 'a:3' },
        { id: 'evt-001', _createdOn: '2024-01-01T00:00:00.000Z', actorId: 'actor-1', vector: 'a:1' },
        { id: 'evt-002', _createdOn: '2024-01-01T01:00:00.000Z', actorId: 'actor-1', vector: 'a:2' }
      ]

      await events.storeEvents('actor-1', events1)

      const retrieved = await events.getEventsFor('actor-1')
      expect(retrieved.map(e => e.id)).toEqual(['evt-001', 'evt-002', 'evt-003'])
    })

    it('should handle duplicate event IDs gracefully', async () => {
      const event1: Event = {
        id: 'evt-001',
        _createdOn: '2024-01-01T00:00:00.000Z',
        actorId: 'actor-1',
        vector: 'a:1'
      }

      const event2: Event = {
        id: 'evt-001', // Duplicate ID
        _createdOn: '2024-01-01T00:01:00.000Z',
        actorId: 'actor-1',
        vector: 'a:2'
      }

      await events.storeEvents('actor-1', [event1])

      // Second insert should fail or update depending on implementation
      await expect(events.storeEvents('actor-1', [event2])).rejects.toThrow()
    })

    it('should preserve vector clock information', async () => {
      const event: Event = {
        id: 'evt-001',
        _createdOn: '2024-01-01T00:00:00.000Z',
        actorId: 'actor-1',
        vector: 'a:5;b:3;c:1'
      }

      await events.storeEvents('actor-1', [event])

      const retrieved = await events.getEventsFor('actor-1')
      expect(retrieved[0].vector).toBe('a:5;b:3;c:1')
    })

    it('should handle special characters in event data', async () => {
      const event: Event = {
        id: 'evt-001',
        _createdOn: '2024-01-01T00:00:00.000Z',
        actorId: 'actor-1',
        vector: 'a:1',
        data: {
          text: 'Special chars: \'"\\n\\t',
          unicode: '你好世界 🌍',
          sql: "'; DROP TABLE users; --"
        }
      }

      await events.storeEvents('actor-1', [event])

      const retrieved = await events.getEventsFor('actor-1')
      expect(retrieved[0].data).toEqual(event.data)
    })
  })

  describe('Performance and Scale', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE event_test_event CASCADE'))
    })

    it('should handle large batch event storage', async () => {
      const largeEventSet: Event[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `evt-${String(i).padStart(4, '0')}`,
        _createdOn: new Date(2024, 0, 1, 0, 0, i).toISOString(),
        actorId: 'actor-1',
        vector: `a:${i + 1}`
      }))

      await events.storeEvents('actor-1', largeEventSet)

      const retrieved = await events.getEventsFor('actor-1')
      expect(retrieved).toHaveLength(1000)
    })

    it('should efficiently retrieve subset of large event set', async () => {
      const largeEventSet: Event[] = Array.from({ length: 100 }, (_, i) => ({
        id: `evt-${String(i).padStart(3, '0')}`,
        _createdOn: new Date(2024, 0, 1, 0, i).toISOString(),
        actorId: 'actor-1',
        vector: `a:${i + 1}`
      }))

      await events.storeEvents('actor-1', largeEventSet)

      const subset = await events.getEventsFor('actor-1', 'evt-090')
      expect(subset).toHaveLength(9) // evt-091 through evt-099
    })

    it('should handle concurrent event storage for different actors', async () => {
      const actors = Array.from({ length: 10 }, (_, i) => `actor-${i}`)

      const storePromises = actors.map(actorId => {
        const evts: Event[] = Array.from({ length: 10 }, (_, j) => ({
          id: `evt-${actorId}-${j}`,
          _createdOn: new Date(2024, 0, 1, 0, j).toISOString(),
          actorId,
          vector: `${actorId}:${j + 1}`
        }))
        return events.storeEvents(actorId, evts)
      })

      await Promise.all(storePromises)

      // Verify each actor has their events
      for (const actorId of actors) {
        const retrieved = await events.getEventsFor(actorId)
        expect(retrieved).toHaveLength(10)
      }
    })
  })
})
