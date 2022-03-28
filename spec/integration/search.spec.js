require('../setup')

const Adapter = require('../../src/index')

function trim (list) {
  return list.map(x => x.trim())
}

describe('Search Adapter', function () {
  describe('when connection is valid', function () {
    let adapter
    let search
    let actors
    before(function () {
      adapter = Adapter({
        connectionString: 'postgresql://consequent:pgadmin@localhost:5431/consequent'
      })
      return Promise.all([
        adapter.search.create('test')
          .then(x => {
            search = x
          }),
        adapter.actor.create('test')
          .then(x => {
            actors = x
          })
      ])
      .then(
        () => {
          return Promise.all([
            actors.mapIds('000000000a', '0000000001'),
            actors.mapIds('000000000b', '0000000002'),
            actors.mapIds('000000000c', '0000000003'),
            actors.mapIds('000000000d', '0000000004'),
            actors.mapIds('000000000e', '0000000005'),
            actors.mapIds('000000000f', '0000000006'),
            actors.mapIds('00000000a0', '0000000007'),
            actors.mapIds('00000000ab', '0000000008'),
            actors.mapIds('00000000ac', '0000000009'),
            actors.mapIds('00000000ad', '0000000010'),
            actors.mapIds('00000000ae', '0000000011'),
            actors.mapIds('00000000af', '0000000012'),
            actors.mapIds('00000000b0', '0000000013'),
            actors.mapIds('00000000ba', '0000000014')
          ])
        }
      )
    })

    describe('it should set fields and find matches correctly', function () {
      let fields
      before(function () {
        fields = ['id', 'code', 'rate', 'on']
        return Promise.all([
          search.update(
            fields,
            { id: '0000000001',
              code: 'alpha',
              rate: 5,
              on: '2017-02-12T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000002',
              code: 'bravo',
              rate: 15,
              on: '2017-03-12T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000003',
              code: 'charlie',
              rate: 30,
              on: '2017-04-23T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000004',
              code: 'delta',
              rate: 47,
              on: '2017-04-08T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000005',
              code: 'echo',
              rate: 54,
              on: '2017-04-30T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000006',
              code: 'foxtrot',
              rate: 98,
              on: '2017-05-18T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000007',
              code: 'golf',
              rate: 123,
              on: '2017-06-03T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000008',
              code: 'hotel',
              rate: 164,
              on: '2017-06-27T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000009',
              code: 'india',
              rate: 200,
              on: '2017-07-18T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000010',
              code: 'juliett',
              rate: 238,
              on: '2017-08-01T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000011',
              code: 'kilo',
              rate: 241,
              on: '2017-08-21T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000012',
              code: 'lima',
              rate: 268,
              on: '2017-09-09T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000013',
              code: 'mike',
              rate: 292,
              on: '2017-10-20T08:00:00.000Z'
            }
          ),
          search.update(
            fields,
            { id: '0000000014',
              code: 'november',
              rate: 340,
              on: '2017-11-05T08:00:00.000Z'
            }
          )
        ])
      })

      describe('searching on id', function () {
        it('should find matches equal to', function () {
          return search.find([
            { id: '0000000001' }
          ])
          .then(trim)
          .should.eventually.eql(['000000000a'])
        })
      })

      describe('searching on date', function () {
        it('should find matches less than', function () {
          return search.find([
            { on: { lt: '2017-03-12T08:00:00.000Z' } }
          ])
          .then(trim)
          .should.eventually.eql(['000000000a'])
        })

        it('should find matches less than or equal to', function () {
          return search.find([
            { on: { lte: '2017-02-12T08:00:00.000Z' } }
          ])
          .then(trim)
          .should.eventually.eql(['000000000a'])
        })

        it('should find matches based on equality', function () {
          return search.find([
            { on: '2017-10-20T08:00:00.000Z' }
          ])
          .then(trim)
          .should.eventually.eql(['00000000b0'])
        })

        it('should find matches greater than or equal to', function () {
          return search.find([
            { on: { gte: '2017-11-05T08:00:00.000Z' } }
          ])
          .then(trim)
          .should.eventually.eql(['00000000ba'])
        })

        it('should find matches greater than', function () {
          return search.find([
            { on: { gt: '2017-10-20T08:00:00.000Z' } }
          ])
          .then(trim)
          .should.eventually.eql(['00000000ba'])
        })
      })


    })

    after(async function () {
      return adapter.client(pg =>
        Promise.all([
          pg.query('TRUNCATE TABLE test_id_map'),
          pg.query('TRUNCATE TABLE test_search'),
        ])
      ).then(
        () => adapter.close()
      )
    })
  })
})
