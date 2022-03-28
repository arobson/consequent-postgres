require('../setup')

const Adapter = require('../../src/index')

describe('Actor Adapter', function () {
  describe('when connection is valid', function () {
    let adapter
    let actors
    before(function () {
      adapter = Adapter({
        connectionString: 'postgresql://consequent:pgadmin@localhost:5431/consequent'
      })
      return adapter.actor.create('test')
        .then(x => {
          actors = x
        })
    })

    describe('it should store instance and map ids correctly', function () {
      let instance
      let date
      before(function () {
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
        return Promise.all([
          actors.store('actor-id-1', 'a:1', instance),
          actors.mapIds('abcd0001', 'actor-id-1')
        ])
      })

      it('should find record by actor id', function () {
        return actors.fetch('actor-id-1')
          .should.eventually.eql(instance)
      })

      it('should find record by actor id and last event id', function () {
        return actors.fetchByLastEventId('actor-id-1', 'event-1')
          .should.eventually.eql(instance)
      })

      it('should find record by actor id and last event date', function () {
        return actors.fetchByLastEventDate('actor-id-1', date)
          .should.eventually.eql(instance)
      })

      it('should get actor id by system id', function () {
        return actors.getActorId('abcd0001')
          .should.eventually.equal('actor-id-1')
      })

      it('should get system id by actor id', function () {
        return actors.getSystemId('actor-id-1')
          .should.eventually.equal('abcd0001')
      })
    })

    after(async function () {
      return adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE test_snapshot'),
          pg.query('TRUNCATE TABLE test_id_map')
        ])
      ).then(
        () => adapter.close()
      )
    })
  })
})
