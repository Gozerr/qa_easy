import { describe, expect, it } from 'vitest'
import { runSqlQuery } from './sqlSandbox.js'

describe('read-only SQL learning sandbox', () => {
  it('filters, sorts, limits and projects rows from the sample tables', () => {
    expect(runSqlQuery('SELECT id, email FROM users WHERE active = true ORDER BY id ASC').rows).toEqual([
      { id: 1, email: 'anna@example.test' },
      { id: 3, email: 'maria@example.test' },
      { id: 4, email: 'timur@example.test' },
    ])
    expect(runSqlQuery('SELECT id, total FROM orders WHERE total >= 50 ORDER BY total DESC LIMIT 2').rows).toEqual([
      { id: 102, total: 120 },
      { id: 104, total: 80 },
    ])
  })

  it('allows only a single SELECT and blocks unknown tables, columns and writes', () => {
    expect(runSqlQuery('DELETE FROM users').error).toMatch(/SELECT/)
    expect(runSqlQuery('SELECT * FROM secrets').error).toMatch(/SELECT/)
    expect(runSqlQuery('SELECT token FROM users').error).toMatch(/столбцов/)
    expect(runSqlQuery('SELECT * FROM users; DROP TABLE users').error).toMatch(/SELECT/)
  })

  it('checks WHERE values and restricts the result size', () => {
    expect(runSqlQuery("SELECT id FROM orders WHERE status = 'pending' ORDER BY id").rows).toEqual([{ id: 101 }, { id: 103 }, { id: 105 }])
    expect(runSqlQuery('SELECT * FROM orders LIMIT 500').error).toMatch(/LIMIT/)
    expect(runSqlQuery('SELECT * FROM users WHERE unknown = true').error).toMatch(/столбца/)
  })

  it('supports INNER and LEFT JOIN with qualified columns and SQL NULL checks', () => {
    expect(runSqlQuery('SELECT users.name, orders.id, orders.total FROM users LEFT JOIN orders ON users.id = orders.user_id ORDER BY users.id, orders.id').rows).toEqual([
      { name: 'Анна', id: 101, total: 49.9 },
      { name: 'Анна', id: 104, total: 80 },
      { name: 'Илья', id: 102, total: 120 },
      { name: 'Мария', id: 103, total: 70 },
      { name: 'Тимур', id: null, total: null },
    ])
    expect(runSqlQuery('SELECT orders.id FROM orders INNER JOIN users ON orders.user_id = users.id ORDER BY orders.id').rows).toHaveLength(4)
    expect(runSqlQuery('SELECT orders.id FROM orders LEFT JOIN users ON orders.user_id = users.id WHERE users.id IS NULL').rows).toEqual([{ id: 105 }])
  })

  it('groups rows and calculates COUNT, SUM and AVG', () => {
    expect(runSqlQuery('SELECT users.name, COUNT(orders.id) AS order_count, SUM(orders.total) AS total, AVG(orders.total) AS average FROM users LEFT JOIN orders ON users.id = orders.user_id GROUP BY users.id, users.name ORDER BY total DESC').rows).toEqual([
      { name: 'Анна', order_count: 2, total: 129.9, average: 64.95 },
      { name: 'Илья', order_count: 1, total: 120, average: 120 },
      { name: 'Мария', order_count: 1, total: 70, average: 70 },
      { name: 'Тимур', order_count: 0, total: null, average: null },
    ])
    expect(runSqlQuery('SELECT COUNT(*) AS total FROM orders').rows).toEqual([{ total: 5 }])
    expect(runSqlQuery('SELECT users.name, COUNT(*) FROM users LEFT JOIN orders ON users.id = orders.user_id').error).toMatch(/GROUP BY/)
  })

  it('filters grouped results with HAVING by aggregate expression or selected alias', () => {
    expect(runSqlQuery('SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status HAVING COUNT(*) > 1 ORDER BY status').rows).toEqual([
      { status: 'pending', order_count: 3 },
    ])
    expect(runSqlQuery('SELECT status, SUM(total) AS gross FROM orders GROUP BY status HAVING gross >= 100 ORDER BY gross DESC').rows).toEqual([
      { status: 'pending', gross: 149.9 },
      { status: 'paid', gross: 120 },
    ])
    expect(runSqlQuery("SELECT status, COUNT(*) AS order_count FROM orders WHERE status != 'cancelled' GROUP BY status HAVING order_count >= 1 ORDER BY status").rows).toHaveLength(2)
  })

  it('rejects HAVING without groups, unknown aliases and unsupported boolean expressions', () => {
    expect(runSqlQuery('SELECT status FROM orders HAVING status = \'pending\'').error).toMatch(/HAVING требует/)
    expect(runSqlQuery('SELECT status, COUNT(*) AS n FROM orders GROUP BY status HAVING missing > 1').error).toMatch(/ссылаться/)
    expect(runSqlQuery('SELECT status, COUNT(*) AS n FROM orders GROUP BY status HAVING n > 1 OR n = 0').error).toMatch(/HAVING/)
  })

  it('supports safe one-column IN and NOT IN subqueries with one nesting level', () => {
    expect(runSqlQuery('SELECT name FROM users WHERE id IN (SELECT user_id FROM orders WHERE total >= 100) ORDER BY name').rows).toEqual([{ name: 'Илья' }])
    expect(runSqlQuery('SELECT name FROM users WHERE id NOT IN (SELECT user_id FROM orders WHERE total >= 100) ORDER BY name').rows).toEqual([
      { name: 'Анна' }, { name: 'Мария' }, { name: 'Тимур' },
    ])
    expect(runSqlQuery('SELECT id FROM users WHERE id IN (SELECT id, name FROM users)').error).toMatch(/ровно один столбец/)
    expect(runSqlQuery('SELECT id FROM users WHERE id IN (SELECT user_id FROM orders WHERE user_id IN (SELECT id FROM users))').error).toMatch(/один уровень/)
  })

  it('rejects ambiguous joins, unknown functions, aliases, writes and unsafe expressions', () => {
    expect(runSqlQuery('SELECT id FROM users JOIN orders ON users.id = orders.user_id').error).toMatch(/неоднозначен/)
    expect(runSqlQuery('SELECT users.id, orders.id FROM users JOIN orders ON users.id = orders.user_id WHERE id = 1').error).toMatch(/неоднозначен/)
    expect(runSqlQuery('SELECT users.name FROM users JOIN orders ON users.id = orders.user_id; DROP TABLE users').error).toMatch(/SELECT/)
    expect(runSqlQuery('SELECT pg_sleep(10) FROM users').error).toMatch(/Не поддерживается выражение/)
    expect(runSqlQuery('SELECT users.* FROM users LEFT JOIN orders ON users.id = orders.user_id LIMIT 1').error).toBeNull()
  })
})
