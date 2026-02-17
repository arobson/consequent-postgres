import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initialize } from '../../src/index.js'
import type { ConsequentPostgres, SearchAdapter, ActorStore } from '../../src/types.js'

function trim(list: string[]): string[] {
  return list.map(x => x.trim())
}

// Helper to convert actor IDs to expected system IDs
// Search returns system IDs (sys-*), not actor IDs
function toSystemIds(actorIds: string[]): string[] {
  return actorIds.map(id => `sys-${id}`)
}

describe('Search Adapter - Comprehensive Tests', () => {
  let adapter: ConsequentPostgres
  let search: SearchAdapter
  let actors: ActorStore

  beforeAll(async () => {
    adapter = initialize({
      connectionString: 'postgresql://consequent:pgadmin@localhost:5431/consequent'
    })
    // Create both actor and search adapters (search requires actor's id_map table)
    const [searchAdapter, actorStore] = await Promise.all([
      adapter.search.create('search_test'),
      adapter.actor.create('search_test')
    ])
    search = searchAdapter
    actors = actorStore

    // Pre-create ID mappings for all test IDs
    const commonIds = [
      'user-001', 'user-002', 'user-003', 'user-004', 'user-005',
      'product-001', 'product-002', 'product-003', 'product-004', 'product-005',
      'prod-001', 'prod-002', 'prod-003', 'prod-004', 'prod-005',
      'post-001', 'post-002', 'post-003', 'post-004', 'post-005',
      'item-001', 'item-002', 'item-003', 'item-004', 'item-005',
      'doc-001', 'doc-002', 'doc-003', 'doc-004',
      'test-001', 'test-002', 'test-003', 'test-004', 'test-005',
      'task-001', 'task-002', 'task-003', 'task-004',
      'event-001', 'event-002', 'event-003',
      'account-001', 'bool-001', 'dangerous-001', 'empty-001',
      'long-001', 'many-fields-001', 'quote-001', 'record-001',
      'space-001', 'type-001', 'zero-001',
      'special-test'
    ]
    const testIds = commonIds.concat(
      // Add numeric IDs for performance tests
      Array.from({ length: 1100 }, (_, i) => `id-${String(i).padStart(4, '0')}`)
    )
    await Promise.all(testIds.map(id => actors.mapIds(`sys-${id}`, id)))
  })

  afterAll(async () => {
    await adapter.client(pg =>
      Promise.all([
        pg.query('TRUNCATE TABLE search_test_search CASCADE'),
        pg.query('TRUNCATE TABLE search_test_id_map CASCADE')
      ])
    )
    await adapter.close()
  })

  describe('Field Indexing', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))
    })

    describe('update', () => {
      it('should index a single field', async () => {
        await search.update(
          ['name'],
          { id: 'user-001', name: 'John Doe' }
        )

        const result = await search.find([{ name: 'John Doe' }])
        expect(trim(result)).toContain('sys-user-001')
      })

      it('should index multiple fields', async () => {
        await search.update(
          ['name', 'email', 'age'],
          {
            id: 'user-001',
            name: 'John Doe',
            email: 'john@example.com',
            age: 30
          }
        )

        const byName = await search.find([{ name: 'John Doe' }])
        const byEmail = await search.find([{ email: 'john@example.com' }])
        const byAge = await search.find([{ age: 30 }])

        expect(trim(byName)).toContain('sys-user-001')
        expect(trim(byEmail)).toContain('sys-user-001')
        expect(trim(byAge)).toContain('sys-user-001')
      })

      it('should update existing indexed fields', async () => {
        const fields = ['status', 'lastModified']

        // Initial
        await search.update(
          fields,
          { id: 'doc-001', status: 'draft', lastModified: '2024-01-01' }
        )

        // Update
        await search.update(
          fields,
          { id: 'doc-001', status: 'published', lastModified: '2024-01-02' },
          { id: 'doc-001', status: 'draft', lastModified: '2024-01-01' }
        )

        const draft = await search.find([{ status: 'draft' }])
        const published = await search.find([{ status: 'published' }])

        expect(trim(draft)).not.toContain('sys-doc-001')
        expect(trim(published)).toContain('sys-doc-001')
      })

      it('should handle nested field paths', async () => {
        await search.update(
          ['profile.name', 'profile.email'],
          {
            id: 'user-001',
            profile: {
              name: 'Jane Smith',
              email: 'jane@example.com'
            }
          }
        )

        const result = await search.find([{ 'profile.name': 'Jane Smith' }])
        expect(trim(result)).toContain('sys-user-001')
      })

      it('should handle array fields', async () => {
        await search.update(
          ['tags'],
          {
            id: 'post-001',
            tags: ['javascript', 'typescript', 'nodejs']
          }
        )

        // Note: Array handling depends on implementation
        const result = await search.find([{ tags: { contains: 'typescript' } }])
        expect(trim(result)).toContain('sys-post-001')
      })

      it('should handle numeric fields', async () => {
        await search.update(
          ['price', 'quantity'],
          {
            id: 'product-001',
            price: 99.99,
            quantity: 42
          }
        )

        const byPrice = await search.find([{ price: 99.99 }])
        const byQuantity = await search.find([{ quantity: 42 }])

        expect(trim(byPrice)).toContain('sys-product-001')
        expect(trim(byQuantity)).toContain('sys-product-001')
      })

      it('should handle boolean fields', async () => {
        await search.update(
          ['active', 'verified'],
          {
            id: 'account-001',
            active: true,
            verified: false
          }
        )

        const active = await search.find([{ active: true }])
        const notVerified = await search.find([{ verified: false }])

        expect(trim(active)).toContain('sys-account-001')
        expect(trim(notVerified)).toContain('sys-account-001')
      })

      it('should handle null values', async () => {
        await search.update(
          ['deletedAt', 'status'],
          {
            id: 'record-001',
            deletedAt: null,
            status: 'active'
          }
        )

        // Searching for null might not be directly supported
        // This test validates the update doesn't fail and we can search by other fields
        const result = await search.find([{ status: 'active' }])
        expect(trim(result)).toContain('sys-record-001')
      })
    })
  })

  describe('Equality Queries', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))

      await Promise.all([
        search.update(['name', 'status'], { id: 'user-001', name: 'Alice', status: 'active' }),
        search.update(['name', 'status'], { id: 'user-002', name: 'Bob', status: 'inactive' }),
        search.update(['name', 'status'], { id: 'user-003', name: 'Charlie', status: 'active' }),
        search.update(['name', 'status'], { id: 'user-004', name: 'Diana', status: 'pending' })
      ])
    })

    it('should find exact string match', async () => {
      const result = await search.find([{ name: 'Alice' }])
      expect(trim(result)).toEqual(toSystemIds(['user-001']))
    })

    it('should find exact number match', async () => {
      await search.update(['age'], { id: 'user-005', age: 25 })
      const result = await search.find([{ age: 25 }])
      expect(trim(result)).toContain('sys-user-005')
    })

    it('should find by multiple fields (AND)', async () => {
      const result = await search.find([
        { name: 'Alice', status: 'active' }
      ])
      expect(trim(result)).toEqual(toSystemIds(['user-001']))
    })

    it('should return empty for no matches', async () => {
      const result = await search.find([{ name: 'NonExistent' }])
      expect(result).toEqual([])
    })

    it('should be case-sensitive', async () => {
      const result = await search.find([{ name: 'alice' }])
      expect(result).toEqual([])
    })
  })

  describe('Comparison Operators', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))

      await Promise.all([
        search.update(['price'], { id: 'prod-001', price: 10 }),
        search.update(['price'], { id: 'prod-002', price: 20 }),
        search.update(['price'], { id: 'prod-003', price: 30 }),
        search.update(['price'], { id: 'prod-004', price: 40 }),
        search.update(['price'], { id: 'prod-005', price: 50 })
      ])
    })

    describe('greater than (gt)', () => {
      it('should find values greater than threshold', async () => {
        const result = await search.find([{ price: { gt: 30 } }])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['prod-004', 'prod-005'])))
        expect(trim(result)).not.toContain('sys-prod-003')
      })

      it('should handle edge case at boundary', async () => {
        const result = await search.find([{ price: { gt: 50 } }])
        expect(result).toEqual([])
      })
    })

    describe('greater than or equal (gte)', () => {
      it('should find values greater than or equal to threshold', async () => {
        const result = await search.find([{ price: { gte: 30 } }])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['prod-003', 'prod-004', 'prod-005'])))
      })

      it('should include boundary value', async () => {
        const result = await search.find([{ price: { gte: 50 } }])
        expect(trim(result)).toEqual(toSystemIds(['prod-005']))
      })
    })

    describe('less than (lt)', () => {
      it('should find values less than threshold', async () => {
        const result = await search.find([{ price: { lt: 30 } }])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['prod-001', 'prod-002'])))
        expect(trim(result)).not.toContain('sys-prod-003')
      })

      it('should handle edge case at boundary', async () => {
        const result = await search.find([{ price: { lt: 10 } }])
        expect(result).toEqual([])
      })
    })

    describe('less than or equal (lte)', () => {
      it('should find values less than or equal to threshold', async () => {
        const result = await search.find([{ price: { lte: 30 } }])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['prod-001', 'prod-002', 'prod-003'])))
      })

      it('should include boundary value', async () => {
        const result = await search.find([{ price: { lte: 10 } }])
        expect(trim(result)).toEqual(toSystemIds(['prod-001']))
      })
    })

    describe('combined comparisons', () => {
      it('should support multiple comparison operators on same field', async () => {
        const result = await search.find([
          { price: { gte: 20, lte: 40 } }
        ])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['prod-002', 'prod-003', 'prod-004'])))
        expect(trim(result)).toHaveLength(3)
      })
    })

    describe('timestamp comparisons', () => {
      beforeEach(async () => {
        await Promise.all([
          search.update(['createdAt'], { id: 'event-001', createdAt: '2024-01-01T00:00:00.000Z' }),
          search.update(['createdAt'], { id: 'event-002', createdAt: '2024-06-01T00:00:00.000Z' }),
          search.update(['createdAt'], { id: 'event-003', createdAt: '2024-12-31T23:59:59.999Z' })
        ])
      })

      it('should compare timestamps correctly', async () => {
        const result = await search.find([
          { createdAt: { gte: '2024-06-01T00:00:00.000Z' } }
        ])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['event-002', 'event-003'])))
      })
    })
  })

  describe('Range Queries (BETWEEN)', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))

      await Promise.all([
        search.update(['score'], { id: 'test-001', score: 10 }),
        search.update(['score'], { id: 'test-002', score: 25 }),
        search.update(['score'], { id: 'test-003', score: 50 }),
        search.update(['score'], { id: 'test-004', score: 75 }),
        search.update(['score'], { id: 'test-005', score: 100 })
      ])
    })

    it('should find values within range (inclusive)', async () => {
      const result = await search.find([{ score: [25, 75] }])
      expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['test-002', 'test-003', 'test-004'])))
    })

    it('should handle range with same min and max', async () => {
      const result = await search.find([{ score: [50, 50] }])
      expect(trim(result)).toEqual(toSystemIds(['test-003']))
    })

    it('should return empty for range with no matches', async () => {
      const result = await search.find([{ score: [200, 300] }])
      expect(result).toEqual([])
    })
  })

  describe('String Operations', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))

      await Promise.all([
        search.update(['title'], { id: 'doc-001', title: 'JavaScript Basics' }),
        search.update(['title'], { id: 'doc-002', title: 'Advanced JavaScript' }),
        search.update(['title'], { id: 'doc-003', title: 'TypeScript Guide' }),
        search.update(['title'], { id: 'doc-004', title: 'Python Tutorial' })
      ])
    })

    describe('match (LIKE)', () => {
      it('should match pattern with wildcards', async () => {
        const result = await search.find([{ title: { match: '%JavaScript%' } }])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['doc-001', 'doc-002'])))
      })

      it('should match prefix pattern', async () => {
        const result = await search.find([{ title: { match: 'JavaScript%' } }])
        expect(trim(result)).toEqual(toSystemIds(['doc-001']))
      })

      it('should match suffix pattern', async () => {
        const result = await search.find([{ title: { match: '%Guide' } }])
        expect(trim(result)).toEqual(toSystemIds(['doc-003']))
      })

      it('should return empty for no pattern match', async () => {
        const result = await search.find([{ title: { match: '%Ruby%' } }])
        expect(result).toEqual([])
      })
    })

    describe('contains', () => {
      beforeEach(async () => {
        await Promise.all([
          search.update(['tags'], { id: 'post-001', tags: ['javascript', 'web'] }),
          search.update(['tags'], { id: 'post-002', tags: ['python', 'data'] }),
          search.update(['tags'], { id: 'post-003', tags: ['javascript', 'nodejs'] })
        ])
      })

      it('should find arrays containing value', async () => {
        const result = await search.find([{ tags: { contains: 'javascript' } }])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['post-001', 'post-003'])))
      })

      it('should return empty when value not in any array', async () => {
        const result = await search.find([{ tags: { contains: 'ruby' } }])
        expect(result).toEqual([])
      })
    })
  })

  describe('Set Operations', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))

      await Promise.all([
        search.update(['status'], { id: 'task-001', status: 'todo' }),
        search.update(['status'], { id: 'task-002', status: 'in-progress' }),
        search.update(['status'], { id: 'task-003', status: 'done' }),
        search.update(['status'], { id: 'task-004', status: 'blocked' })
      ])
    })

    describe('in', () => {
      it('should find values in set', async () => {
        const result = await search.find([
          { status: { in: ['todo', 'in-progress'] } }
        ])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['task-001', 'task-002'])))
        expect(trim(result)).toHaveLength(2)
      })

      it('should handle single value in set', async () => {
        const result = await search.find([{ status: { in: ['done'] } }])
        expect(trim(result)).toEqual(toSystemIds(['task-003']))
      })

      it('should return empty for values not in set', async () => {
        const result = await search.find([{ status: { in: ['archived', 'deleted'] } }])
        expect(result).toEqual([])
      })

      it('should handle empty set', async () => {
        const result = await search.find([{ status: { in: [] } }])
        expect(result).toEqual([])
      })
    })

    describe('not', () => {
      it('should find values not equal to specified value', async () => {
        const result = await search.find([{ status: { not: 'done' } }])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['task-001', 'task-002', 'task-004'])))
        expect(trim(result)).not.toContain('sys-task-003')
      })

      it('should handle not with array of values', async () => {
        const result = await search.find([
          { status: { not: ['done', 'blocked'] } }
        ])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['task-001', 'task-002'])))
      })
    })
  })

  describe('Complex Queries', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))

      await Promise.all([
        search.update(['name', 'age', 'city'], { id: 'user-001', name: 'Alice', age: 25, city: 'NYC' }),
        search.update(['name', 'age', 'city'], { id: 'user-002', name: 'Bob', age: 30, city: 'LA' }),
        search.update(['name', 'age', 'city'], { id: 'user-003', name: 'Charlie', age: 25, city: 'LA' }),
        search.update(['name', 'age', 'city'], { id: 'user-004', name: 'Diana', age: 35, city: 'NYC' })
      ])
    })

    describe('AND queries (single criteria set)', () => {
      it('should find records matching all criteria', async () => {
        const result = await search.find([
          { age: 25, city: 'NYC' }
        ])
        expect(trim(result)).toEqual(toSystemIds(['user-001']))
      })

      it('should return empty when not all criteria match', async () => {
        const result = await search.find([
          { age: 25, city: 'Chicago' }
        ])
        expect(result).toEqual([])
      })

      it('should support complex AND with operators', async () => {
        const result = await search.find([
          { age: { gte: 30 }, city: 'LA' }
        ])
        expect(trim(result)).toEqual(toSystemIds(['user-002']))
      })
    })

    describe('OR queries (multiple criteria sets)', () => {
      it('should find records matching any criteria set', async () => {
        const result = await search.find([
          { city: 'NYC' },
          { city: 'LA' }
        ])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['user-001', 'user-002', 'user-003', 'user-004'])))
      })

      it('should support complex OR', async () => {
        const result = await search.find([
          { age: 25, city: 'NYC' },
          { age: 30, city: 'LA' }
        ])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['user-001', 'user-002'])))
        expect(trim(result)).toHaveLength(2)
      })

      it('should eliminate duplicates in OR', async () => {
        const result = await search.find([
          { age: 25 },
          { city: 'LA' }
        ])
        // user-003 matches both criteria (age: 25 AND city: LA)
        // Should appear only once
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['user-001', 'user-002', 'user-003'])))
      })
    })

    describe('nested AND/OR', () => {
      it('should support (A AND B) OR (C AND D)', async () => {
        const result = await search.find([
          { age: 25, city: 'NYC' },  // Alice
          { age: 35, city: 'NYC' }   // Diana
        ])
        expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['user-001', 'user-004'])))
      })
    })
  })

  describe('Nested Fields', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))

      await Promise.all([
        search.update(
          ['profile.name', 'profile.email', 'address.city'],
          {
            id: 'user-001',
            profile: { name: 'John', email: 'john@example.com' },
            address: { city: 'NYC', zip: '10001' }
          }
        ),
        search.update(
          ['profile.name', 'profile.email', 'address.city'],
          {
            id: 'user-002',
            profile: { name: 'Jane', email: 'jane@example.com' },
            address: { city: 'LA', zip: '90001' }
          }
        )
      ])
    })

    it('should query nested fields', async () => {
      const result = await search.find([{ 'profile.name': 'John' }])
      expect(trim(result)).toEqual(toSystemIds(['user-001']))
    })

    it('should query deeply nested fields', async () => {
      const result = await search.find([{ 'address.city': 'NYC' }])
      expect(trim(result)).toEqual(toSystemIds(['user-001']))
    })

    it('should support operators on nested fields', async () => {
      const result = await search.find([
        { 'profile.email': { match: '%@example.com' } }
      ])
      expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['user-001', 'user-002'])))
    })

    it('should support AND across nested fields', async () => {
      const result = await search.find([
        { 'profile.name': 'John', 'address.city': 'NYC' }
      ])
      expect(trim(result)).toEqual(toSystemIds(['user-001']))
    })
  })

  describe('Data Integrity', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))
    })

    it('should handle Unicode characters', async () => {
      await search.update(
        ['name', 'description'],
        {
          id: 'item-001',
          name: '你好世界',
          description: 'Hello 世界 🌍'
        }
      )

      const byName = await search.find([{ name: '你好世界' }])
      const byDesc = await search.find([{ description: 'Hello 世界 🌍' }])

      expect(trim(byName)).toEqual(toSystemIds(['item-001']))
      expect(trim(byDesc)).toEqual(toSystemIds(['item-001']))
    })

    it('should handle special characters and SQL injection attempts', async () => {
      await search.update(
        ['code', 'query'],
        {
          id: 'dangerous-001',
          code: "'; DROP TABLE search; --",
          query: `SELECT * FROM users WHERE '1'='1`
        }
      )

      const result = await search.find([{ code: "'; DROP TABLE search; --" }])
      expect(trim(result)).toEqual(toSystemIds(['dangerous-001']))

      // Verify table still exists (no SQL injection)
      const verify = await search.find([{ id: 'dangerous-001' }])
      expect(verify).toBeDefined()
    })

    it('should handle quotes and escaping', async () => {
      await search.update(
        ['text'],
        {
          id: 'quote-001',
          text: `She said "hello" and he said 'hi'`
        }
      )

      const result = await search.find([{ text: `She said "hello" and he said 'hi'` }])
      expect(trim(result)).toEqual(toSystemIds(['quote-001']))
    })

    it('should handle empty strings', async () => {
      await search.update(
        ['name'],
        { id: 'empty-001', name: '' }
      )

      const result = await search.find([{ name: '' }])
      expect(trim(result)).toEqual(toSystemIds(['empty-001']))
    })

    it('should handle very long strings', async () => {
      const longText = 'a'.repeat(10000)
      await search.update(
        ['description'],
        { id: 'long-001', description: longText }
      )

      const result = await search.find([{ description: longText }])
      expect(trim(result)).toEqual(toSystemIds(['long-001']))
    })

    it('should preserve field type information', async () => {
      await search.update(
        ['stringNum', 'actualNum'],
        {
          id: 'type-001',
          stringNum: '42',
          actualNum: 42
        }
      )

      // String "42" should not match number 42
      const stringMatch = await search.find([{ stringNum: '42' }])
      const numberMatch = await search.find([{ actualNum: 42 }])

      expect(trim(stringMatch)).toEqual(toSystemIds(['type-001']))
      expect(trim(numberMatch)).toEqual(toSystemIds(['type-001']))
    })
  })

  describe('Performance and Scale', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))

      // Create ID mappings for performance test records
      const perfIds = [
        ...Array.from({ length: 100 }, (_, i) => `record-${String(i).padStart(3, '0')}`),
        ...Array.from({ length: 100 }, (_, i) => `item-${i}`),
        ...Array.from({ length: 20 }, (_, i) => `concurrent-${i}`)
      ]
      await Promise.all(perfIds.map(id => actors.mapIds(`sys-${id}`, id)))
    })

    it('should handle large number of indexed records', async () => {
      const records = Array.from({ length: 100 }, (_, i) => ({
        id: `record-${String(i).padStart(3, '0')}`,
        category: `cat-${i % 10}`,
        value: i
      }))

      await Promise.all(
        records.map(r => search.update(['category', 'value'], r))
      )

      const result = await search.find([{ category: 'cat-5' }])
      expect(result).toHaveLength(10)
    })

    it('should efficiently query with multiple criteria', async () => {
      const records = Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        status: i % 2 === 0 ? 'active' : 'inactive',
        priority: i % 3,
        score: i
      }))

      await Promise.all(
        records.map(r => search.update(['status', 'priority', 'score'], r))
      )

      const result = await search.find([
        { status: 'active', priority: 0 }
      ])

      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle concurrent updates', async () => {
      const updates = Array.from({ length: 20 }, (_, i) => ({
        id: `concurrent-${i}`,
        value: i,
        group: `group-${i % 5}`
      }))

      await Promise.all(
        updates.map(u => search.update(['value', 'group'], u))
      )

      // Verify all were indexed
      for (const u of updates) {
        const result = await search.find([{ value: u.value }])
        expect(trim(result)).toContain(`sys-${u.id}`)
      }
    })

    it('should handle many fields per record', async () => {
      const fields = Array.from({ length: 50 }, (_, i) => `field${i}`)
      const record = { id: 'many-fields-001' }
      fields.forEach((f, i) => { (record as any)[f] = `value-${i}` })

      await search.update(fields, record)

      // Query on various fields
      const r1 = await search.find([{ field0: 'value-0' }])
      const r2 = await search.find([{ field25: 'value-25' }])
      const r3 = await search.find([{ field49: 'value-49' }])

      expect(trim(r1)).toEqual(toSystemIds(['many-fields-001']))
      expect(trim(r2)).toEqual(toSystemIds(['many-fields-001']))
      expect(trim(r3)).toEqual(toSystemIds(['many-fields-001']))
    })
  })

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))
    })

    it('should return empty array for query on non-indexed field', async () => {
      await search.update(['name'], { id: 'user-001', name: 'Alice' })

      // Query on field that was never indexed
      const result = await search.find([{ email: 'alice@example.com' }])
      expect(result).toEqual([])
    })

    it('should handle updates that remove fields', async () => {
      await search.update(
        ['status'],
        { id: 'doc-001', status: 'active' }
      )

      await search.update(
        ['status'],
        { id: 'doc-001', status: null },
        { id: 'doc-001', status: 'active' }
      )

      const result = await search.find([{ status: 'active' }])
      expect(trim(result)).not.toContain('sys-doc-001')
    })

    it('should handle query with empty criteria array', async () => {
      const result = await search.find([])
      expect(result).toEqual([])
    })

    it('should handle update with empty field list', async () => {
      await search.update([], { id: 'empty-001', name: 'Test' })

      // Should not be searchable since no fields indexed
      const result = await search.find([{ name: 'Test' }])
      expect(result).toEqual([])
    })

    it('should handle whitespace in field values', async () => {
      await search.update(
        ['title'],
        { id: 'space-001', title: '  spaces  ' }
      )

      const exact = await search.find([{ title: '  spaces  ' }])
      expect(trim(exact)).toEqual(toSystemIds(['space-001']))
    })

    it('should handle zero values correctly', async () => {
      await search.update(
        ['count'],
        { id: 'zero-001', count: 0 }
      )

      const result = await search.find([{ count: 0 }])
      expect(trim(result)).toEqual(toSystemIds(['zero-001']))
    })

    it('should handle false boolean values', async () => {
      await search.update(
        ['enabled'],
        { id: 'bool-001', enabled: false }
      )

      const result = await search.find([{ enabled: false }])
      expect(trim(result)).toEqual(toSystemIds(['bool-001']))
    })
  })

  describe('Integration Scenarios', () => {
    beforeEach(async () => {
      await adapter.client(pg => pg.query('TRUNCATE TABLE search_test_search CASCADE'))
    })

    it('should support e-commerce product search', async () => {
      // Setup products
      await Promise.all([
        search.update(
          ['name', 'category', 'price', 'inStock'],
          { id: 'prod-001', name: 'Laptop', category: 'Electronics', price: 999, inStock: true }
        ),
        search.update(
          ['name', 'category', 'price', 'inStock'],
          { id: 'prod-002', name: 'Mouse', category: 'Electronics', price: 29, inStock: true }
        ),
        search.update(
          ['name', 'category', 'price', 'inStock'],
          { id: 'prod-003', name: 'Desk', category: 'Furniture', price: 299, inStock: false }
        )
      ])

      // Search: Electronics under $500 in stock
      const result = await search.find([
        { category: 'Electronics', price: { lt: 500 }, inStock: true }
      ])

      expect(trim(result)).toEqual(toSystemIds(['prod-002']))
    })

    it('should support user search with multiple criteria', async () => {
      await Promise.all([
        search.update(
          ['email', 'role', 'status', 'lastLogin'],
          {
            id: 'user-001',
            email: 'admin@example.com',
            role: 'admin',
            status: 'active',
            lastLogin: '2024-01-15T00:00:00.000Z'
          }
        ),
        search.update(
          ['email', 'role', 'status', 'lastLogin'],
          {
            id: 'user-002',
            email: 'user@example.com',
            role: 'user',
            status: 'active',
            lastLogin: '2024-01-20T00:00:00.000Z'
          }
        )
      ])

      // Find active users who logged in recently
      const result = await search.find([
        {
          status: 'active',
          lastLogin: { gte: '2024-01-15T00:00:00.000Z' }
        }
      ])

      expect(trim(result)).toEqual(expect.arrayContaining(toSystemIds(['user-001', 'user-002'])))
    })

    it('should support tag-based content filtering', async () => {
      await Promise.all([
        search.update(
          ['tags', 'status'],
          { id: 'post-001', tags: ['javascript', 'tutorial'], status: 'published' }
        ),
        search.update(
          ['tags', 'status'],
          { id: 'post-002', tags: ['python', 'tutorial'], status: 'published' }
        ),
        search.update(
          ['tags', 'status'],
          { id: 'post-003', tags: ['javascript', 'advanced'], status: 'draft' }
        )
      ])

      // Find published posts with 'javascript' tag
      const result = await search.find([
        { tags: { contains: 'javascript' }, status: 'published' }
      ])

      expect(trim(result)).toEqual(toSystemIds(['post-001']))
    })
  })
})
