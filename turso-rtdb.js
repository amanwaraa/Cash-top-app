(() => {
  'use strict';

  const settings = window.CASHTOP_TURSO || {};
  const turso = settings.turso || {};
  const bridgeBase = String(settings.config?.databaseURL || '').replace(/\/+$/, '');
  const token = String(turso.authToken || '').trim();
  const dbUrl = String(turso.databaseURL || '').trim();
  const table = String(turso.table || 'cashtop_rtdb').replace(/[^a-zA-Z0-9_]/g, '') || 'cashtop_rtdb';
  const nativeFetch = window.fetch.bind(window);
  // The admin console is persisted as one atomic JSON document. Treating this
  // root as an atomic row avoids DELETE descendant scans and makes key lookups
  // read the single indexed admin row instead of rebuilding a subtree.
  const adminRootPath = normalizePath(settings.adminRootPath || 'cashTopExchange/cashTopAdmin');

  if (!bridgeBase || !token || !dbUrl) return;

  const pipelineUrl = dbUrl
    .replace(/^libsql:\/\//i, 'https://')
    .replace(/\/+$/, '') + '/v2/pipeline';

  let schemaReady = null;
  const schemaMarkerKey = `ct_turso_schema_v74::${dbUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(-80)}::${table}`;
  const exactCache = new Map();
  const EXACT_CACHE_MS = 15000;

  function normalizePath(value) {
    return decodeURIComponent(String(value || ''))
      .replace(/\.json(?:\?.*)?$/i, '')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\/{2,}/g, '/');
  }

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
  }

  function getNested(root, segments) {
    let current = root;
    for (const segment of segments) {
      if (current == null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
      current = current[segment];
    }
    return current;
  }

  function setNested(root, segments, value) {
    if (!segments.length) return clone(value);
    const out = root && typeof root === 'object' && !Array.isArray(root) ? clone(root) : {};
    let current = out;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) current[segment] = {};
      current = current[segment];
    }
    current[segments[segments.length - 1]] = clone(value);
    return out;
  }

  function deleteNested(root, segments) {
    if (!segments.length) return null;
    if (!root || typeof root !== 'object') return root;
    const out = clone(root);
    let current = out;
    for (let i = 0; i < segments.length - 1; i += 1) {
      current = current?.[segments[i]];
      if (!current || typeof current !== 'object') return out;
    }
    if (current && typeof current === 'object') delete current[segments[segments.length - 1]];
    return out;
  }

  function typedArg(value) {
    if (value === null || value === undefined) return { type: 'null' };
    if (typeof value === 'number' && Number.isInteger(value)) return { type: 'integer', value: String(value) };
    if (typeof value === 'number') return { type: 'float', value: String(value) };
    return { type: 'text', value: String(value) };
  }

  function cellValue(cell) {
    if (!cell || cell.type === 'null') return null;
    const value = cell.value;
    if (cell.type === 'integer' || cell.type === 'float') {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    return value;
  }

  async function pipeline(statements, timeout = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await nativeFetch(pipelineUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          requests: [
            ...statements.map(statement => ({
              type: 'execute',
              stmt: {
                sql: statement.sql,
                args: (statement.args || []).map(typedArg)
              }
            })),
            { type: 'close' }
          ]
        }),
        signal: controller.signal,
        cache: 'no-store'
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Turso HTTP ${response.status}: ${text.slice(0, 500)}`);
      let data;
      try { data = JSON.parse(text); } catch (_) { throw new Error('Turso returned invalid JSON'); }
      return statements.map((_, index) => {
        const item = data.results?.[index];
        if (!item || item.type !== 'ok') {
          const message = item?.error?.message || item?.error || JSON.stringify(item || {});
          throw new Error(`Turso SQL: ${message}`);
        }
        return item.response?.result || { cols: [], rows: [], affected_row_count: 0 };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function ensureSchema() {
    if (schemaReady) return schemaReady;
    try {
      if (Storage.prototype.getItem.call(localStorage, schemaMarkerKey) === '1') {
        schemaReady = Promise.resolve(true);
        return schemaReady;
      }
    } catch (_) {}
    schemaReady = pipeline([{
      sql: `CREATE TABLE IF NOT EXISTS ${table} (
        path TEXT PRIMARY KEY,
        payload TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`
    }]).then(() => {
      try { Storage.prototype.setItem.call(localStorage, schemaMarkerKey, '1'); } catch (_) {}
      return true;
    }).catch(error => {
      schemaReady = null;
      try { Storage.prototype.removeItem.call(localStorage, schemaMarkerKey); } catch (_) {}
      throw error;
    });
    return schemaReady;
  }

  function rowsToObjects(result) {
    const names = (result.cols || []).map(col => col.name);
    return (result.rows || []).map(row => {
      const obj = {};
      row.forEach((cell, index) => { obj[names[index]] = cellValue(cell); });
      return obj;
    });
  }

  function parsePayload(raw) {
    if (raw == null) return null;
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  }

  function isExactLeafPath(path) {
    return path === adminRootPath ||
      /\/datasets\/[^/]+$/.test(path) ||
      /\/meta$/.test(path) ||
      /\/auditTrail\/recent\/[^/]+$/.test(path) ||
      /\/auditTrail\/\d{4}-\d{2}-\d{2}\/\d{2}\/[^/]+$/.test(path) ||
      /\/cashTopAdmin\/(?:licenses|users|companies)\/[^/]+$/.test(path);
  }

  async function readAdminAtomic(path, options = {}) {
    const normalized = normalizePath(path);
    if (!adminRootPath || !(normalized === adminRootPath || normalized.startsWith(`${adminRootPath}/`))) return undefined;

    // The current admin state is a single row at adminRootPath. A 15-second
    // in-page cache means keyIndex + companies fallbacks reuse the same read.
    const root = await readExact(adminRootPath, options);
    if (root !== undefined && root !== null && typeof root === 'object') {
      if (normalized === adminRootPath) return clone(root);
      const segments = normalized.slice(adminRootPath.length + 1).split('/').filter(Boolean);
      const nested = getNested(root, segments);
      if (nested !== undefined) return clone(nested);
      return null;
    }
    return undefined;
  }

  function cacheGet(path) {
    const item = exactCache.get(path);
    if (!item || Date.now() - item.at > EXACT_CACHE_MS) {
      if (item) exactCache.delete(path);
      return { hit: false, value: null };
    }
    return { hit: true, value: clone(item.value) };
  }

  function cacheSet(path, value) {
    exactCache.set(path, { at: Date.now(), value: clone(value) });
    if (exactCache.size > 120) {
      const oldest = exactCache.keys().next().value;
      if (oldest) exactCache.delete(oldest);
    }
  }

  function invalidatePath(path) {
    const normalized = normalizePath(path);
    for (const key of [...exactCache.keys()]) {
      if (key === normalized || key.startsWith(`${normalized}/`) || normalized.startsWith(`${key}/`)) exactCache.delete(key);
    }
  }

  async function readExact(path, options = {}) {
    await ensureSchema();
    const normalized = normalizePath(path);
    if (options.cache !== false) {
      const cached = cacheGet(normalized);
      if (cached.hit) return cached.value;
    }
    const [result] = await pipeline([{
      sql: `SELECT payload, deleted, updated_at FROM ${table} WHERE path = ? LIMIT 1`,
      args: [normalized]
    }]);
    const row = rowsToObjects(result)[0];
    if (!row) return undefined;
    const value = Number(row.deleted) === 1 ? null : parsePayload(row.payload);
    cacheSet(normalized, value);
    return clone(value);
  }

  function ancestorPaths(path) {
    const parts = normalizePath(path).split('/').filter(Boolean);
    const result = [];
    for (let i = 1; i <= parts.length; i += 1) result.push(parts.slice(0, i).join('/'));
    return result;
  }

  async function readNodeGeneral(path) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const descendantsPrefix = normalized ? `${normalized}/` : '';
    const ancestors = ancestorPaths(normalized);
    const placeholders = ancestors.map(() => '?').join(',');
    const lower = descendantsPrefix;
    const upper = `${descendantsPrefix}\uffff`;
    const clauses = [];
    const args = [];
    if (ancestors.length) {
      clauses.push(`path IN (${placeholders})`);
      args.push(...ancestors);
    }
    if (descendantsPrefix) {
      clauses.push('(path >= ? AND path < ?)');
      args.push(lower, upper);
    }
    if (!clauses.length) return null;

    const [result] = await pipeline([{
      sql: `SELECT path, payload, deleted, updated_at
            FROM ${table}
            WHERE ${clauses.join(' OR ')}
            ORDER BY length(path) ASC, path ASC`,
      args
    }]);
    const rows = rowsToObjects(result);

    let value;
    for (const row of rows) {
      const rowPath = normalizePath(row.path);
      const isAncestor = rowPath === normalized || (rowPath && normalized.startsWith(`${rowPath}/`));
      if (!isAncestor) continue;
      if (Number(row.deleted) === 1) {
        value = null;
        continue;
      }
      const payload = parsePayload(row.payload);
      const remainder = normalized === rowPath ? [] : normalized.slice(rowPath.length + 1).split('/').filter(Boolean);
      const nested = remainder.length ? getNested(payload, remainder) : payload;
      if (nested !== undefined) value = clone(nested);
    }

    rows
      .filter(row => {
        const p = normalizePath(row.path);
        return p && p !== normalized && descendantsPrefix && p.startsWith(descendantsPrefix);
      })
      .sort((a, b) => normalizePath(a.path).split('/').length - normalizePath(b.path).split('/').length)
      .forEach(row => {
        const p = normalizePath(row.path);
        const relative = p.slice(descendantsPrefix.length).split('/').filter(Boolean);
        if (Number(row.deleted) === 1) value = deleteNested(value, relative);
        else value = setNested(value, relative, parsePayload(row.payload));
      });

    return value === undefined ? null : value;
  }

  async function readNode(path, options = {}) {
    const normalized = normalizePath(path);

    // Admin state is stored atomically. Prefer its one PK lookup and extract the
    // nested value in memory. Legacy child rows are only consulted if no atomic
    // admin document exists at all.
    if (adminRootPath && (normalized === adminRootPath || normalized.startsWith(`${adminRootPath}/`))) {
      const atomic = await readAdminAtomic(normalized, options);
      if (atomic !== undefined) return atomic;
      return readNodeGeneral(normalized);
    }

    if (isExactLeafPath(normalized)) {
      const exact = await readExact(normalized, options);
      if (exact !== undefined) return exact;
      // Compatibility fallback for old parent-document rows.
      return readNodeGeneral(normalized);
    }
    return readNodeGeneral(normalized);
  }

  function upsertStatement(path, value, deleted = false, updatedAt = Date.now()) {
    return {
      sql: `INSERT INTO ${table}(path, payload, deleted, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
              payload = excluded.payload,
              deleted = excluded.deleted,
              updated_at = excluded.updated_at`,
      args: [normalizePath(path), JSON.stringify(value), deleted ? 1 : 0, Number(updatedAt || Date.now())]
    };
  }

  async function writeNode(path, value, deleted = false) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const now = Date.now();
    const statements = [];

    // Dataset/meta/audit leaves never have children. Avoid the old DELETE+substr
    // scan, which was the biggest source of unnecessary row reads.
    if (!isExactLeafPath(normalized)) {
      const prefix = normalized ? `${normalized}/` : '';
      if (prefix) {
        statements.push({
          sql: `DELETE FROM ${table} WHERE path >= ? AND path < ?`,
          args: [prefix, `${prefix}\uffff`]
        });
      }
    }
    statements.push(upsertStatement(normalized, value, deleted, now));
    const payloadChars = typeof value?.value === 'string' ? value.value.length : (typeof value === 'string' ? value.length : 0);
    const adaptiveTimeout = Math.min(120000, Math.max(45000, 30000 + Math.ceil(payloadChars / 1048576) * 6000));
    await pipeline(statements, adaptiveTimeout);
    invalidatePath(normalized);
    cacheSet(normalized, deleted ? null : value);
    return value;
  }

  async function patchNode(path, patch) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const now = Date.now();
    const patchValue = patch && typeof patch === 'object' && !Array.isArray(patch) ? clone(patch) : {};
    // json_patch performs an atomic RFC-7396 merge inside SQLite. This lets all
    // devices merge per-dataset change stamps into the one meta row without a
    // read-before-write and without one device erasing another device's stamps.
    await pipeline([{
      sql: `INSERT INTO ${table}(path, payload, deleted, updated_at)
            VALUES(?, ?, 0, ?)
            ON CONFLICT(path) DO UPDATE SET
              payload = CASE
                WHEN deleted = 1 OR payload IS NULL THEN excluded.payload
                ELSE json_patch(payload, excluded.payload)
              END,
              deleted = 0,
              updated_at = excluded.updated_at`,
      args: [normalized, JSON.stringify(patchValue), now]
    }]);
    invalidatePath(normalized);
    return patchValue;
  }

  async function writeMany(nodes = []) {
    await ensureSchema();
    const list = (Array.isArray(nodes) ? nodes : [])
      .filter(item => item && normalizePath(item.path))
      .map(item => ({
        path: normalizePath(item.path),
        value: item.value,
        deleted: item.deleted === true,
        updatedAt: Number(item.updatedAt || Date.now())
      }));
    if (!list.length) return { written: 0 };
    const results = await pipeline(list.map(item => upsertStatement(item.path, item.value, item.deleted, item.updatedAt)), Math.max(22000, 1200 * list.length));
    list.forEach(item => {
      invalidatePath(item.path);
      cacheSet(item.path, item.deleted ? null : item.value);
    });
    return {
      written: list.length,
      affected: results.reduce((sum, result) => sum + Number(result.affected_row_count || 0), 0)
    };
  }

  async function readMany(paths = [], options = {}) {
    await ensureSchema();
    const unique = [...new Set((Array.isArray(paths) ? paths : []).map(normalizePath).filter(Boolean))];
    const output = {};
    const missing = [];
    for (const path of unique) {
      if (options.cache !== false) {
        const cached = cacheGet(path);
        if (cached.hit) {
          output[path] = cached.value;
          continue;
        }
      }
      missing.push(path);
    }
    if (!missing.length) return output;
    const results = await pipeline(missing.map(path => ({
      sql: `SELECT payload, deleted, updated_at FROM ${table} WHERE path = ? LIMIT 1`,
      args: [path]
    })), Math.max(22000, 900 * missing.length));
    missing.forEach((path, index) => {
      const row = rowsToObjects(results[index])[0];
      if (!row) {
        output[path] = undefined;
        return;
      }
      const value = Number(row.deleted) === 1 ? null : parsePayload(row.payload);
      output[path] = value;
      cacheSet(path, value);
    });
    return output;
  }


  /* R125 — قراءة 50 سجل فقط من صف الـdataset داخل Turso بدون تنزيل المصفوفة كلها. */
  function r125DatasetArrayExpression() {
    const first = `CASE
      WHEN json_type(payload, '$.value') IS NOT NULL THEN json_extract(payload, '$.value')
      WHEN json_type(payload) IN ('array','object') THEN payload
      WHEN json_type(payload) = 'text' THEN json_extract(payload, '$')
      ELSE '[]'
    END`;
    const unwrap = expr => `CASE
      WHEN json_valid(${expr}) = 1 AND json_type(${expr}) = 'text'
           AND json_valid(json_extract(${expr}, '$')) = 1
        THEN json_extract(${expr}, '$')
      ELSE ${expr}
    END`;
    const finalExpr = unwrap(unwrap(first));
    return `CASE WHEN json_valid(${finalExpr}) = 1 AND json_type(${finalExpr}) = 'array' THEN ${finalExpr} ELSE '[]' END`;
  }

  async function readDatasetPage(path, options = {}) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 50)));
    const page = Math.max(1, Number(options.page || 1));
    const offset = (page - 1) * pageSize;
    const expr = r125DatasetArrayExpression();
    const metaSql = `WITH src AS (
      SELECT ${expr} AS arr, updated_at AS row_updated_at
      FROM ${table} WHERE path = ? AND deleted = 0 LIMIT 1
    ) SELECT CASE WHEN json_type(arr)='array' THEN json_array_length(arr) ELSE 0 END AS total,
             row_updated_at AS updated_at FROM src`;
    const pageSql = `WITH RECURSIVE src AS (
      SELECT ${expr} AS arr, updated_at AS row_updated_at
      FROM ${table} WHERE path = ? AND deleted = 0 LIMIT 1
    ), bounds AS (
      SELECT arr,row_updated_at,json_array_length(arr) AS n FROM src WHERE json_type(arr)='array'
    ), seq(i,c) AS (
      SELECT n - 1 - ?, 1 FROM bounds WHERE n > ?
      UNION ALL
      SELECT i - 1, c + 1 FROM seq WHERE c < ? AND i > 0
    )
    SELECT i AS idx, json_extract(bounds.arr, '$[' || i || ']') AS item,
           bounds.row_updated_at AS updated_at
    FROM seq CROSS JOIN bounds ORDER BY c ASC`;
    const [metaResult, rowsResult] = await pipeline([
      { sql: metaSql, args: [normalized] },
      { sql: pageSql, args: [normalized, offset, offset, pageSize] }
    ], 12000);
    const meta = rowsToObjects(metaResult)[0] || {};
    const total = Math.max(0, Number(meta.total || 0));
    const rows = rowsToObjects(rowsResult);
    const items = rows.map(row => parsePayload(row.item)).filter(item => item && typeof item === 'object');
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items, total, page, pages, pageSize,
      hasNext: page < pages, hasPrev: page > 1,
      updatedAt: Number(meta.updated_at || rows[0]?.updated_at || 0)
    };
  }

  async function parseBody(init) {
    const body = init?.body;
    if (body == null || body === '') return null;
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch (_) { throw new Error('INVALID_JSON'); }
    }
    if (body instanceof Blob) return JSON.parse(await body.text());
    return body;
  }

  function jsonResponse(value, status = 200) {
    return new Response(JSON.stringify(value), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Cashtop-Backend': 'turso-libsql-v74'
      }
    });
  }

  function isBridgeUrl(raw) {
    try {
      const target = new URL(typeof raw === 'string' ? raw : raw.url, location.href);
      const bridge = new URL(bridgeBase, location.href);
      return target.origin === bridge.origin && target.pathname === bridge.pathname;
    } catch (_) { return false; }
  }

  async function handleBridge(raw, init = {}) {
    try {
      const target = new URL(typeof raw === 'string' ? raw : raw.url, location.href);
      const path = normalizePath(target.searchParams.get('path'));
      if (!path || !(path === 'cashTopExchange' || path.startsWith('cashTopExchange/'))) {
        return jsonResponse({ error: 'INVALID_PATH' }, 400);
      }
      const method = String(init?.method || (typeof raw !== 'string' ? raw.method : 'GET') || 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse(await readNode(path));
      if (method === 'DELETE') {
        await writeNode(path, null, true);
        return jsonResponse(null);
      }
      if (method === 'PATCH') {
        const body = await parseBody(init);
        await patchNode(path, body);
        return jsonResponse(body);
      }
      if (method === 'POST' || method === 'PUT') {
        const body = await parseBody(init);
        await writeNode(path, body, false);
        return jsonResponse(body);
      }
      return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    } catch (error) {
      console.error('[CASH TOP TURSO BRIDGE]', error);
      const status = /401|unauthor/i.test(String(error?.message || '')) ? 401 : 503;
      return jsonResponse({ error: 'TURSO_UNAVAILABLE', detail: String(error?.message || error).slice(0, 500) }, status);
    }
  }

  window.fetch = function cashtopTursoFetch(input, init) {
    if (isBridgeUrl(input)) return handleBridge(input, init || {});
    return nativeFetch(input, init);
  };

  window.CashtopTursoBridge = Object.freeze({
    ready: ensureSchema,
    readNode,
    readExact,
    readMany,
    readDatasetPage,
    writeNode,
    patchNode,
    writeMany,
    pipeline,
    invalidatePath,
    pipelineUrl,
    table
  });
})();
