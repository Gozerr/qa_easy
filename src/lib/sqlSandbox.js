export const sqlTables = {
  users: [
    { id: 1, name: 'Анна', email: 'anna@example.test', active: true },
    { id: 2, name: 'Илья', email: 'ilya@example.test', active: false },
    { id: 3, name: 'Мария', email: 'maria@example.test', active: true },
    { id: 4, name: 'Тимур', email: 'timur@example.test', active: true },
  ],
  orders: [
    { id: 101, user_id: 1, status: 'pending', total: 49.9 },
    { id: 102, user_id: 2, status: 'paid', total: 120 },
    { id: 103, user_id: 3, status: 'pending', total: 70 },
    { id: 104, user_id: 1, status: 'cancelled', total: 80 },
    { id: 105, user_id: 99, status: 'pending', total: 30 },
  ],
}

const SELECT_PATTERN = /^select\s+([\s\S]+?)\s+from\s+(users|orders)(?:\s+(left|inner)?\s*join\s+(users|orders)\s+on\s+([\s\S]+?))?(?:\s+where\s+([\s\S]+?))?(?:\s+group\s+by\s+([\s\S]+?))?(?:\s+order\s+by\s+([\s\S]+?))?(?:\s+limit\s+(\d+))?$/i
const SOURCE_COLUMNS = Symbol('source_columns')
const COLUMN_REF = /^(?:([a-z_][\w]*)\.)?([a-z_][\w]*)$/i
const CONDITION_PATTERN = /^(?:([a-z_][\w]*\.)?([a-z_][\w]*))\s*(?:(=|!=|>=|<=|>|<)\s*((?:'(?:[^']|'')*')|(?:"(?:[^"]|"")*")|-?\d+(?:\.\d+)?|true|false|null)|(is\s+(?:not\s+)?null))$/i
const JOIN_PATTERN = /^([a-z_][\w]*)\.([a-z_][\w]*)\s*=\s*([a-z_][\w]*)\.([a-z_][\w]*)$/i
const AGGREGATE_PATTERN = /^(count|sum|avg)\s*\(\s*(\*|(?:[a-z_][\w]*\.)?[a-z_][\w]*)\s*\)(?:\s+as\s+([a-z_][\w]*))?$/i
const COLUMN_PATTERN = /^(?:\*|[a-z_][\w]*\.\*|(?:[a-z_][\w]*\.)?[a-z_][\w]*(?:\s+as\s+[a-z_][\w]*)?)$/i

function parseValue(raw) {
  const value = raw.trim()
  if (/^true$/i.test(value)) return true
  if (/^false$/i.test(value)) return false
  if (/^null$/i.test(value)) return null
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  if (value.startsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
  if (value.startsWith('"')) return value.slice(1, -1).replaceAll('""', '"')
  return undefined
}

function resolveColumn(reference, tableNames) {
  const match = COLUMN_REF.exec(reference.trim())
  if (!match) return { error: `Не удалось разобрать столбец «${reference}».` }
  const [, requestedTable, column] = match
  if (requestedTable) {
    if (!tableNames.includes(requestedTable.toLowerCase())) return { error: `Таблица «${requestedTable}» не участвует в запросе.` }
    if (!Object.hasOwn(sqlTables[requestedTable.toLowerCase()][0], column.toLowerCase())) return { error: `В таблице ${requestedTable} нет столбца «${column}».` }
    return { key: `${requestedTable.toLowerCase()}.${column.toLowerCase()}`, name: column.toLowerCase() }
  }

  const candidates = tableNames.filter((tableName) => Object.hasOwn(sqlTables[tableName][0], column.toLowerCase()))
  if (candidates.length === 0) return { error: `В выбранных таблицах нет столбца «${column}» в списке столбцов.` }
  if (candidates.length > 1) return { error: `Столбец «${column}» неоднозначен: укажи таблицу.` }
  return { key: `${candidates[0]}.${column.toLowerCase()}`, name: column.toLowerCase() }
}

function joinRows(leftTable, rightTable, joinKind, onClause) {
  const onMatch = JOIN_PATTERN.exec(onClause.trim())
  if (!onMatch) return { rows: [], error: 'ON должен сравнивать два столбца в виде users.id = orders.user_id.' }
  const [, leftSource, leftColumn, rightSource, rightColumn] = onMatch
  const sources = [leftSource.toLowerCase(), rightSource.toLowerCase()]
  if (sources[0] === sources[1] || !sources.includes(leftTable) || !sources.includes(rightTable)) {
    return { rows: [], error: 'ON должен связывать выбранные таблицы между собой.' }
  }
  const leftField = resolveColumn(`${leftSource}.${leftColumn}`, [leftTable, rightTable])
  const rightField = resolveColumn(`${rightSource}.${rightColumn}`, [leftTable, rightTable])
  if (leftField.error) return { rows: [], error: leftField.error }
  if (rightField.error) return { rows: [], error: rightField.error }
  const output = []

  for (const leftRow of sqlTables[leftTable]) {
    const matches = sqlTables[rightTable].filter((rightRow) => {
      const leftValue = (leftSource.toLowerCase() === leftTable ? leftRow : rightRow)[leftColumn.toLowerCase()]
      const rightValue = (rightSource.toLowerCase() === leftTable ? leftRow : rightRow)[rightColumn.toLowerCase()]
      return leftValue !== null && leftValue !== undefined && leftValue === rightValue
    })
    if (matches.length === 0 && joinKind === 'left') {
      output.push({ ...qualifyRow(leftTable, leftRow), ...qualifyRow(rightTable, null) })
    } else {
      for (const rightRow of matches) output.push({ ...qualifyRow(leftTable, leftRow), ...qualifyRow(rightTable, rightRow) })
    }
  }
  return { rows: output, error: null }
}

function qualifyRow(tableName, row) {
  return Object.fromEntries(Object.keys(sqlTables[tableName][0]).map((column) => [`${tableName}.${column}`, row?.[column] ?? null]))
}

function evaluateCondition(row, rawCondition, tableNames) {
  const condition = CONDITION_PATTERN.exec(rawCondition.trim())
  if (!condition) return { error: 'WHERE принимает одно условие со сравнением или IS [NOT] NULL.' }
  const [, tableName, columnName, operator, rawValue, nullOperator] = condition
  const resolved = resolveColumn(tableName ? `${tableName.slice(0, -1)}.${columnName}` : columnName, tableNames)
  if (resolved.error) return { error: resolved.error }
  if (nullOperator) {
    const isNull = row[resolved.key] === null || row[resolved.key] === undefined
    return { passed: /\bis\s+not\s+null$/i.test(nullOperator) ? !isNull : isNull }
  }
  const expected = parseValue(rawValue)
  if (expected === undefined) return { error: 'Не удалось разобрать значение в условии WHERE.' }
  const actual = row[resolved.key]
  if (actual === null || actual === undefined || expected === null) return { passed: false }
  switch (operator) {
    case '=': return { passed: actual === expected }
    case '!=': return { passed: actual !== expected }
    case '>': return { passed: actual > expected }
    case '<': return { passed: actual < expected }
    case '>=': return { passed: actual >= expected }
    case '<=': return { passed: actual <= expected }
    default: return { passed: false }
  }
}

function parseProjection(rawProjection, tableNames) {
  const projections = []
  for (const rawPart of rawProjection.split(',')) {
    const part = rawPart.trim()
    const aggregate = AGGREGATE_PATTERN.exec(part)
    if (aggregate) {
      const [, operation, rawColumn, alias] = aggregate
      if (operation.toLowerCase() === 'count' && rawColumn === '*') {
        projections.push({ kind: 'aggregate', operation: 'count', key: null, label: alias?.toLowerCase() ?? 'count' })
        continue
      }
      if (rawColumn === '*') return { projections: [], error: `${operation.toUpperCase()}(*) не поддерживается, кроме COUNT(*).` }
      const resolved = resolveColumn(rawColumn, tableNames)
      if (resolved.error) return { projections: [], error: resolved.error }
      if (operation.toLowerCase() !== 'count' && !tableNames.some((tableName) => typeof sqlTables[tableName][0][resolved.name] === 'number')) {
        return { projections: [], error: `${operation.toUpperCase()} требует числовой столбец.` }
      }
      projections.push({ kind: 'aggregate', operation: operation.toLowerCase(), key: resolved.key, label: alias?.toLowerCase() ?? `${operation.toLowerCase()}(${resolved.name})` })
      continue
    }
    if (!COLUMN_PATTERN.test(part)) return { projections: [], error: `Не поддерживается выражение «${part}».` }
    if (part === '*') {
      if (tableNames.length > 1) return { projections: [], error: 'В JOIN укажи столбцы явно или используй users.* / orders.*.' }
      projections.push({ kind: 'wildcard', table: tableNames[0] })
      continue
    }
    const selected = /^(.*?)\s+as\s+([a-z_][\w]*)$/i.exec(part)
    const reference = selected ? selected[1].trim() : part
    if (reference.endsWith('.*')) {
      const tableName = reference.slice(0, -2).toLowerCase()
      if (!tableNames.includes(tableName)) return { projections: [], error: `Таблица «${tableName}» не участвует в запросе.` }
      projections.push({ kind: 'wildcard', table: tableName, qualified: true })
      continue
    }
    const resolved = resolveColumn(reference, tableNames)
    if (resolved.error) return { projections: [], error: resolved.error }
    projections.push({ kind: 'column', key: resolved.key, label: selected?.[2].toLowerCase() ?? resolved.name })
  }
  if (projections.length === 0) return { projections: [], error: 'Укажи хотя бы один столбец.' }
  const labels = projections.flatMap((projection) => projection.kind === 'wildcard'
    ? (projection.qualified ? Object.keys(sqlTables[projection.table][0]).map((column) => `${projection.table}.${column}`) : Object.keys(sqlTables[projection.table][0]))
    : [projection.label])
  if (new Set(labels).size !== labels.length) return { projections: [], error: 'В результате повторяется имя столбца. Используй AS для уникальных имён.' }
  return { projections, error: null }
}

function projectRows(rows, projections, groupBy) {
  const hasAggregate = projections.some(({ kind }) => kind === 'aggregate')
  const plainColumns = projections.filter(({ kind }) => kind === 'column')
  if (hasAggregate && plainColumns.some(({ key }) => !groupBy.includes(key))) {
    return { rows: [], error: 'Каждый обычный столбец в агрегатном запросе должен быть в GROUP BY.' }
  }
  if (groupBy.length > 0 && !hasAggregate) {
    const seen = new Set()
    rows = rows.filter((row) => {
      const signature = JSON.stringify(groupBy.map((key) => row[key]))
      if (seen.has(signature)) return false
      seen.add(signature)
      return true
    })
  }
  if (!hasAggregate) {
    return { rows: rows.map((row) => {
      const projected = Object.fromEntries(projections.flatMap((projection) => {
      if (projection.kind === 'wildcard') {
        const columns = Object.keys(sqlTables[projection.table][0])
        return columns.map((column) => [projection.qualified ? `${projection.table}.${column}` : column, row[`${projection.table}.${column}`] ?? row[column]])
      }
      return [[projection.label, row[projection.key]]]
      }))
      Object.defineProperty(projected, SOURCE_COLUMNS, { value: row })
      return projected
    }), error: null }
  }

  const groups = new Map()
  for (const row of rows) {
    const signature = groupBy.length ? JSON.stringify(groupBy.map((key) => row[key])) : '__all__'
    if (!groups.has(signature)) groups.set(signature, [])
    groups.get(signature).push(row)
  }
  if (groupBy.length === 0 && groups.size === 0) groups.set('__all__', [])

  return { rows: [...groups.values()].map((group) => {
    const projected = Object.fromEntries(projections.map((projection) => {
      if (projection.kind === 'column') return [projection.label, group[0]?.[projection.key] ?? null]
      const values = projection.key ? group.map((row) => row[projection.key]).filter((value) => value !== null && value !== undefined) : group
      const value = projection.operation === 'count'
        ? values.length
        : values.length === 0
          ? null
          : projection.operation === 'sum'
            ? values.reduce((sum, item) => sum + item, 0)
            : values.reduce((sum, item) => sum + item, 0) / values.length
      return [projection.label, value]
    }))
    Object.defineProperty(projected, SOURCE_COLUMNS, { value: Object.fromEntries(groupBy.map((key) => [key, group[0]?.[key] ?? null])) })
    return projected
  }), error: null }
}

export function runSqlQuery(input) {
  if (typeof input !== 'string' || input.length > 1_000) return { rows: [], error: 'Запрос пустой или слишком длинный.' }
  const query = input.trim().replace(/;\s*$/, '')
  if (!query || /;|--|\/\*|\*\//.test(query)) return { rows: [], error: 'Разрешён один SELECT-запрос без комментариев.' }

  const match = SELECT_PATTERN.exec(query)
  if (!match) return { rows: [], error: 'Поддерживается SELECT из users|orders с JOIN, WHERE, GROUP BY, ORDER BY и LIMIT.' }
  const [, rawProjection, baseTable, rawJoinKind, joinedTable, rawJoin, rawCondition, rawGroupBy, rawOrderBy, rawLimit] = match
  const base = baseTable.toLowerCase()
  const joined = joinedTable?.toLowerCase()
  const tableNames = joined ? [base, joined] : [base]
  let rows

  if (joined) {
    if (base === joined) return { rows: [], error: 'Self JOIN не поддерживается.' }
    const join = joinRows(base, joined, rawJoinKind?.toLowerCase() ?? 'inner', rawJoin)
    if (join.error) return { rows: [], error: join.error }
    rows = join.rows
  } else {
    rows = sqlTables[base].map((row) => ({ ...qualifyRow(base, row), ...row }))
  }

  if (rawCondition) {
    const filtered = []
    for (const row of rows) {
      const condition = evaluateCondition(row, rawCondition, tableNames)
      if (condition.error) return { rows: [], error: condition.error }
      if (condition.passed) filtered.push(row)
    }
    rows = filtered
  }

  const groupBy = []
  if (rawGroupBy) {
    for (const reference of rawGroupBy.split(',')) {
      const resolved = resolveColumn(reference, tableNames)
      if (resolved.error) return { rows: [], error: resolved.error }
      groupBy.push(resolved.key)
    }
    if (new Set(groupBy).size !== groupBy.length) return { rows: [], error: 'Столбец не должен повторяться в GROUP BY.' }
  }

  const projection = parseProjection(rawProjection, tableNames)
  if (projection.error) return { rows: [], error: projection.error }
  const projected = projectRows(rows, projection.projections, groupBy)
  if (projected.error) return projected
  rows = projected.rows

  if (rawOrderBy) {
    const orderColumns = rawOrderBy.split(',').map((part) => {
      const order = /^(.*?)\s*(asc|desc)?$/i.exec(part.trim())
      if (!order) return null
      const reference = order[1].trim()
      const direction = order[2]?.toLowerCase() === 'desc' ? -1 : 1
      if (rows[0] && Object.hasOwn(rows[0], reference)) return { reference, direction, outputKey: reference }
      const resolved = resolveColumn(reference, tableNames)
      return resolved.error ? null : { reference, direction, sourceKey: resolved.key }
    })
    if (orderColumns.some((order) => !order)) return { rows: [], error: 'ORDER BY принимает существующие столбцы или алиасы, а также ASC или DESC.' }
    rows.sort((left, right) => {
      for (const order of orderColumns) {
        const a = order.outputKey ? left[order.outputKey] : left[SOURCE_COLUMNS]?.[order.sourceKey]
        const b = order.outputKey ? right[order.outputKey] : right[SOURCE_COLUMNS]?.[order.sourceKey]
        const comparison = (a < b ? -1 : a > b ? 1 : 0) * order.direction
        if (comparison) return comparison
      }
      return 0
    })
  }

  if (rawLimit) {
    const limit = Number(rawLimit)
    if (limit < 1 || limit > 50) return { rows: [], error: 'LIMIT должен быть от 1 до 50.' }
    rows = rows.slice(0, limit)
  }

  return { rows, error: null }
}
