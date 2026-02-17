import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initialize } from '../../src/index.js'
import type { ConsequentPostgres, ActorStore, Actor } from '../../src/types.js'

describe('Actor Adapter', () => {
  describe('when connection is valid', () => {
    let adapter: ConsequentPostgres
    let actors: ActorStore

    beforeAll(async () => {
      adapter = initialize({
        connectionString: 'postgresql://consequent:pgadmin@localhost:5431/consequent'
      })
      actors = await adapter.actor.create('test')
    })

    describe('it should store instance and map ids correctly', () => {
      let instance: Actor
      let date: string

      beforeAll(async () => {
        date = new Date().toISOString()
        instance = {
          id: 'actor-id-1',
          title: 'this is a title',
          rank: '0100',
          lastEventId: 'event-1',
          lastCommandId: '',
          lastCommandHandledOn: date,
          lastEventAppliedOn: date
        }
        await Promise.all([
          actors.store('actor-id-1', 'a:1', instance),
          actors.mapIds('abcd0001', 'actor-id-1')
        ])
      })

      it('should find record by actor id', async () => {
        const result = await actors.fetch('actor-id-1')
        expect(result).toEqual(instance)
      })

      it('should find record by actor id and last event id', async () => {
        const result = await actors.fetchByLastEventId('actor-id-1', 'event-1')
        expect(result).toEqual(instance)
      })

      it('should find record by actor id and last event date', async () => {
        const result = await actors.fetchByLastEventDate('actor-id-1', date)
        expect(result).toEqual(instance)
      })

      it('should get actor id by system id', async () => {
        const result = await actors.getActorId('abcd0001')
        expect(result).toBe('actor-id-1')
      })

      it('should get system id by actor id', async () => {
        const result = await actors.getSystemId('actor-id-1')
        expect(result).toBe('abcd0001')
      })
    })

    afterAll(async () => {
      await adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE test_snapshot'),
          pg.query('TRUNCATE TABLE test_id_map')
        ])
      )
      await adapter.close()
    })
  })
})
