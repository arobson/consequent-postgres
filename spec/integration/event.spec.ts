import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initialize } from '../../src/index.js'
import type { ConsequentPostgres, EventStore, Event } from '../../src/types.js'

function pad(x: string): string {
  return [
    x,
    '                                          '.slice(x.length)
  ].join('')
}

interface FormattedEvent {
  id: string
  system_id: string
  created_on: Date
  vector: string
  version: string
  content: {
    id: string
    _createdOn: string
    actorId: string
    vector: string
  }
}

function formatEvent(raw: Event): FormattedEvent {
  const event: FormattedEvent = {
    id: pad(raw.id),
    system_id: pad(raw.actorId as string),
    created_on: new Date(raw._createdOn),
    vector: raw.vector as string,
    version: '2',
    content: {
      id: raw.id,
      _createdOn: raw._createdOn,
      actorId: raw.actorId as string,
      vector: raw.vector as string
    }
  }
  return event
}

describe('Event Adapter', () => {
  describe('when connection is valid', () => {
    let adapter: ConsequentPostgres
    let events: EventStore

    beforeAll(async () => {
      adapter = initialize({
        connectionString: 'postgresql://consequent:pgadmin@localhost:5431/consequent'
      })
      events = await adapter.event.create('test')
    })

    describe('it should store and retrieve events correctly', () => {
      let instances: Event[]
      let date: string

      beforeAll(async () => {
        date = new Date().toISOString()
        instances = [
          {
            id: '0000000000000000001',
            _createdOn: '2018-07-14T01:37:00.000Z',
            actorId: 'a1',
            vector: 'a:1;b:1'
          },
          {
            id: '0000000000000000002',
            _createdOn: '2018-07-14T01:38:00.000Z',
            actorId: 'a1',
            vector: 'a:1;b:1'
          },
          {
            id: '0000000000000000003',
            _createdOn: '2018-07-14T01:38:30.000Z',
            actorId: 'b1',
            vector: 'b:2'
          },
          {
            id: '0000000000000000004',
            _createdOn: '2018-07-14T03:39:00.000Z',
            actorId: 'a1',
            vector: 'a:1;b:1'
          },
          {
            id: '0000000000000000005',
            _createdOn: '2018-07-15T03:10:00.000Z',
            actorId: 'a1',
            vector: 'a:1;b:1'
          },
          {
            id: '0000000000000000006',
            _createdOn: '2018-07-15T03:45:10.000Z',
            actorId: 'b1',
            vector: 'b:2;c1'
          }
        ]
        await Promise.all([
          events.storeEvents('a1', [
            instances[0],
            instances[1],
            instances[3],
            instances[4]
          ]),
          events.storeEvents('b1', [
            instances[2],
            instances[5]
          ])
        ])
      })

      it('should get all events for actor', async () => {
        const result = await events.getEventsFor('a1')
        expect(result).toEqual([
          instances[0],
          instances[1],
          instances[3],
          instances[4]
        ])
      })

      it('should get events for actor after event id', async () => {
        const result = await events.getEventsFor('a1', '0000000000000000002')
        expect(result).toEqual([
          instances[3],
          instances[4]
        ])
      })

      it('should get events for actor after date', async () => {
        const result = await events.getEventsSince('a1', '2018-07-14T03:00:00.000Z')
        expect(result).toEqual([
          instances[3],
          instances[4]
        ])
      })

      it('should get an event stream for actor with filter', async () => {
        const list: Event[] = []
        const stream = await events.getEventStreamFor('a1', {
          filter: x => x.id !== '0000000000000000004'
        })
        for await (const e of stream) {
          list.push(e)
        }
        expect(list).toEqual([
          instances[0],
          instances[1],
          instances[4]
        ])
      })

      it('should get an event stream for actor limited by ids', async () => {
        const list: Event[] = []
        const stream = await events.getEventStreamFor('a1', {
          sinceId: '0000000000000000001',
          untilId: '0000000000000000004'
        })
        for await (const e of stream) {
          list.push(e)
        }
        expect(list).toEqual([
          instances[1],
          instances[3]
        ])
      })

      it('should get an event stream for actor limited by dates', async () => {
        const list: Event[] = []
        const stream = await events.getEventStreamFor('a1', {
          since: '2018-07-14T01:38:00.000Z',
          until: '2018-07-15T03:10:00.000Z'
        })
        for await (const e of stream) {
          list.push(e)
        }
        expect(list).toEqual([
          instances[1],
          instances[3],
          instances[4]
        ])
      })
    })

    describe('event packs', () => {
      it('should store and retrieve event pack', async () => {
        const packEvents: Event[] = [
          {
            id: '0000000000000001001',
            _createdOn: '2018-08-01T10:00:00.000Z',
            actorId: 'pack1',
            vector: 'a:1;b:1'
          },
          {
            id: '0000000000000001002',
            _createdOn: '2018-08-01T10:01:00.000Z',
            actorId: 'pack1',
            vector: 'a:2;b:1'
          }
        ]

        // Store event pack
        if (events.storeEventPack) {
          await events.storeEventPack('pack1', 'a:2;b:1', packEvents)
        }

        // Retrieve event pack
        if (events.getEventPackFor) {
          const retrieved = await events.getEventPackFor('pack1', 'a:2;b:1')
          expect(retrieved).toEqual(packEvents)
        }
      })

      it('should return undefined for non-existent event pack', async () => {
        if (events.getEventPackFor) {
          const result = await events.getEventPackFor('nonexistent', 'a:1')
          expect(result).toBeUndefined()
        }
      })
    })

    afterAll(async () => {
      await adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE test_event'),
          pg.query('TRUNCATE TABLE test_eventpack')
        ])
      )
      await adapter.close()
    })
  })
})
