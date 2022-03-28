require('../setup')

const Adapter = require('../../src/index')

function pad(x) {
  return [
    x,
    '                                          '.slice(x.length)
  ].join('')
}

function formatEvent (raw) {
  const event = {
    id: pad(raw.id),
    system_id: pad(raw.actorId),
    created_on: new Date(raw._createdOn),
    vector: raw.vector,
    version: '2',
    content: {
      id: raw.id,
      _createdOn: raw._createdOn,
      actorId: raw.actorId,
      vector: raw.vector
    }
  }
  return event
}

describe('Event Adapter', function () {
  describe('when connection is valid', function () {
    let adapter
    let events
    before(function () {
      adapter = Adapter({
        connectionString: 'postgresql://consequent:pgadmin@localhost:5431/consequent'
      })
      return adapter.event.create('test')
        .then(x => {
          events = x
        })
    })

    describe('it should store and retrieve events correctly', function () {
      let instances
      let date
      before(function () {
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
        return Promise.all([
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

      it('should get all events for actor', function () {
        return events.getEventsFor('a1')
          .should.eventually.eql([
            formatEvent(instances[0]),
            formatEvent(instances[1]),
            formatEvent(instances[3]),
            formatEvent(instances[4])
          ])
      })

      it('should get events for actor after event id', function () {
        return events.getEventsFor('a1', '0000000000000000002')
          .should.eventually.eql([
            formatEvent(instances[3]),
            formatEvent(instances[4])
          ])
      })

      it('should get events for actor after date', function () {
        return events.getEventsSince('a1', '2018-07-14T03:00:00.000Z')
          .should.eventually.eql([
            formatEvent(instances[3]),
            formatEvent(instances[4])
          ])
      })

      it('should get an event stream for actor with filter', async function () {
        let list = []
        const stream = await events.getEventStreamFor('a1', {
          filter: x =>
            x.id !== '0000000000000000004'

        })
        for await (const e of stream) {
          list.push(e)
        }
        list.should.eql([
          instances[0],
          instances[1],
          instances[4]
        ])
      })

      it('should get an event stream for actor limited by ids', async function () {
        let list = []
        const stream = await events.getEventStreamFor('a1', {
          sinceId: '0000000000000000001',
          untilId: '0000000000000000004'
        })
        for await (const e of stream) {
          list.push(e)
        }
        list.should.eql([
          instances[1],
          instances[3]
        ])
      })

      it('should get an event stream for actor limited by dates', async function () {
        let list = []
        const stream = await events.getEventStreamFor('a1', {
          since: '2018-07-14T01:38:00.000Z',
          until: '2018-07-15T03:10:00.000Z'
        })
        for await (const e of stream) {
          list.push(e)
        }
        list.should.eql([
          instances[1],
          instances[3],
          instances[4]
        ])
      })
    })

    after(async function () {
      return adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE test_event')
        ])
      ).then(
        () => adapter.close()
      )
    })
  })
})
