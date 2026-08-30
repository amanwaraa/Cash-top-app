(() => {
'use strict';
const settings = window.CASHTOP_TURSO || {};
try { window.addEventListener('cashtop:database-access-ready', () => setTimeout(() => window.CashtopTursoConfig?.refresh?.(), 0)); } catch (_) {}
const core = window.Cashtop;

if (settings.enabled && core && settings.config?.databaseURL) {
  const cfg = settings.config;
  const STATE_KEY_PREFIX = 'ct_turso_state_rest_v1';
  const LOCATION_KEY_PREFIX = 'ct_turso_location_v1';
  const primaryRoot = String(settings.rootPath || 'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g, '');
  const legacyRoots = Array.isArray(settings.legacyRootPaths) ? settings.legacyRootPaths : [];
  const session = core.getSession() || {};
  const configuredBaseUrls = [...new Set([
    ...(Array.isArray(cfg.databaseURLs) ? cfg.databaseURLs : []),
    cfg.databaseURL
  ].map(value => String(value || '').trim().replace(/\/+$/, '')).filter(Boolean))];
  const baseUrl = configuredBaseUrls[0] || '';
  const isPathProxy = settings.backendMode === 'turso-http-rtdb' || configuredBaseUrls.some(url => /__turso_rtdb__(?:$|\?)/i.test(url));
  const TRANSPORT_KEY = `ct_sync_transport_v1::${cfg.projectId || 'default'}`;
  const CLOUD_DATA_KEYS = core.DATA_KEYS.filter(key => key !== 'cashtop_audit_log');
  const LOSSLESS_SYNC_KEYS = new Set([
    'cashtop_products','cashtop_product_categories','cashtop_materials','cashtop_material_purchases',
    'cashtop_customers','cashtop_customer_groups','cashtop_suppliers','cashtop_supplier_movements',
    'cashtop_invoices','cashtop_sales_reversals','cashtop_sales_returns',
    'cashtop_purchases','cashtop_purchase_reversals','cashtop_purchase_returns',
    'cashtop_expenses','cashtop_expense_types','cashtop_vouchers','cashtop_units','cashtop_stores',
    'cashtop_transfer_history','cashtop_branches','cashtop_branch_transfer_history','cashtop_employees',
    'cashtop_workers','cashtop_sales_agents','cashtop_agent_movements','cashtop_sales_offers',
    'cashtop_manufacturing_recipes','cashtop_manufacturing_orders','cashtop_wastage','cashtop_salary_payments',
    'cashtop_journal','cashtop_journal_reversal_archive','cashtop_financial_groups','cashtop_opening_balances',
    'cashtop_funds_db'
  ]);
  const LOSSLESS_OBJECT_KEYS = new Set(['cashtop_funds_db']);
  const usagePolicy = settings.usagePolicy || {};
  const AUTO_REMOTE_CHECK_MS = Math.max(500, Number(usagePolicy.remoteCheckMs || 650));
  const NAV_REMOTE_CHECK_MS = Math.max(250, Number(usagePolicy.navigationCheckMs || 350));
  const FULL_REFRESH_MS = Math.max(3600000, Number(usagePolicy.fullRefreshMs || 43200000));
  const WRITE_DEBOUNCE_MS = Math.max(0, Number(usagePolicy.writeDebounceMs ?? 25));
  const AUDIT_CLOUD_ENABLED = usagePolicy.cloudAudit === true;
  const rawStorage = {
    get: key => Storage.prototype.getItem.call(localStorage, key),
    set: (key, value) => Storage.prototype.setItem.call(localStorage, key, String(value)),
    remove: key => Storage.prototype.removeItem.call(localStorage, key)
  };

  function sanitizeSegment(value) {
    return String(value || '').trim().replace(/[.#$\[\]\/]/g, '_');
  }

  /*
   * كل شركة تملك مساراً وحيداً وثابتاً مبنياً على companyId. في الإصدارات
   * السابقة كان الفحص يجرب companyId وcompanyKey وlicenseId ثم يختار المسار
   * الأحدث؛ وهذا قد يربط مفتاحاً جديداً بمسار غير مقصود أو يقسم بيانات الشركة
   * بين أكثر من عقدة. نحتفظ بالأسماء القديمة للترحيل فقط، ولا نختارها إلا إذا
   * كانت بياناتها نفسها تثبت أنها تخص المفتاح الحالي.
   */
  const canonicalCompanyId = sanitizeSegment(
    session.tenantId || session.companyId || session.licenseId || session.companyKey || 'unassigned'
  ) || 'unassigned';
  const normalizedCompanyKey = String(session.companyKey || '').trim().toUpperCase();
  const financialGroupId = String(core.currentFinancialGroupId?.() || core.LEGACY_FINANCIAL_GROUP_ID || 'FG_LEGACY');
  const legacyFinancialGroupId = String(core.LEGACY_FINANCIAL_GROUP_ID || 'FG_LEGACY');
  const isGroupScopedKey = key => core.isFinancialGroupScopedKey?.(key) === true;
  const remoteDatasetKey = key => isGroupScopedKey(key) && financialGroupId !== legacyFinancialGroupId
    ? `fg_${sanitizeSegment(financialGroupId)}__${key}` : key;
  const remoteStampKey = key => isGroupScopedKey(key) && financialGroupId !== legacyFinancialGroupId
    ? `fg:${financialGroupId}:${key}` : key;
  // لا نزامن أبداً إلى عقدة تحمل معرفاً مختلفاً عن tenantId الحالي.
  // الجذور القديمة مسموحة فقط إذا كان اسم عقدة الشركة نفسه هو tenantId الثابت.
  const legacyCompanyIds = [];
  const companyIds = [canonicalCompanyId];

  const stateKey = `${STATE_KEY_PREFIX}::${encodeURIComponent(canonicalCompanyId)}::${encodeURIComponent(financialGroupId)}`;
  const locationKey = `${LOCATION_KEY_PREFIX}::${encodeURIComponent(canonicalCompanyId)}`;
  const usageStateKey = `ct_turso_usage_v77::${encodeURIComponent(canonicalCompanyId)}::${encodeURIComponent(financialGroupId)}`;
  const bootstrapKey = `ct_turso_bootstrap_v77::${encodeURIComponent(canonicalCompanyId)}::${encodeURIComponent(financialGroupId)}`;
  let syncing = false;
  let scheduledSync = null;
  let pollTimer = null;
  let licenseWatchTimer = null;
  let licenseWatchInFlight = false;
  let licenseLogoutTriggered = false;
  let selectedLocation = null;
  let authFallbackReason = '';
  let backgroundPullTimer = null;
  let backgroundPullRunning = false;
  let realtimeSource = null;
  let realtimeLocationPath = '';
  let realtimePullTimer = null;
  let syncSerial = Promise.resolve();
  const datasetRetryState = new Map();

  function readState() {
    try { return JSON.parse(sessionStorage.getItem(stateKey) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function writeState(patch) {
    const next = { ...readState(), ...patch };
    try { sessionStorage.setItem(stateKey, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function readUsageState() {
    try { return JSON.parse(rawStorage.get(usageStateKey) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function writeUsageState(patch) {
    const next = { ...readUsageState(), ...(patch || {}) };
    try { rawStorage.set(usageStateKey, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function loginSyncGateKey() {
    return `ct_login_sync_gate_v1::${encodeURIComponent(canonicalCompanyId)}`;
  }

  function markLoginFullSyncComplete(extra = {}) {
    try {
      const key = loginSyncGateKey();
      let previous = {};
      try { previous = JSON.parse(rawStorage.get(key) || '{}') || {}; } catch (_) { previous = {}; }
      const next = {
        ...previous,
        loginAt: String(session.loginAt || previous.loginAt || ''),
        completeOnline: true,
        completedAt: Date.now(),
        financialGroupId,
        ...extra
      };
      rawStorage.set(key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('cashtop:full-sync-complete', { detail: next }));
      return next;
    } catch (_) { return null; }
  }

  function hasSubstantialLocalCache() {
    let count = 0;
    for (const key of CLOUD_DATA_KEYS) {
      const value = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
      if (value === null) continue;
      const meta = core.safeJson?.(core.rawGet?.(core.metaKey?.(key)), {}) || {};
      if (meta.seeded === true) continue;
      count += 1;
      if (count >= 3) return true;
    }
    return false;
  }

  function errorMessage(error) {
    return String(error?.message || error?.code || error || 'تعذر الاتصال بقاعدة البيانات.');
  }

  function isTransientNetworkError(error) {
    const message = errorMessage(error).toLowerCase();
    const status = Number(error?.httpStatus || 0);
    return error?.name === 'TypeError' || error?.name === 'AbortError' ||
      [408, 425, 429, 500, 502, 503, 504].includes(status) ||
      /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|مهلة الاتصال|تعذر الاتصال|temporarily unavailable|service unavailable|bad gateway|gateway timeout/.test(message);
  }

  function safeSyncMessage(error) {
    if (!isTransientNetworkError(error)) return errorMessage(error);
    if (navigator.onLine === false) {
      return 'تعذر الوصول إلى خادم المزامنة حالياً. البيانات محفوظة محلياً وستُعاد المحاولة تلقائياً.';
    }
    return 'الإنترنت متوفر، لكن خادم المزامنة لم يستجب لهذه المحاولة. ستتم إعادة المحاولة تلقائياً دون فقدان أي عملية.';
  }


  function reportSyncProgress(current, total, label = '', extra = {}) {
    window.dispatchEvent(new CustomEvent('cashtop:sync-progress', {
      detail: { active: extra.active !== false, current, total, label, ...extra }
    }));
  }

  function reportPullStart(key = '', current = 0, total = 0) {
    window.dispatchEvent(new CustomEvent('cashtop:pull-start', { detail: { key, current, total } }));
  }

  function reportPullEnd(key = '', current = 0, total = 0) {
    window.dispatchEvent(new CustomEvent('cashtop:pull-end', { detail: { key, current, total } }));
  }

  function canRetryDatasetNow(key, manual = false) {
    if (manual) return true;
    const state = datasetRetryState.get(key);
    return !state || Number(state.nextAt || 0) <= Date.now();
  }

  function noteDatasetFailure(key, error) {
    const previous = datasetRetryState.get(key) || { count: 0 };
    const count = Math.min(8, Number(previous.count || 0) + 1);
    const delay = Math.min(60000, 2500 * (2 ** Math.max(0, count - 1)));
    datasetRetryState.set(key, { count, nextAt: Date.now() + delay, message: safeSyncMessage(error) });
  }

  function clearDatasetFailure(key) {
    datasetRetryState.delete(key);
  }


  function transportUrlForBase(url, candidateBase) {
    if (!isPathProxy) return String(url || '');
    const raw = String(url || '');
    if (!raw.startsWith(baseUrl)) return raw;
    let suffix = raw.slice(baseUrl.length).replace(/^\/+/, '');
    const queryAt = suffix.indexOf('?');
    const pathPart = (queryAt >= 0 ? suffix.slice(0, queryAt) : suffix).replace(/\.json$/i, '');
    return `${candidateBase}?path=${encodeURIComponent(pathPart)}`;
  }

  function transportCandidates(url) {
    if (!isPathProxy) return [{ url: String(url || ''), base: baseUrl }];
    const remembered = String(rawStorage.get(TRANSPORT_KEY) || readState().lastTransportBase || '').replace(/\/+$/, '');
    const ordered = [...new Set([
      configuredBaseUrls.includes(remembered) ? remembered : '',
      ...configuredBaseUrls
    ].filter(Boolean))];
    return ordered.map(candidateBase => ({
      base: candidateBase,
      url: transportUrlForBase(url, candidateBase)
    }));
  }

  function transportFetchOptions(options = {}) {
    if (!isPathProxy) return options;
    // هذه الرؤوس كانت تجبر المتصفح على CORS preflight حتى في GET، وبعض نسخ API
    // لا تسمح بها في Access-Control-Allow-Headers فتظهر Failed to fetch رغم وجود الإنترنت.
    // cache:'no-store' أدناه يكفي لمنع كاش المتصفح من دون إرسال رؤوس غير ضرورية للخادم.
    const headers = new Headers(options.headers || {});
    ['cache-control', 'pragma', 'if-match'].forEach(name => headers.delete(name));
    return { ...options, headers };
  }

  async function fetchAttempt(targetUrl, options, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(targetUrl, { ...transportFetchOptions(options), signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchWithTimeout(url, options = {}, timeout = 22000) {
    const candidates = transportCandidates(url);
    const method = String(options.method || 'GET').toUpperCase();
    const attemptsPerCandidate = navigator.onLine === false ? 1 : 2;
    let lastError = null;

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      const targetUrl = candidate.url;
      const hasFallback = candidateIndex < candidates.length - 1;
      const candidateTimeout = hasFallback ? Math.min(timeout, 8000) : timeout;
      for (let attempt = 0; attempt < attemptsPerCandidate; attempt += 1) {
        try {
          const response = await fetchAttempt(targetUrl, options, candidateTimeout);
          // أخطاء الخادم المؤقتة يعاد طلبها سريعاً بدلاً من اعتبار الجهاز بلا إنترنت.
          const transientStatus = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
          if (transientStatus && attempt + 1 < attemptsPerCandidate) {
            await new Promise(resolve => setTimeout(resolve, 180 + (attempt * 320)));
            continue;
          }

          // إذا أعادت الاستضافة صفحة HTML بدلاً من JSON نرفضها كاستجابة مزامنة غير صالحة.
          if (isPathProxy && response.ok) {
            const type = String(response.headers.get('content-type') || '').toLowerCase();
            if (type && !type.includes('json')) {
              lastError = new Error('نقطة المزامنة أعادت محتوى غير JSON.');
              lastError.httpStatus = response.status;
              break;
            }
          }

          if (hasFallback && (transientStatus || [401, 403, 404, 405].includes(response.status))) {
            lastError = new Error(`تعذر استخدام نقطة المزامنة (${response.status}).`);
            lastError.httpStatus = response.status;
            break;
          }

          rawStorage.set(TRANSPORT_KEY, candidate.base);
          writeState({
            backendReachable: true,
            backendReachableAt: Date.now(),
            lastTransportUrl: targetUrl,
            lastTransportBase: candidate.base
          });
          return response;
        } catch (error) {
          lastError = error;
          writeState({ backendReachable: false, backendErrorAt: Date.now(), backendError: errorMessage(error) });
          if (attempt + 1 < attemptsPerCandidate) {
            await new Promise(resolve => setTimeout(resolve, 180 + (attempt * 320)));
            continue;
          }
        }
      }
    }

    if (lastError?.name === 'AbortError') {
      const error = new Error('انتهت مهلة استجابة خادم قاعدة البيانات.');
      error.name = 'SyncTimeoutError';
      throw error;
    }
    throw lastError || new Error(`${method} request failed`);
  }

  async function databaseError(response) {
    const payload = await response.json().catch(() => null);
    const code = String(payload?.error?.message || payload?.error || '').trim();
    let message = `خطأ قاعدة البيانات (${response.status})${code ? `: ${code}` : ''}`;
    if (code.includes('DATABASE_WRITE_FORBIDDEN')) {
      message = 'اتصال Turso يسمح بالقراءة لكنه يرفض الكتابة. تأكد أن Turso Auth Token يملك صلاحية rw.';
    } else if (response.status === 401 || response.status === 403 || code.includes('PERMISSION_DENIED')) {
      message = authFallbackReason
        ? 'رفض خادم قاعدة البيانات الوصول إلى هذا المسار.'
        : 'رفض خادم قاعدة البيانات الوصول. راجع صلاحيات API والمسار.';
    } else if (response.status === 405 || code.includes('METHOD_NOT_ALLOWED')) {
      message = 'نقطة اتصال Turso الحالية لا تدعم هذه العملية.';
    } else if (response.status === 413 || code.includes('TOO_LARGE')) {
      message = 'حجم مجموعة البيانات أكبر من حد الخادم، لذلك لم تُرفع العملية.';
    } else if (response.status === 503 || code.includes('DATABASE_UNAVAILABLE')) {
      message = `تعذرت الكتابة في Turso (${response.status})${code ? `: ${code}` : ''}. راجع رابط Turso وصلاحية rw للتوكن.`;
    }
    const error = new Error(message);
    error.databaseCode = code;
    error.httpStatus = response.status;
    return error;
  }


  function isPermissionError(error) {
    const code = String(error?.databaseCode || error?.message || '');
    const status = Number(error?.httpStatus || 0);
    return status === 401 || status === 403 || code.includes('PERMISSION_DENIED');
  }

  async function requireDatabaseToken() { return ''; }

  function exactLocation() {
    return { root: primaryRoot, companyId: canonicalCompanyId };
  }

  function legacyCandidateLocations() {
    const roots = [...new Set([
      primaryRoot,
      ...legacyRoots.map(root => String(root || '').replace(/^\/+|\/+$/g, ''))
    ].filter(Boolean))];
    const locations = [];
    roots.forEach(root => {
      if (root !== primaryRoot) locations.push({ root, companyId: canonicalCompanyId });
      legacyCompanyIds.forEach(companyId => locations.push({ root, companyId }));
    });
    return locations.filter((location, index, all) =>
      all.findIndex(item => item.root === location.root && item.companyId === location.companyId) === index
    );
  }

  function locationPath(location) {
    return `${location.root}/${location.companyId}`;
  }

  function databaseEndpoint(location, token = '') {
    const query = token ? `?auth=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/${locationPath(location)}.json${query}`;
  }


  function datasetEndpoint(location, key, token = '') {
    const query = token ? `?auth=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/${locationPath(location)}/datasets/${sanitizeSegment(remoteDatasetKey(key))}.json${query}`;
  }

  function auditTrailEndpoint(location, day, hour = '', recordId = '', token = '') {
    const query = token ? `?auth=${encodeURIComponent(token)}` : '';
    const hourPath = hour === '' ? '' : `/${sanitizeSegment(hour)}`;
    const suffix = recordId ? `/${sanitizeSegment(recordId)}` : '';
    return `${baseUrl}/${locationPath(location)}/auditTrail/${sanitizeSegment(day)}${hourPath}${suffix}.json${query}`;
  }

  function auditTrailRecentEndpoint(location, recordId = '', token = '') {
    const query = token ? `?auth=${encodeURIComponent(token)}` : '';
    const suffix = recordId ? `/${sanitizeSegment(recordId)}` : '';
    return `${baseUrl}/${locationPath(location)}/auditTrailRecent${suffix}.json${query}`;
  }

  function auditTrailLegacyRootEndpoint(location, token = '') {
    const query = token ? `?auth=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/${locationPath(location)}/auditTrail.json${query}`;
  }

  function metaEndpoint(location, token = '') {
    const query = token ? `?auth=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/${locationPath(location)}/meta.json${query}`;
  }


  const realtimePendingKeys = new Set();

  function stopRealtimeStream() {
    clearTimeout(realtimePullTimer);
    realtimePullTimer = null;
    realtimePendingKeys.clear();
    if (realtimeSource) {
      try { realtimeSource.close(); } catch (_) {}
      realtimeSource = null;
    }
    realtimeLocationPath = '';
  }

  function realtimeDatasetKey(pathValue) {
    const path = String(pathValue || '/').replace(/^\/+/, '');
    if (!path) return '';
    const segment = path.split('/')[0];
    return CLOUD_DATA_KEYS.find(key => sanitizeSegment(remoteDatasetKey(key)) === segment) || '';
  }

  function scheduleRealtimePull(key = '') {
    if (key) realtimePendingKeys.add(key);
    clearTimeout(realtimePullTimer);
    realtimePullTimer = setTimeout(async () => {
      // لا نعتمد على navigator.onLine كحكم نهائي؛ بعض الأجهزة تعطي حالة خاطئة.
      const keys = [...realtimePendingKeys];
      realtimePendingKeys.clear();
      try {
        if (core.getSyncQueue().length) {
          await syncAll({ manual: false, forceCheck: false, realtime: true });
        } else if (keys.length) {
          await pullDatasetKeys(keys, { concurrency: 8 });
        } else {
          await pullPriorityDatasets({ concurrency: 8, silentProgress: true });
        }
      } catch (error) {
        console.warn('[CASH TOP 2] realtime pull deferred:', error);
      }
    }, 70);
  }

  function startRealtimeStream(location, token = '') {
    if (isPathProxy || typeof EventSource !== 'function' || !location) return false;
    const path = locationPath(location);
    if (realtimeSource && realtimeLocationPath === path && realtimeSource.readyState !== EventSource.CLOSED) return true;
    stopRealtimeStream();
    const query = token ? `?auth=${encodeURIComponent(token)}` : '';
    const url = `${baseUrl}/${path}/datasets.json${query}`;
    try {
      const source = new EventSource(url);
      realtimeSource = source;
      realtimeLocationPath = path;
      source.addEventListener('open', () => {
        writeState({ realtimeConnected: true, realtimeAt: Date.now(), remotePath: path });
      });
      const onData = event => {
        try {
          const payload = JSON.parse(event.data || '{}');
          const key = realtimeDatasetKey(payload.path);
          // حدث path=/ هو لقطة الاتصال الأولى؛ سحب الصفحة يكفي بدلاً من تنزيل كل الشركة.
          scheduleRealtimePull(key);
        } catch (_) {
          scheduleRealtimePull('');
        }
      };
      source.addEventListener('put', onData);
      source.addEventListener('patch', onData);
      source.addEventListener('cancel', () => writeState({ realtimeConnected: false, realtimeAt: Date.now() }));
      source.onerror = () => {
        writeState({ realtimeConnected: false, realtimeAt: Date.now() });
        if (source.readyState === EventSource.CLOSED) {
          setTimeout(async () => {
            try {
              const access = await openLightDatabaseAccess();
              startRealtimeStream(access.location, access.token);
            } catch (_) {}
          }, 2200);
        }
      };
      return true;
    } catch (error) {
      console.warn('[CASH TOP 2] realtime stream unavailable:', error);
      return false;
    }
  }

  function directBridgePath(location, suffix = '') {
    const base = locationPath(location);
    return suffix ? `${base}/${String(suffix).replace(/^\/+/, '')}` : base;
  }

  function cheapDatabaseAccess() {
    if (isPathProxy && window.CashtopTursoBridge) {
      const location = exactLocation();
      saveSelectedLocation(location);
      return Promise.resolve({ token: '', location, accessPayload: null, cheap: true });
    }
    return openLightDatabaseAccess();
  }

  async function readDatasetLocation(location, key, token = '', options = {}) {
    if (isPathProxy && window.CashtopTursoBridge?.readExact) {
      const value = await window.CashtopTursoBridge.readExact(
        directBridgePath(location, `datasets/${sanitizeSegment(remoteDatasetKey(key))}`),
        { cache: options.fresh !== true }
      );
      return value === undefined ? null : value;
    }
    const response = await fetchWithTimeout(datasetEndpoint(location, key, token), {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache, no-store, max-age=0', 'Pragma': 'no-cache' }
    }, 16000);
    if (!response.ok) throw await databaseError(response);
    return await response.json();
  }


  /* R125 — API قراءة صفحة سجلات فقط. لا يكتب إلى localStorage ولا يغيّر الحسابات. */
  async function queryDatasetPage(key, options = {}) {
    const allowed = new Set(['cashtop_customers','cashtop_products','cashtop_invoices']);
    if (!allowed.has(key)) throw new Error('PAGED_DATASET_NOT_ALLOWED');
    const page = Math.max(1, Number(options.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 50)));
    const { location } = await cheapDatabaseAccess();
    if (isPathProxy && window.CashtopTursoBridge?.readDatasetPage) {
      const path = directBridgePath(location, `datasets/${sanitizeSegment(remoteDatasetKey(key))}`);
      return window.CashtopTursoBridge.readDatasetPage(path, { page, pageSize });
    }
    // توافق احتياطي: إذا لم تتوفر قراءة الصفحات، نقرأ بالطريقة القديمة بدون أي كتابة محلية.
    const raw = await readDatasetLocation(location, key, '', { fresh: true });
    const payload = normalizeRemotePayload(raw);
    let values = payloadJsonValue(payload);
    if (!Array.isArray(values)) values = [];
    const ordered = values.slice().reverse();
    const start = (page - 1) * pageSize;
    const total = ordered.length;
    return {
      items: ordered.slice(start, start + pageSize), total, page,
      pages: Math.max(1, Math.ceil(total / pageSize)), pageSize,
      hasNext: start + pageSize < total, hasPrev: page > 1,
      updatedAt: Number(payload.updatedAt || 0), legacyFallback: true
    };
  }

  async function readMetaLocation(location, token = '', options = {}) {
    if (isPathProxy && window.CashtopTursoBridge?.readExact) {
      const value = await window.CashtopTursoBridge.readExact(
        directBridgePath(location, 'meta'),
        { cache: options.fresh !== true }
      );
      return value && typeof value === 'object' ? value : {};
    }
    const response = await fetchWithTimeout(metaEndpoint(location, token), {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache, no-store, max-age=0', 'Pragma': 'no-cache' }
    }, 10000);
    if (!response.ok) throw await databaseError(response);
    return (await response.json()) || {};
  }

  /* Turso bridge direct calls avoid a second in-page HTTP abstraction. */
  async function writeJsonEndpoint(url, payload, timeout = 18000) {
    const body = JSON.stringify(payload);
    if (isPathProxy) {
      let response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'application/json' },
        body
      }, timeout);
      if ([404, 405, 501].includes(response.status)) {
        response = await fetchWithTimeout(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json;charset=UTF-8' },
          body
        }, timeout);
      }
      return response;
    }
    return fetchWithTimeout(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'no-cache, no-store, max-age=0' },
      body
    }, timeout);
  }

  async function writeDatasetLocation(location, key, token = '', payload = null) {
    if (isPathProxy && window.CashtopTursoBridge?.writeNode) {
      await window.CashtopTursoBridge.writeNode(
        directBridgePath(location, `datasets/${sanitizeSegment(remoteDatasetKey(key))}`), payload, false
      );
      return { ok: true, data: payload };
    }
    const response = await writeJsonEndpoint(datasetEndpoint(location, key, token), payload, 18000);
    if (!response.ok) throw await databaseError(response);
    return { ok: true, data: await response.json().catch(() => payload) };
  }

  async function writeMetaLocation(location, token = '', patch = {}) {
    // Complete compact metadata: no read-before-write. This removes one billed
    // read from every normal synchronization batch.
    const next = { ...(patch || {}), updatedAt: Date.now() };
    if (isPathProxy && (window.CashtopTursoBridge?.patchNode || window.CashtopTursoBridge?.writeNode)) {
      if (window.CashtopTursoBridge?.patchNode) await window.CashtopTursoBridge.patchNode(directBridgePath(location, 'meta'), next);
      else await window.CashtopTursoBridge.writeNode(directBridgePath(location, 'meta'), next, false);
      return next;
    }
    const response = await writeJsonEndpoint(metaEndpoint(location, token), next, 12000);
    if (!response.ok) throw await databaseError(response);
    return next;
  }

  function pagePriorityDatasets() {
    const common = ['cashtop_company_access', 'cashtop_financial_groups', 'cashtop_branches', 'cashtop_employees'];
    const map = {
      'لوحة التحكم.html': ['cashtop_invoices', 'cashtop_products', 'cashtop_customers', 'cashtop_expenses', 'cashtop_funds_db'],
      // Listing folders only needs the compact shared group index. The rare
      // close/open action explicitly pulls its required balances once.
      'financial-groups.html': ['cashtop_financial_groups'],
      'cashier.html': ['cashtop_products', 'cashtop_product_categories', 'cashtop_customers', 'cashtop_customer_groups', 'cashtop_funds_db', 'cashtop_sales_offers', 'cashtop_tax_settings', 'cashtop_units', 'cashtop_stores', 'cashtop_settings'],
      'products.html': ['cashtop_products', 'cashtop_product_categories', 'cashtop_units', 'cashtop_stores', 'cashtop_suppliers', 'cashtop_purchases', 'cashtop_funds_db', 'cashtop_tax_settings', 'cashtop_settings'],
      'categories.html': ['cashtop_product_categories', 'cashtop_products'],
      'materials.html': ['cashtop_materials', 'cashtop_material_purchases', 'cashtop_units', 'cashtop_stores', 'cashtop_suppliers', 'cashtop_funds_db'],
      'invoices.html': ['cashtop_invoices', 'cashtop_products', 'cashtop_customers', 'cashtop_funds_db', 'cashtop_sales_offers', 'cashtop_sales_returns'],
      'مرجع المبيعات.html': ['cashtop_sales_returns', 'cashtop_products', 'cashtop_customers', 'cashtop_funds_db', 'cashtop_invoices'],
      'customers.html': ['cashtop_customers', 'cashtop_customer_groups', 'cashtop_invoices', 'cashtop_sales_returns', 'cashtop_vouchers'],
      'customer-groups.html': ['cashtop_customer_groups', 'cashtop_customers', 'cashtop_products'],
      'suppliers.html': ['cashtop_suppliers', 'cashtop_supplier_movements', 'cashtop_purchases'],
      'المشتريات.html': ['cashtop_purchases', 'cashtop_purchase_reversals', 'cashtop_products', 'cashtop_suppliers', 'cashtop_funds_db', 'cashtop_stores', 'cashtop_tax_settings', 'cashtop_settings'],
      'مرجع المشتريات.html': ['cashtop_purchase_returns', 'cashtop_purchases', 'cashtop_products', 'cashtop_suppliers'],
      'المصاريف.html': ['cashtop_expenses', 'cashtop_expense_types', 'cashtop_funds_db'],
      'accounts.html': ['cashtop_funds_db', 'cashtop_vouchers', 'cashtop_transfer_history'],
      'journal.html': ['cashtop_journal', 'cashtop_funds_db', 'cashtop_invoices', 'cashtop_purchases', 'cashtop_expenses', 'cashtop_vouchers', 'cashtop_sales_returns', 'cashtop_purchase_returns', 'cashtop_material_purchases', 'cashtop_salary_payments', 'cashtop_suppliers', 'cashtop_workers', 'cashtop_sales_agents', 'cashtop_agent_movements', 'cashtop_purchase_reversals'],
      'branches.html': ['cashtop_branches', 'cashtop_stores', 'cashtop_employees', 'cashtop_products'],
      'warehouses.html': ['cashtop_stores', 'cashtop_products', 'cashtop_transfer_history'],
      'units.html': ['cashtop_units', 'cashtop_products'],
      'shortages.html': ['cashtop_products', 'cashtop_stores'],
      'الموظفين.html': ['cashtop_employees', 'cashtop_branches', 'cashtop_salary_payments'],
      'العمال والاجور.html': ['cashtop_workers', 'cashtop_salary_payments', 'cashtop_funds_db'],
      'المناديب.html': ['cashtop_sales_agents', 'cashtop_agent_movements', 'cashtop_invoices'],
      'sales-offers.html': ['cashtop_sales_offers', 'cashtop_products'],
      'sands.html': ['cashtop_vouchers', 'cashtop_funds_db'],
      'barcode-generator.html': ['cashtop_products', 'cashtop_barcode_settings', 'cashtop_settings'],
      'printer-settings.html': ['cashtop_printer_settings', 'cashtop_barcode_settings', 'cashtop_settings', 'cashtop_invoice_design'],
      'invoice-designer.html': ['cashtop_invoice_design', 'cashtop_printer_settings', 'cashtop_settings', 'cashtop_invoices'],
      'tax-settings.html': ['cashtop_tax_settings', 'cashtop_settings'],
      'storage-settings.html': ['cashtop_archive_index', 'cashtop_invoices', 'cashtop_transfer_history', 'cashtop_branch_transfer_history', 'cashtop_settings'],
      'setting.html': ['cashtop_company_access', 'cashtop_settings', 'cashtop_db', 'cashtop_branches', 'cashtop_employees', 'cashtop_sales_agents', 'cashtop_sms_template', 'cashtop_invoice_message_template'],
      'ادارة التصنيع.html': ['cashtop_manufacturing_recipes', 'cashtop_manufacturing_orders', 'cashtop_products', 'cashtop_materials', 'cashtop_stores'],
      'التقارير.html': ['cashtop_invoices', 'cashtop_purchases', 'cashtop_purchase_reversals', 'cashtop_expenses', 'cashtop_products', 'cashtop_customers', 'cashtop_funds_db'],
      'notifications.html': ['cashtop_notification_settings', 'cashtop_settings', 'cashtop_products', 'cashtop_customers', 'cashtop_invoices', 'cashtop_workers', 'cashtop_salary_payments', 'cashtop_funds_db']
    };
    return [...new Set([...common, ...(map[core.FILE] || [])])].filter(key => CLOUD_DATA_KEYS.includes(key));
  }

  function assertAccessIdentity(rawPayload, location) {
    if (rawPayload == null) return true;
    const access = decodeDatasetObject(rawPayload);
    const remoteTenant = sanitizeSegment(access.tenantId || access.companyId || location.companyId || '');
    const remoteKey = String(access.companyKey || '').trim().toUpperCase();
    if (remoteTenant && remoteTenant !== canonicalCompanyId) throw new Error('تم منع مزامنة بيانات شركة أخرى مع الجلسة الحالية.');
    if (normalizedCompanyKey && remoteKey && remoteKey !== normalizedCompanyKey) throw new Error('مفتاح الشركة في قاعدة البيانات لا يطابق جلسة الدخول الحالية.');
    return true;
  }

  async function openLightDatabaseAccess() {
    const location = exactLocation();
    try {
      const accessPayload = await readDatasetLocation(location, 'cashtop_company_access', '');
      assertAccessIdentity(accessPayload, location);
      saveSelectedLocation(location);
      return { token: '', location, accessPayload };
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      const token = await requireDatabaseToken();
      const accessPayload = await readDatasetLocation(location, 'cashtop_company_access', token);
      assertAccessIdentity(accessPayload, location);
      saveSelectedLocation(location);
      return { token, location, accessPayload };
    }
  }

  async function readLocation(location, token) {
    const response = await fetchWithTimeout(databaseEndpoint(location, token), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Cashtop-ETag': 'true',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) throw await databaseError(response);
    return {
      data: (await response.json()) || {},
      etag: response.headers.get('ETag') || '*'
    };
  }

  async function writeLocation(location, token, data, etag = '*') {
    const headers = {
      'Content-Type': 'application/json;charset=UTF-8',
      'Cache-Control': 'no-cache, no-store, max-age=0'
    };
    if (!isPathProxy) headers['If-Match'] = etag;
    const response = isPathProxy
      ? await writeJsonEndpoint(databaseEndpoint(location, token), data, 22000)
      : await fetchWithTimeout(databaseEndpoint(location, token), {
          method: 'PUT', headers, body: JSON.stringify(data)
        });
    if (response.status === 412) return { conflict: true };
    if (!response.ok) throw await databaseError(response);
    return { ok: true, data: await response.json().catch(() => data) };
  }

  function remoteStats(data) {
    const datasets = data?.datasets && typeof data.datasets === 'object' ? data.datasets : {};
    const times = Object.values(datasets).map(item => Number(item?.updatedAt || 0));
    const updatedAt = Math.max(Number(data?.meta?.updatedAt || 0), ...times, 0);
    const count = Object.keys(datasets).length;
    return { count, updatedAt, hasData: count > 0 || Boolean(data?.meta) };
  }

  function remoteIdentity(data) {
    const meta = data?.meta && typeof data.meta === 'object' ? data.meta : {};
    const rawAccess = data?.datasets?.cashtop_company_access;
    let access = {};
    try {
      const payload = normalizeRemotePayload(rawAccess);
      const decoded = payload?.valueEncoding === VALUE_ENCODING && typeof payload.value === 'string'
        ? JSON.parse(payload.value)
        : payload?.value;
      if (decoded && typeof decoded === 'object') access = decoded;
    } catch (_) {}
    return {
      tenantId: sanitizeSegment(access.tenantId || access.companyId || meta.tenantId || meta.companyId || ''),
      companyId: sanitizeSegment(access.tenantId || access.companyId || meta.tenantId || meta.companyId || ''),
      companyKey: String(access.companyKey || meta.companyKey || '').trim().toUpperCase()
    };
  }

  function locationBelongsToCurrentCompany(location, data) {
    const stats = remoteStats(data);
    if (!stats.hasData) return location.root === primaryRoot && location.companyId === canonicalCompanyId;
    const identity = remoteIdentity(data);
    // أي عقدة تحتوي بيانات يجب أن تعلن نفس tenantId الثابت. لا نعتمد على المفتاح
    // وحده لأن المفتاح يمكن تغييره أو إعادة استخدامه لاحقاً لشركة أخرى.
    if (!identity.tenantId || identity.tenantId !== canonicalCompanyId) return false;
    if (normalizedCompanyKey && identity.companyKey && identity.companyKey !== normalizedCompanyKey) return false;
    return true;
  }

  function loadCachedLocation() {
    try {
      const cached = JSON.parse(rawStorage.get(locationKey) || 'null');
      if (cached?.root && cached?.companyId) return { root: cached.root, companyId: cached.companyId };
    } catch (_) {}
    return null;
  }

  function saveSelectedLocation(location) {
    selectedLocation = location;
    rawStorage.set(locationKey, JSON.stringify({ ...location, selectedAt: Date.now() }));
    writeState({ remotePath: locationPath(location), canonicalCompanyId });
  }

  async function resolveLocation(token, forceProbe = false) {
    const isExact = location => location?.root === primaryRoot && location?.companyId === canonicalCompanyId;
    if (selectedLocation && !forceProbe && isExact(selectedLocation)) {
      const read = await readLocation(selectedLocation, token);
      if (locationBelongsToCurrentCompany(selectedLocation, read.data)) {
        return { location: selectedLocation, read };
      }
      selectedLocation = null;
    }

    let permissionError = null;
    const cached = loadCachedLocation();
    if (cached && !forceProbe && isExact(cached)) {
      try {
        const read = await readLocation(cached, token);
        if (locationBelongsToCurrentCompany(cached, read.data)) {
          saveSelectedLocation(cached);
          return { location: cached, read };
        }
        rawStorage.remove(locationKey);
      } catch (error) {
        if (isPermissionError(error)) permissionError = error;
        else console.warn('[CASH TOP 2] database cached path:', locationPath(cached), error);
      }
    }

    /* المسار الرسمي للشركة هو الخيار الأول دائماً حتى لو كان هناك مسار تاريخي محفوظ. */
    const exact = exactLocation();
    let exactRead = null;
    try {
      exactRead = await readLocation(exact, token);
      if (remoteStats(exactRead.data).hasData) {
        if (!locationBelongsToCurrentCompany(exact, exactRead.data)) {
          throw new Error('تعارض هوية مسار قاعدة البيانات: المسار الحالي يحتوي بيانات شركة أخرى. تم إيقاف المزامنة لحماية البيانات.');
        }
        saveSelectedLocation(exact);
        return { location: exact, read: exactRead };
      }
    } catch (error) {
      if (isPermissionError(error)) permissionError = error;
      else throw error;
    }

    /*
     * ترحيل اختياري من المسارات التاريخية: لا نستخدم أي عقدة إلا عندما يثبت
     * companyId أو companyKey داخلها أنها تخص الجلسة الحالية.
     */
    let legacyMatch = null;
    const legacyLocations = legacyCandidateLocations();
    if (cached && !isExact(cached)) legacyLocations.unshift(cached);
    if (selectedLocation && !isExact(selectedLocation)) legacyLocations.unshift(selectedLocation);
    for (const location of legacyLocations.filter((item, index, all) =>
      all.findIndex(other => other.root === item.root && other.companyId === item.companyId) === index
    )) {
      try {
        const read = await readLocation(location, token);
        const stats = remoteStats(read.data);
        if (!stats.hasData || !locationBelongsToCurrentCompany(location, read.data)) continue;
        if (!legacyMatch || stats.updatedAt > legacyMatch.stats.updatedAt) {
          legacyMatch = { location, read, stats };
        }
      } catch (error) {
        if (isPermissionError(error)) permissionError ||= error;
        else console.warn('[CASH TOP 2] database legacy path probe:', locationPath(location), error);
      }
    }

    if (legacyMatch) {
      saveSelectedLocation(legacyMatch.location);
      return { location: legacyMatch.location, read: legacyMatch.read };
    }
    if (!exactRead && permissionError) throw permissionError;

    saveSelectedLocation(exact);
    return { location: exact, read: exactRead || { data: {}, etag: '*' } };
  }

  // نجرب Realtime Database مباشرة أولاً. بذلك لا يتم استدعاء خدمة
  // Authentication غير المهيأة ولا يظهر CONFIGURATION_NOT_FOUND. لا نحاول
  // Anonymous Auth إلا إذا كانت قواعد قاعدة البيانات نفسها ترفض الوصول.
  async function openDatabaseAccess(forceProbe = false) {
    try {
      return {
        token: '',
        authMode: isPathProxy ? 'turso-api' : 'database-rules',
        resolved: await resolveLocation('', forceProbe)
      };
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      const token = await requireDatabaseToken();
      selectedLocation = null;
      return {
        token,
        authMode: 'anonymous',
        resolved: await resolveLocation(token, forceProbe)
      };
    }
  }

  function localMetaFor(key) {
    return core.safeJson(core.rawGet(core.metaKey(key)), {}) || {};
  }

  /*
   * طبقة المزامنة تستخدم أسماء مسارات آمنة ولا تسمح بمحارف المسار الخاصة داخل اسم مجموعة البيانات.
   * صلاحيات الموظفين تستخدم مفاتيح دقيقة مثل sales.create ولذلك كان رفع
   * كائن الموظف مباشرة يفشل برسالة Invalid data. نحفظ قيمة كل dataset كنص
   * JSON واحد في التخزين السحابي ثم نعيدها كما هي إلى localStorage. هذا يحافظ على
   * جميع المفاتيح الأصلية ويمنع الخطأ لأي بيانات مستقبلية أيضاً.
   */
  const VALUE_ENCODING = 'local-storage-json-v1';

  function normalizeRemotePayload(payload) {
    if (payload && typeof payload === 'object' && (
      Object.prototype.hasOwnProperty.call(payload, 'value') ||
      Object.prototype.hasOwnProperty.call(payload, 'updatedAt') ||
      Object.prototype.hasOwnProperty.call(payload, 'revision') ||
      payload.deleted === true
    )) {
      const encoded = payload.valueEncoding === VALUE_ENCODING;
      return {
        value: payload.deleted === true ? null : payload.value,
        valueEncoding: encoded ? VALUE_ENCODING : '',
        deleted: payload.deleted === true,
        updatedAt: Number(payload.updatedAt || 0),
        revision: Math.max(1, Number(payload.revision || 1)),
        deviceId: payload.deviceId || null,
        page: payload.page || '',
        recordTombstones: payload.recordTombstones && typeof payload.recordTombstones === 'object' ? payload.recordTombstones : {}
      };
    }
    return {
      value: payload,
      valueEncoding: '',
      deleted: payload == null,
      updatedAt: 0,
      revision: 1,
      deviceId: null,
      page: '',
      recordTombstones: {}
    };
  }

  function makeLocalPayload(key, remoteRevision = 0) {
    const raw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
    const meta = localMetaFor(key);
    return {
      value: raw == null ? null : String(raw),
      valueEncoding: VALUE_ENCODING,
      deleted: raw == null,
      updatedAt: Math.max(1, Number(meta.updatedAt || 0), Date.now()),
      revision: Math.max(1, Number(meta.revision || 0), Number(remoteRevision || 0) + 1),
      deviceId: core.rawGet('cashtop_device_id') || '',
      page: core.FILE || '',
      recordTombstones: meta.recordTombstones && typeof meta.recordTombstones === 'object' ? meta.recordTombstones : {}
    };
  }

  function decodeDatasetObject(payload) {
    try {
      const normalized = normalizeRemotePayload(payload);
      if (normalized.deleted) return {};
      let value = normalized.value;
      if (normalized.valueEncoding === VALUE_ENCODING && typeof value === 'string') value = JSON.parse(value);
      else if (typeof value === 'string') value = JSON.parse(value);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function mergeAdminControlledAccess(remotePayload) {
    const key = 'cashtop_company_access';
    const remoteAccess = decodeDatasetObject(remotePayload);
    if (!Object.keys(remoteAccess).length) return false;
    const localRaw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
    let localAccess = {};
    try { localAccess = JSON.parse(localRaw || '{}') || {}; } catch (_) { localAccess = {}; }
    const protectedFields = [
      'companyId', 'companyKey', 'companyName', 'status', 'plan', 'startAt', 'endAt',
      'durationUnit', 'durationQuantity', 'backupImportEnabled', 'authVersion', 'deleted'
    ];
    const merged = { ...localAccess };
    protectedFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(remoteAccess, field)) merged[field] = remoteAccess[field];
    });
    /* بيانات المدير الإدارية تبقى مرجعية من الخادم. أما اسم المستخدم/كلمة المرور
       فيمكن تغييرهما من إعدادات الشركة؛ credentialsUpdatedAt يمنع أن يعيد سحب
       قديم كتابة اسم المستخدم السابق أثناء وجود تعديل محلي معلّق. */
    if (remoteAccess.manager && typeof remoteAccess.manager === 'object') {
      const remoteManager = remoteAccess.manager || {};
      const localManager = localAccess.manager || {};
      const localCredentialStamp = Number(localManager.credentialsUpdatedAt || 0);
      const remoteCredentialStamp = Number(remoteManager.credentialsUpdatedAt || 0);
      const preferLocalCredentials = localCredentialStamp > 0 && localCredentialStamp >= remoteCredentialStamp;
      merged.manager = { ...remoteManager, ...localManager };
      ['id', 'displayName', 'role', 'active', 'authVersion'].forEach(field => {
        if (Object.prototype.hasOwnProperty.call(remoteManager, field)) merged.manager[field] = remoteManager[field];
      });
      if (!preferLocalCredentials && Object.prototype.hasOwnProperty.call(remoteManager, 'username')) merged.manager.username = remoteManager.username;
      if (!preferLocalCredentials && Object.prototype.hasOwnProperty.call(remoteManager, 'credentialsUpdatedAt')) merged.manager.credentialsUpdatedAt = remoteManager.credentialsUpdatedAt;
    }
    const mergedRaw = JSON.stringify(merged);
    if (mergedRaw === String(localRaw || '')) return false;
    core.rawSet(core.namespaceKey(key), mergedRaw);
    return true;
  }


  // R126 — مراقبة مستقلة وخفيفة للمفتاح من السحابة.
  // لا تنتظر مزامنة السجلات ولا تسحب أي جدول: تقرأ cashtop_company_access فقط.
  function remoteLicenseReason(rawPayload) {
    if (rawPayload == null) return 'deleted';
    const normalized = normalizeRemotePayload(rawPayload);
    if (normalized.deleted) return 'deleted';
    const access = decodeDatasetObject(rawPayload);
    if (!Object.keys(access).length) return 'deleted';
    const remoteTenant = sanitizeSegment(access.tenantId || access.companyId || canonicalCompanyId);
    const remoteKey = String(access.companyKey || '').trim().toUpperCase();
    if (remoteTenant && remoteTenant !== canonicalCompanyId) return 'tenant-mismatch';
    if (normalizedCompanyKey && remoteKey && remoteKey !== normalizedCompanyKey) return 'tenant-mismatch';
    if (access.deleted === true || String(access.status || '').trim().toLowerCase() === 'deleted') return 'deleted';
    const status = String(access.status || 'active').trim().toLowerCase();
    if (status && status !== 'active') return 'stopped';
    const endAt = access.endAt ? new Date(access.endAt).getTime() : 0;
    if (endAt && Number.isFinite(endAt) && core.trustedNowMs?.(core.getSession()) >= endAt) return 'expired';
    if (access.manager && access.manager.active === false) return 'user-disabled';
    return '';
  }

  async function checkLicenseCloudNow(options = {}) {
    if (licenseLogoutTriggered || licenseWatchInFlight) return { skipped: true };
    const currentSession = core.getSession?.();
    if (!currentSession) return { skipped: true, noSession: true };
    if (document.hidden && options.force !== true) return { skipped: true, hidden: true };
    if (navigator.onLine === false && options.force !== true) return { skipped: true, offline: true };
    licenseWatchInFlight = true;
    const startedAt = Date.now();
    try {
      const location = exactLocation();
      let token = '';
      let rawAccess;
      try {
        rawAccess = await readDatasetLocation(location, 'cashtop_company_access', '', { fresh: true });
      } catch (error) {
        if (!isPermissionError(error)) throw error;
        token = await requireDatabaseToken();
        rawAccess = await readDatasetLocation(location, 'cashtop_company_access', token, { fresh: true });
      }

      const reason = remoteLicenseReason(rawAccess);
      if (reason) {
        licenseLogoutTriggered = true;
        // إذا كانت العقدة ما زالت موجودة (إيقاف/حذف ناعم) نحدّث النسخة المحلية
        // أولاً حتى لا تعيد أي صفحة أخرى اعتبار المفتاح نشطاً أثناء الخروج.
        if (rawAccess != null) {
          try { mergeAdminControlledAccess(rawAccess); } catch (_) {}
          try { window.dispatchEvent(new CustomEvent('cashtop:remote-applied', { detail: { key: 'cashtop_company_access', source: 'license-watch' } })); } catch (_) {}
        }
        writeState({ licenseCheckedAt: Date.now(), licenseStatus: reason, licenseWatchMs: Date.now() - startedAt });
        await core.logout(reason);
        return { ok: false, reason };
      }

      const changed = mergeAdminControlledAccess(rawAccess);
      writeState({ licenseCheckedAt: Date.now(), licenseStatus: 'active', licenseWatchMs: Date.now() - startedAt });
      if (changed) {
        try { window.dispatchEvent(new CustomEvent('cashtop:remote-applied', { detail: { key: 'cashtop_company_access', source: 'license-watch' } })); } catch (_) {}
      }
      const localResult = core.validateSessionLocal?.(core.getSession?.());
      if (localResult && localResult.ok === false) {
        licenseLogoutTriggered = true;
        await core.logout(localResult.reason || 'auth-required');
        return { ok: false, reason: localResult.reason || 'auth-required' };
      }
      return { ok: true };
    } catch (error) {
      // أخطاء الشبكة أو المصادقة المؤقتة لا تسجل خروج المستخدم. الخروج يحدث فقط
      // عندما تصل إجابة صريحة من مسار الشركة بأن المفتاح توقف/حذف/انتهى.
      writeState({ licenseCheckedAt: Date.now(), licenseWatchError: String(error?.message || error || ''), licenseWatchMs: Date.now() - startedAt });
      return { ok: false, transient: true, error };
    } finally {
      licenseWatchInFlight = false;
    }
  }

  function startLicenseCloudWatch() {
    if (licenseWatchTimer || licenseLogoutTriggered) return;
    // فحص مباشر عند فتح أي صفحة، ثم كل 2.5 ثانية ما دامت الصفحة ظاهرة.
    setTimeout(() => checkLicenseCloudNow({ force: true }).catch(() => null), 0);
    licenseWatchTimer = setInterval(() => {
      if (!document.hidden) checkLicenseCloudNow().catch(() => null);
    }, 2500);
  }

  function pendingForKey(key) {
    return core.getSyncQueue().find(item => item.key === key) || null;
  }

  function completePendingForKey(key) {
    core.getSyncQueue()
      .filter(item => item.key === key)
      .forEach(item => core.completeSyncOperation(item.id));
  }

  /*
   * لا نعتبر الرفع ناجحاً محلياً إذا تغيّرت نفس المجموعة أثناء انتظار
   * استجابة الشبكة. في هذه الحالة تكون القاعدة السحابية قد استلمت النسخة التي بدأنا
   * بها فقط، بينما تبقى العملية الأحدث في الطابور للدفعة التالية. هذا يمنع
   * ضياع فرع/موظف/فاتورة أُضيفت أثناء مزامنة جارية.
   */
  function markUploaded(key, payload) {
    const currentRaw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
    const expectedRaw = payload.deleted ? null : payload.value;
    const currentMeta = localMetaFor(key);
    if (currentRaw !== expectedRaw || Number(currentMeta.updatedAt || 0) > Number(payload.updatedAt || 0)) {
      return false;
    }
    core.rawSet(core.metaKey(key), JSON.stringify({
      ...currentMeta,
      updatedAt: Number(payload.updatedAt || Date.now()),
      revision: Number(payload.revision || 1),
      deviceId: payload.deviceId || '',
      source: isPathProxy ? 'turso-http-rtdb' : 'legacy-rest',
      seeded: false,
      recordTombstones: payload.recordTombstones && typeof payload.recordTombstones === 'object' ? payload.recordTombstones : {}
    }));
    completePendingForKey(key);
    return true;
  }

  function hasNewRemoteTombstone(payload, localMeta) {
    const incoming = payload?.recordTombstones && typeof payload.recordTombstones === 'object'
      ? payload.recordTombstones : {};
    const existing = localMeta?.recordTombstones && typeof localMeta.recordTombstones === 'object'
      ? localMeta.recordTombstones : {};
    return Object.entries(incoming).some(([id, stamp]) => {
      if (!id || !stamp) return false;
      return Number(stamp || 0) > Number(existing[id] || 0);
    });
  }

  function canApplyRemote(key, payload, allowEqual = true) {
    if (pendingForKey(key)) return false;
    const localMeta = localMetaFor(key);
    // حذف سجل محدد يجب أن يتغلب على اختلاف ساعات الأجهزة. نعتمد على
    // tombstone جديد بدلاً من updatedAt فقط، وإلا قد يبقى السجل ظاهراً على
    // جهاز ساعته متقدمة ثم يعود عند فتح الصفحة.
    if (hasNewRemoteTombstone(payload, localMeta)) return true;
    const localTime = Number(localMeta.updatedAt || 0);
    if (localMeta.seeded === true || localTime <= 0) return true;
    const remoteTime = Number(payload.updatedAt || 0);
    return allowEqual ? remoteTime >= localTime : remoteTime > localTime;
  }

  function applyRemote(key, payload, options = {}) {
    if (options.force !== true && !canApplyRemote(key, payload, options.allowEqual !== false)) return false;
    // حتى مع force لا نكتب فوق تعديل محلي ما زال ينتظر الرفع.
    if (pendingForKey(key)) return false;
    const applied = core.applyRemoteDataset(key, payload.deleted ? null : payload.value, {
      updatedAt: Number(payload.updatedAt || Date.now()),
      revision: Number(payload.revision || 1),
      deviceId: payload.deviceId || null,
      source: isPathProxy ? 'turso-http-rtdb' : 'legacy-rest',
      seeded: false,
      recordTombstones: payload.recordTombstones && typeof payload.recordTombstones === 'object' ? payload.recordTombstones : {}
    });
    if (applied === false) return false;
    completePendingForKey(key);
    return true;
  }

  function companyMeta(location, extra = {}) {
    return {
      tenantId: canonicalCompanyId,
      companyId: canonicalCompanyId,
      companyKey: session.companyKey || '',
      companyName: session.companyName || '',
      appName: 'كاش توب 2',
      schema: 20,
      financialGroupId,
      datasetCount: CLOUD_DATA_KEYS.length,
      deviceId: core.rawGet('cashtop_device_id') || '',
      updatedAt: Date.now(),
      ...extra
    };
  }


  // R74: keep per-dataset change stamps inside the single compact meta row.
  // A visible page still reads only one meta row per live check, but when another
  // device changed data we fetch only datasets that belong to this page AND whose
  // stamp advanced. This keeps cross-device refresh near-live without scanning all
  // company datasets.
  function normalizeDatasetStamps(meta) {
    const source = meta?.datasetStamps && typeof meta.datasetStamps === 'object' ? meta.datasetStamps : {};
    const out = {};
    for (const key of CLOUD_DATA_KEYS) {
      const stamp = Number(source[remoteStampKey(key)] || 0);
      if (stamp > 0) out[key] = stamp;
    }
    return out;
  }

  function changedPriorityKeysFromMeta(meta, keys = pagePriorityDatasets(), usage = readUsageState()) {
    const requested = [...new Set((keys || []).filter(key => CLOUD_DATA_KEYS.includes(key)))];
    if (!requested.length) return [];
    // First R74 observation establishes a safe baseline once. Old/meta-less
    // writers fall back to the whole current page, never to all company data.
    if (Number(meta?.datasetStampSchema || 0) !== 1 || Number(usage.datasetStampSchemaSeen || 0) !== 1) return requested;
    const remote = normalizeDatasetStamps(meta);
    const observed = usage.datasetRemoteStamps && typeof usage.datasetRemoteStamps === 'object' ? usage.datasetRemoteStamps : {};
    return requested.filter(key => Number(remote[key] || 0) > Number(observed[key] || 0));
  }

  function markObservedDatasetStamps(keys, meta, options = {}) {
    const requested = [...new Set((keys || []).filter(key => CLOUD_DATA_KEYS.includes(key)))];
    const usage = readUsageState();
    const observed = { ...(usage.datasetRemoteStamps && typeof usage.datasetRemoteStamps === 'object' ? usage.datasetRemoteStamps : {}) };
    const remote = normalizeDatasetStamps(meta);
    for (const key of requested) {
      if (Number(remote[key] || 0) > Number(observed[key] || 0)) observed[key] = Number(remote[key]);
    }
    writeUsageState({
      datasetRemoteStamps: observed,
      datasetStampSchemaSeen: Number(meta?.datasetStampSchema || 0) === 1 && (options.adoptSchema === true || Number(usage.datasetStampSchemaSeen || 0) === 1)
        ? 1 : Number(usage.datasetStampSchemaSeen || 0)
    });
    return observed;
  }

  function metaWithUploadedDatasetStamps(remoteMeta, uploadedKeys) {
    const now = Date.now();
    const datasetStamps = {};
    const remoteStamps = normalizeDatasetStamps(remoteMeta);
    const changedKeys = [...new Set((uploadedKeys || []).filter(key => CLOUD_DATA_KEYS.includes(key)))];
    for (const key of changedKeys) {
      datasetStamps[remoteStampKey(key)] = Math.max(now, Number(localMetaFor(key)?.updatedAt || 0), Number(remoteStamps[key] || 0) + 1);
    }
    // Only changed keys are patched. Turso's atomic json_patch merges this nested
    // object with stamps written by other devices, preventing lost live updates.
    return { datasetStampSchema: 1, datasetStamps, changedKeys: changedKeys.slice(0, 32) };
  }


  async function pullDatasetKeys(keys, options = {}) {
    const ready = core.syncReady || core.localReady;
    if (ready && typeof ready.then === 'function') {
      try { await ready; } catch (_) {}
    }
    const requested = [...new Set((Array.isArray(keys) ? keys : []).filter(key => CLOUD_DATA_KEYS.includes(key)))];
    if (!requested.length) return { hasRemote: false, count: 0, applied: 0 };

    const showProgress = options.silentProgress !== true;
    if (showProgress) {
      reportPullStart(requested[0] || '', 0, requested.length);
      reportSyncProgress(0, requested.length, 'جاري فحص التغييرات المطلوبة فقط...');
    }

    const access = await cheapDatabaseAccess();
    const token = access.token;
    const location = access.location;
    if (!isPathProxy) startRealtimeStream(location, token);
    let applied = 0;
    let found = 0;
    let processed = 0;
    let newestDatasetTime = 0;
    const successfullyRead = [];
    const failedKeys = [];
    const convergenceKeys = [];
    const noteLosslessConvergence = (key, payload) => {
      if (!LOSSLESS_SYNC_KEYS.has(key) || pendingForKey(key)) return;
      const normalized = normalizeRemotePayload(payload);
      if (normalized.deleted) return;
      const localRaw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
      if (String(localRaw ?? '') === String(normalized.value ?? '')) return;
      core.enqueueSyncOperation(key, { source: 'lossless-pull-convergence' });
      if (!convergenceKeys.includes(key)) convergenceKeys.push(key);
    };

    try {
      if (isPathProxy && window.CashtopTursoBridge?.readMany) {
        const paths = requested.map(key => directBridgePath(location, `datasets/${sanitizeSegment(remoteDatasetKey(key))}`));
        const batch = await window.CashtopTursoBridge.readMany(paths, { cache: options.freshCache !== false ? false : true });
        for (let index = 0; index < requested.length; index += 1) {
          const key = requested[index];
          const raw = batch[paths[index]];
          processed += 1;
          successfullyRead.push(key);
          if (raw !== undefined && raw !== null) {
            found += 1;
            const payload = normalizeRemotePayload(raw);
            newestDatasetTime = Math.max(newestDatasetTime, Number(payload.updatedAt || 0));
            if (key === 'cashtop_company_access') {
              try { assertAccessIdentity(raw, location); } catch (error) { console.warn('[CASH TOP 2] access identity:', error); }
            }
            const localMeta = localMetaFor(key);
            const localTime = Number(localMeta.updatedAt || 0);
            const remoteTime = Number(payload.updatedAt || 0);
            const pending = Boolean(pendingForKey(key));
            const seeded = localMeta.seeded === true || localTime <= 0;
            if (options.force === true || seeded || (!pending && remoteTime > localTime)) {
              const didApply = applyRemote(key, payload, { force: options.force === true });
              if (didApply) { applied += 1; noteLosslessConvergence(key, payload); }
            }
          }
          if (showProgress) reportSyncProgress(processed, requested.length, `تحديث ${key}...`);
        }
      } else {
        const concurrency = Math.max(1, Math.min(8, Number(options.concurrency || 4)));
        for (let i = 0; i < requested.length; i += concurrency) {
          const chunk = requested.slice(i, i + concurrency);
          const results = await Promise.all(chunk.map(async key => {
            try { return { key, raw: await readDatasetLocation(location, key, token, { fresh: true }) }; }
            catch (error) { return { key, error }; }
          }));
          for (const result of results) {
            processed += 1;
            if (result.error) {
              failedKeys.push(result.key);
              console.warn('[CASH TOP 2] progressive dataset pull:', result.key, result.error);
              continue;
            }
            successfullyRead.push(result.key);
            if (result.raw != null) {
              found += 1;
              const payload = normalizeRemotePayload(result.raw);
              newestDatasetTime = Math.max(newestDatasetTime, Number(payload.updatedAt || 0));
              const localMeta = localMetaFor(result.key);
              const seeded = localMeta.seeded === true || Number(localMeta.updatedAt || 0) <= 0;
              if (options.force === true || seeded || (!pendingForKey(result.key) && Number(payload.updatedAt || 0) > Number(localMeta.updatedAt || 0))) {
                const didApply = applyRemote(result.key, payload, { force: options.force === true });
                if (didApply) { applied += 1; noteLosslessConvergence(result.key, payload); }
              }
            }
          }
        }
      }

      // One exact metadata read per actual pull batch. Navigation does not call
      // this unless the metadata probe reported a remote change.
      const meta = options.remoteMeta && typeof options.remoteMeta === 'object'
        ? options.remoteMeta
        : await readMetaLocation(location, token, { fresh: true }).catch(() => ({}));
      const remoteStamp = Math.max(Number(meta?.updatedAt || 0), newestDatasetTime);
      markObservedDatasetStamps(successfullyRead, meta, { adoptSchema: true });
      writeUsageState({
        lastRemoteUpdatedAt: remoteStamp,
        lastPriorityPullAt: Date.now(),
        lastMetaCheckAt: Date.now()
      });
      const fullDatasetPull = requested.length >= CLOUD_DATA_KEYS.length;
      if (fullDatasetPull && failedKeys.length === 0) {
        rawStorage.set(bootstrapKey, JSON.stringify({ at: Date.now(), remoteUpdatedAt: remoteStamp, full: true }));
        if (convergenceKeys.length === 0 && core.getSyncQueue().length === 0) {
          markLoginFullSyncComplete({ remoteUpdatedAt: remoteStamp, datasetCount: requested.length });
        }
      }
      writeState({
        initialLoaded: true,
        progressiveLoaded: true,
        loadedAt: Date.now(),
        lastRemoteUpdatedAt: remoteStamp,
        lastSuccessAt: Date.now(),
        lastError: '',
        authMode: isPathProxy ? 'turso-api' : (token ? 'anonymous' : 'database-rules'),
        remotePath: locationPath(location)
      });
      core.updateSyncBadge();
      if (applied > 0) window.dispatchEvent(new CustomEvent('cashtop:sync-complete', { detail: { processed: 0, pulled: applied, uploaded: 0, progressive: true, failed: failedKeys.length, failedKeys: [...failedKeys] } }));
      return {
        hasRemote: found > 0, count: found, applied, path: locationPath(location), progressive: true, remoteUpdatedAt: remoteStamp,
        requested: requested.length, successful: successfullyRead.length, failed: failedKeys.length, failedKeys: [...failedKeys],
        convergenceKeys: [...convergenceKeys], convergencePending: convergenceKeys.length,
        complete: failedKeys.length === 0 && convergenceKeys.length === 0
      };
    } finally {
      if (showProgress) {
        reportPullEnd(requested[requested.length - 1] || '', processed, requested.length);
        reportSyncProgress(processed, requested.length, failedKeys.length ? 'اكتمل الفحص مع بيانات تحتاج إعادة محاولة' : 'اكتمل فحص البيانات المطلوبة', {
          active: false, done: true, success: failedKeys.length === 0, failed: failedKeys.length, failedKeys: [...failedKeys]
        });
      }
    }
  }

  async function pullPriorityDatasets(options = {}) {
    return pullDatasetKeys(pagePriorityDatasets(), options);
  }

  function scheduleBackgroundFullPull(delay = 1400) {
    clearTimeout(backgroundPullTimer);
    backgroundPullTimer = setTimeout(async () => {
      if (backgroundPullRunning || core.getSyncQueue().length) return;
      backgroundPullRunning = true;
      try {
        const priority = new Set(pagePriorityDatasets());
        const remaining = CLOUD_DATA_KEYS.filter(key => !priority.has(key));
        const chunkSize = 5;
        for (let i = 0; i < remaining.length; i += chunkSize) {
          if (core.getSyncQueue().length) break;
          await pullDatasetKeys(remaining.slice(i, i + chunkSize), { concurrency: 6, silentProgress: true }).catch(error => console.warn('[CASH TOP 2] background dataset sync:', error));
          await new Promise(resolve => {
            if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 900 });
            else setTimeout(resolve, 80);
          });
        }
      } finally {
        backgroundPullRunning = false;
      }
    }, Math.max(0, Number(delay) || 0));
  }

  async function reconcileLegacyAll(options = {}) {
    if (syncing) return { processed: 0, pulled: 0, uploaded: 0, remaining: core.getSyncQueue().length, busy: true };

    syncing = true;
    writeState({ syncing: true, lastError: '', syncStartedAt: Date.now() });
    try {
      const forceProbe = options.forcePathProbe === true || options.forceCheck === true;
      let access = await openDatabaseAccess(forceProbe);
      let token = access.token;
      let resolved = access.resolved;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (attempt > 0) resolved = { location: resolved.location, read: await readLocation(resolved.location, token) };
        const remoteRead = resolved.read;
        const remoteCompany = remoteRead.data && typeof remoteRead.data === 'object' ? remoteRead.data : {};
        if (remoteStats(remoteCompany).hasData && !locationBelongsToCurrentCompany(resolved.location, remoteCompany)) {
          throw new Error('تم منع مزامنة عقدة لا تخص المفتاح الحالي. لا توجد أي بيانات مشتركة بين الشركات.');
        }
        const remoteDatasets = remoteCompany.datasets && typeof remoteCompany.datasets === 'object'
          ? remoteCompany.datasets
          : {};

        const nextDatasets = { ...remoteDatasets };
        const pulls = [];
        const uploads = [];
        const queue = core.getSyncQueue();

        for (const key of CLOUD_DATA_KEYS) {
          const hasRemote = Object.prototype.hasOwnProperty.call(remoteDatasets, key);
          const remote = hasRemote ? normalizeRemotePayload(remoteDatasets[key]) : null;
          const localMeta = localMetaFor(key);
          const localTime = Number(localMeta.updatedAt || 0);
          const remoteTime = Number(remote?.updatedAt || 0);
          const pending = queue.some(item => item.key === key);
          const seeded = localMeta.seeded === true || localTime <= 0;

          /* فتح/قفل استيراد النسخ وخطة الشركة لا يوقفان المزامنة ولا تضيع قيمهما عند وجود تعديل محلي معلّق. */
          if (key === 'cashtop_company_access' && remote && pending) {
            mergeAdminControlledAccess(remoteDatasets[key]);
          }

          if (remote && (seeded || (!pending && remoteTime > localTime))) {
            pulls.push({ key, payload: remote });
            continue;
          }

          /* لا نرفع عشرات المجموعات الفارغة المزروعة تلقائياً عند إنشاء مفتاح جديد. */
          if (!remote && seeded && !pending) continue;

          if (!remote || pending || localTime > remoteTime) {
            const payload = makeLocalPayload(key, remote?.revision || 0);
            uploads.push({ key, payload });
            nextDatasets[key] = payload;
          }
        }

        if (uploads.length === 0) {
          const appliedPulls = pulls.reduce((count, item) => count + (applyRemote(item.key, item.payload) ? 1 : 0), 0);
          writeState({
            syncing: false,
            initialLoaded: true,
            lastRemoteUpdatedAt: Number(remoteCompany.meta?.updatedAt || 0),
            loadedAt: Date.now(),
            lastSuccessAt: Date.now(),
            lastError: '',
            authMode: isPathProxy ? 'turso-api' : (token ? 'anonymous' : 'database-rules'),
            remotePath: locationPath(resolved.location)
          });
          core.updateSyncBadge();
          return {
            processed: 0,
            pulled: appliedPulls,
            uploaded: 0,
            remaining: core.getSyncQueue().length,
            projectId: cfg.projectId,
            path: locationPath(resolved.location),
            authMode: isPathProxy ? 'turso-api' : (token ? 'anonymous' : 'database-rules')
          };
        }

        const nextCompany = {
          ...remoteCompany,
          datasets: nextDatasets,
          meta: {
            ...(remoteCompany.meta || {}),
            ...companyMeta(resolved.location, {
              reconciledAt: Date.now(),
              lastSyncedBy: core.rawGet('cashtop_device_id') || ''
            })
          }
        };

        let written;
        try {
          written = await writeLocation(resolved.location, token, nextCompany, remoteRead.etag);
        } catch (error) {
          if (!token && isPermissionError(error)) {
            token = await requireDatabaseToken();
            selectedLocation = resolved.location;
            resolved = { location: resolved.location, read: await readLocation(resolved.location, token) };
            continue;
          }
          throw error;
        }
        if (written.conflict) continue;

        const appliedPulls = pulls.reduce((count, item) => count + (applyRemote(item.key, item.payload) ? 1 : 0), 0);
        const completedUploads = uploads.reduce((count, item) => count + (markUploaded(item.key, item.payload) ? 1 : 0), 0);

        writeState({
          syncing: false,
          initialLoaded: true,
          lastRemoteUpdatedAt: Number(nextCompany.meta.updatedAt || Date.now()),
          loadedAt: Date.now(),
          lastSuccessAt: Date.now(),
          lastError: '',
          authMode: isPathProxy ? 'turso-api' : (token ? 'anonymous' : 'database-rules'),
          remotePath: locationPath(resolved.location)
        });
        core.updateSyncBadge();
        window.dispatchEvent(new CustomEvent('cashtop:sync-complete', {
          detail: { processed: completedUploads, pulled: appliedPulls, uploaded: completedUploads }
        }));
        return {
          processed: completedUploads,
          pulled: appliedPulls,
          uploaded: completedUploads,
          remaining: core.getSyncQueue().length,
          projectId: cfg.projectId,
          path: locationPath(resolved.location),
          authMode: isPathProxy ? 'turso-api' : (token ? 'anonymous' : 'database-rules')
        };
      }

      throw new Error('حدث تعارض متكرر أثناء المزامنة. أعد المحاولة بعد لحظات.');
    } catch (error) {
      const message = errorMessage(error);
      writeState({ syncing: false, lastError: message, errorAt: Date.now() });
      console.error('[CASH TOP 2] Database API sync:', error);
      throw new Error(message);
    } finally {
      syncing = false;
      core.updateSyncBadge();
    }
  }

  function payloadJsonValue(payload) {
    const normalized = normalizeRemotePayload(payload);
    if (normalized.deleted) return null;
    let value = normalized.value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) { return value; }
    }
    return value;
  }

  function stableRecordId(item) {
    return core.recordIdentity ? core.recordIdentity(item) : '';
  }

  function syncRecordIdentity(record, index = 0) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return `anon:${index}:${JSON.stringify(record)}`;
    for (const field of ['id','_id','uuid','invoiceId','refId','refNumber','reference','number','code','key','barcode']) {
      const value = record[field];
      if (value !== undefined && value !== null && String(value).trim()) return `${field}:${String(value).trim()}`;
    }
    if (record.accountId != null && (record.sourceId != null || record.refId != null)) return `fund:${String(record.accountId)}:${String(record.sourceType || record.refType || '')}:${String(record.sourceId || record.refId || '')}:${String(record.type || '')}`;
    if (record.accountId != null && (record.date || record.timestamp) && record.amount != null) return `fundlog:${String(record.accountId)}:${String(record.date || record.timestamp)}:${String(record.type || '')}:${String(record.amount)}`;
    return `anon:${index}:${JSON.stringify(record)}`;
  }

  function mergeArrayUnion(localValue, remoteValue) {
    const merged = new Map();
    (Array.isArray(remoteValue) ? remoteValue : []).forEach((item,index)=>merged.set(syncRecordIdentity(item,index), item));
    (Array.isArray(localValue) ? localValue : []).forEach((item,index)=>{
      const id=syncRecordIdentity(item,index);
      const previous=merged.get(id);
      merged.set(id, previous && typeof previous==='object' && typeof item==='object' ? { ...previous, ...item } : item);
    });
    return [...merged.values()];
  }

  function mergeLosslessObjectPending(key, localValue, remoteValue) {
    if (key !== 'cashtop_funds_db') return localValue;
    const local = localValue && typeof localValue === 'object' && !Array.isArray(localValue) ? localValue : {};
    const remote = remoteValue && typeof remoteValue === 'object' && !Array.isArray(remoteValue) ? remoteValue : {};
    return {
      ...remote,
      ...local,
      accounts: mergeArrayUnion(local.accounts || [], remote.accounts || []),
      accountLogs: mergeArrayUnion(local.accountLogs || [], remote.accountLogs || [])
    };
  }

  function mergeArrayByDelta(localValue, remoteValue, touchedIds = [], deletedIds = []) {
    const touched = new Set(touchedIds || []);
    const deleted = new Set(deletedIds || []);
    const localMap = new Map(localValue.map(item => [stableRecordId(item), item]).filter(([id]) => id));
    const merged = [];
    const seen = new Set();
    for (const remoteItem of remoteValue) {
      const id = stableRecordId(remoteItem);
      if (id && deleted.has(id)) continue;
      if (id && touched.has(id) && localMap.has(id)) {
        merged.push(localMap.get(id));
        seen.add(id);
      } else {
        merged.push(remoteItem);
        if (id) seen.add(id);
      }
    }
    for (const localItem of localValue) {
      const id = stableRecordId(localItem);
      if (!id) {
        if (!merged.some(item => JSON.stringify(item) === JSON.stringify(localItem))) merged.push(localItem);
        continue;
      }
      if (deleted.has(id) || seen.has(id)) continue;
      if (touched.has(id) || !remoteValue.some(item => stableRecordId(item) === id)) merged.push(localItem);
      seen.add(id);
    }
    return merged;
  }

  function arrayDeltaPresent(remoteValue, desiredValue, touchedIds = [], deletedIds = []) {
    const remoteMap = new Map(remoteValue.map(item => [stableRecordId(item), item]).filter(([id]) => id));
    const desiredMap = new Map(desiredValue.map(item => [stableRecordId(item), item]).filter(([id]) => id));
    for (const id of touchedIds || []) {
      if (!remoteMap.has(id) || JSON.stringify(remoteMap.get(id)) !== JSON.stringify(desiredMap.get(id))) return false;
    }
    for (const id of deletedIds || []) if (remoteMap.has(id)) return false;
    return true;
  }

  function mergePendingPayload(key, localPayload, remotePayload, pending) {
    if (pending?.forceReplace === true && !LOSSLESS_SYNC_KEYS.has(key)) return localPayload;
    if (!remotePayload || pending?.deletedDataset === true) return localPayload;
    const localValue = payloadJsonValue(localPayload);
    const remoteValue = payloadJsonValue(remotePayload);
    const forceLosslessMerge = pending?.forceReplace === true && LOSSLESS_SYNC_KEYS.has(key);

    if (!forceLosslessMerge && Array.isArray(localValue) && Array.isArray(remoteValue) &&
        ((pending?.touchedIds?.length || 0) + (pending?.deletedIds?.length || 0) > 0)) {
      const merged = mergeArrayByDelta(localValue, remoteValue, pending.touchedIds || [], pending.deletedIds || []);
      return { ...localPayload, value: JSON.stringify(merged), deleted: false };
    }

    if (!forceLosslessMerge && localValue && remoteValue && typeof localValue === 'object' && typeof remoteValue === 'object' &&
        !Array.isArray(localValue) && !Array.isArray(remoteValue) &&
        ((pending?.touchedFields?.length || 0) + (pending?.deletedFields?.length || 0) > 0)) {
      const merged = { ...remoteValue };
      for (const field of pending.touchedFields || []) {
        if (!Object.prototype.hasOwnProperty.call(localValue, field)) continue;
        const nested = pending.nestedArrayChanges?.[field];
        if (nested && Array.isArray(localValue[field]) && Array.isArray(remoteValue[field])) {
          merged[field] = mergeArrayByDelta(localValue[field], remoteValue[field], nested.touchedIds || [], nested.deletedIds || []);
        } else {
          merged[field] = localValue[field];
        }
      }
      for (const field of pending.deletedFields || []) delete merged[field];
      return { ...localPayload, value: JSON.stringify(merged), deleted: false };
    }

    if (LOSSLESS_OBJECT_KEYS.has(key) && localValue && remoteValue && typeof localValue === 'object' && typeof remoteValue === 'object' && !Array.isArray(localValue) && !Array.isArray(remoteValue)) {
      if (pending?.nestedArrayChanges && typeof pending.nestedArrayChanges === 'object') {
        const merged = { ...remoteValue, ...localValue };
        for (const field of ['accounts','accountLogs']) {
          const nested = pending.nestedArrayChanges[field];
          if (!nested || !Array.isArray(localValue[field]) || !Array.isArray(remoteValue[field])) continue;
          merged[field] = mergeArrayByDelta(localValue[field], remoteValue[field], nested.touchedIds || [], nested.deletedIds || []);
        }
        return { ...localPayload, value: JSON.stringify(merged), deleted: false };
      }
      return { ...localPayload, value: JSON.stringify(mergeLosslessObjectPending(key, localValue, remoteValue)), deleted: false };
    }

    if (LOSSLESS_SYNC_KEYS.has(key) && Array.isArray(localValue) && Array.isArray(remoteValue)) {
      const merged = new Map();
      const identity = (record, index = 0) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return `anon:${index}:${JSON.stringify(record)}`;
        for (const field of ['id','_id','uuid','invoiceId','refId','refNumber','reference','number','code','key','barcode']) {
          const value = record[field];
          if (value !== undefined && value !== null && String(value).trim()) return `${field}:${String(value).trim()}`;
        }
        return `anon:${index}:${JSON.stringify(record)}`;
      };
      remoteValue.forEach((record,index)=>merged.set(identity(record,index),record));
      localValue.forEach((record,index)=>{
        const id=identity(record,index);
        const prev=merged.get(id);
        merged.set(id, prev && typeof prev==='object' && typeof record==='object' ? { ...prev, ...record } : record);
      });
      const tombstones = {
        ...(remotePayload.recordTombstones && typeof remotePayload.recordTombstones === 'object' ? remotePayload.recordTombstones : {}),
        ...(localPayload.recordTombstones && typeof localPayload.recordTombstones === 'object' ? localPayload.recordTombstones : {})
      };
      Object.entries(tombstones).forEach(([id, stamp])=>{ if(id && stamp) merged.delete(id); });
      return { ...localPayload, value: JSON.stringify([...merged.values()]), deleted: false, recordTombstones: tombstones };
    }

    return localPayload;
  }

  function pendingChangesPresent(remotePayload, desiredPayload, pending) {
    if (!remotePayload) return false;
    const remote = normalizeRemotePayload(remotePayload);
    if (pending?.deletedDataset === true) return remote.deleted === true || remote.value == null;
    if (pending?.forceReplace === true) {
      return remote.deleted === desiredPayload.deleted && String(remote.value ?? '') === String(desiredPayload.value ?? '');
    }
    const remoteValue = payloadJsonValue(remote);
    const desiredValue = payloadJsonValue(desiredPayload);

    if (Array.isArray(remoteValue) && Array.isArray(desiredValue) &&
        ((pending?.touchedIds?.length || 0) + (pending?.deletedIds?.length || 0) > 0)) {
      return arrayDeltaPresent(remoteValue, desiredValue, pending.touchedIds || [], pending.deletedIds || []);
    }

    if (remoteValue && desiredValue && typeof remoteValue === 'object' && typeof desiredValue === 'object' &&
        !Array.isArray(remoteValue) && !Array.isArray(desiredValue) &&
        ((pending?.touchedFields?.length || 0) + (pending?.deletedFields?.length || 0) > 0)) {
      for (const field of pending.touchedFields || []) {
        const nested = pending.nestedArrayChanges?.[field];
        if (nested && Array.isArray(remoteValue[field]) && Array.isArray(desiredValue[field])) {
          if (!arrayDeltaPresent(remoteValue[field], desiredValue[field], nested.touchedIds || [], nested.deletedIds || [])) return false;
        } else if (JSON.stringify(remoteValue[field]) !== JSON.stringify(desiredValue[field])) {
          return false;
        }
      }
      for (const field of pending.deletedFields || []) if (Object.prototype.hasOwnProperty.call(remoteValue, field)) return false;
      return true;
    }

    return remote.deleted === desiredPayload.deleted && String(remote.value ?? '') === String(desiredPayload.value ?? '');
  }

  function applyMergedPayloadLocally(key, payload) {
    if (payload.deleted) return;
    const currentRaw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
    if (String(currentRaw ?? '') === String(payload.value ?? '')) return;
    core.rawSet(core.namespaceKey(key), String(payload.value ?? ''));
    core.rawSet(core.metaKey(key), JSON.stringify({
      ...localMetaFor(key),
      updatedAt: Number(payload.updatedAt || Date.now()),
      revision: Number(payload.revision || 1),
      deviceId: payload.deviceId || core.rawGet('cashtop_device_id') || '',
      source: isPathProxy ? 'turso-http-rtdb' : 'legacy-rest',
      seeded: false,
      recordTombstones: payload.recordTombstones && typeof payload.recordTombstones === 'object' ? payload.recordTombstones : (localMetaFor(key).recordTombstones || {})
    }));
    window.dispatchEvent(new CustomEvent('cashtop:remote-applied', { detail: { key, merged: true } }));
  }

  async function reconcileTursoAll(options = {}) {
    if (syncing) return { processed: 0, pulled: 0, uploaded: 0, remaining: core.getSyncQueue().length, busy: true };

    syncing = true;
    writeState({ syncing: true, lastError: '', syncStartedAt: Date.now(), authMode: 'turso-api' });
    try {
      const access = await openLightDatabaseAccess();
      const token = access.token;
      const location = access.location;
      const pendingKeys = core.getSyncQueue().map(item => item.key).filter(key => CLOUD_DATA_KEYS.includes(key));
      // Even a manual sync stays page-scoped. A full company pull is reserved
      // for the explicit pullAll()/maintenance path so one button press cannot
      // accidentally read every dataset in Turso.
      const pullKeys = pagePriorityDatasets();
      const keys = [...new Set([...pendingKeys, ...pullKeys])];
      let uploaded = 0;
      let pulled = 0;

      for (const key of keys) {
        let pending = core.getSyncQueue().find(item => item.key === key) || null;
        let remoteRaw;
        try {
          remoteRaw = await readDatasetLocation(location, key, token);
        } catch (error) {
          console.warn('[CASH TOP 2] Turso dataset read:', key, error);
          if (pending) throw error;
          continue;
        }
        let remote = remoteRaw == null ? null : normalizeRemotePayload(remoteRaw);

        if (pending) {
          let committed = false;
          let desired = null;
          let sourceLocalPayload = null;
          for (let attempt = 0; attempt < 4 && !committed; attempt += 1) {
            pending = core.getSyncQueue().find(item => item.key === key) || pending;
            const localPayload = makeLocalPayload(key, remote?.revision || 0);
            sourceLocalPayload = localPayload;
            desired = mergePendingPayload(key, localPayload, remote, pending);
            await writeDatasetLocation(location, key, token, desired);
            const verifiedRaw = await readDatasetLocation(location, key, token);
            committed = pendingChangesPresent(verifiedRaw, desired, pending);
            remote = normalizeRemotePayload(verifiedRaw);
            if (!committed) await new Promise(resolve => setTimeout(resolve, 40 * (attempt + 1)));
          }
          if (!committed || !desired || !sourceLocalPayload) throw new Error(`تعذر تثبيت تعديلات ${key} بسبب تعارض مزامنة متكرر.`);

          // إذا تغيرت نفس المجموعة محلياً أثناء انتظار الشبكة فلا نكتب النسخة الأقدم
          // فوق التعديل الجديد. تبقى العملية في الطابور وتدخل دورة المزامنة التالية.
          const currentRaw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
          const currentMeta = localMetaFor(key);
          const localUnchanged = currentRaw === (sourceLocalPayload.deleted ? null : sourceLocalPayload.value) &&
            Number(currentMeta.updatedAt || 0) <= Number(sourceLocalPayload.updatedAt || 0);
          if (localUnchanged) {
            applyMergedPayloadLocally(key, desired);
            if (markUploaded(key, desired)) uploaded += 1;
          }
          continue;
        }

        if (!remote) {
          const meta = localMetaFor(key);
          if (meta.seeded !== true && Number(meta.updatedAt || 0) > 0) {
            const payload = makeLocalPayload(key, 0);
            await writeDatasetLocation(location, key, token, payload);
            if (markUploaded(key, payload)) uploaded += 1;
          }
          continue;
        }

        const localMeta = localMetaFor(key);
        const localTime = Number(localMeta.updatedAt || 0);
        const remoteTime = Number(remote.updatedAt || 0);
        const seeded = localMeta.seeded === true || localTime <= 0;
        if ((options.force === true || seeded || remoteTime > localTime) && applyRemote(key, remote, { force: options.force === true })) {
          pulled += 1;
        } else if (!seeded && localTime > remoteTime) {
          const payload = makeLocalPayload(key, remote.revision || 0);
          await writeDatasetLocation(location, key, token, payload);
          if (markUploaded(key, payload)) uploaded += 1;
        }
      }

      await writeMetaLocation(location, token, companyMeta(location, {
        reconciledAt: Date.now(),
        lastSyncedBy: core.rawGet('cashtop_device_id') || ''
      })).catch(error => console.warn('[CASH TOP 2] Turso meta sync:', error));

      writeState({
        syncing: false,
        initialLoaded: true,
        loadedAt: Date.now(),
        lastSuccessAt: Date.now(),
        lastError: '',
        authMode: 'turso-api',
        remotePath: locationPath(location)
      });
      core.updateSyncBadge();
      window.dispatchEvent(new CustomEvent('cashtop:sync-complete', {
        detail: { processed: uploaded, pulled, uploaded, turso: true }
      }));
      return {
        processed: uploaded,
        pulled,
        uploaded,
        remaining: core.getSyncQueue().length,
        projectId: cfg.projectId,
        path: locationPath(location),
        authMode: 'turso-api'
      };
    } catch (error) {
      const message = errorMessage(error);
      writeState({ syncing: false, lastError: message, errorAt: Date.now() });
      console.error('[CASH TOP 2] Turso bridge sync:', error);
      throw new Error(message);
    } finally {
      syncing = false;
      core.updateSyncBadge();
    }
  }

  /*
   * المزامنة المتينة تعمل على مستوى كل dataset بصورة مستقلة. فشل مجموعة واحدة
   * (مثلاً موظفين أو مخزون) لا يوقف بقية الطابور؛ كل مجموعة تنجح تُحذف فوراً
   * من عداد العمليات المعلقة، بينما تبقى المجموعات المتعثرة للمحاولة التالية.
   */
  async function reconcileDatasetsIndependently(options = {}) {
    if (core.localReady && typeof core.localReady.then === 'function') {
      try { await core.localReady; } catch (_) {}
    }
    if (options.forceRetry === true) datasetRetryState.clear();
    if (syncing) return { processed: 0, pulled: 0, uploaded: 0, failed: 0, remaining: core.getSyncQueue().length, busy: true };

    syncing = true;
    writeState({ syncing: true, lastError: '', lastDeferredError: '', syncStartedAt: Date.now() });
    let location = null;
    let token = '';
    let uploaded = 0;
    let pulled = 0;
    const uploadedKeys = [];
    const failedKeys = [];
    const errorSummaries = [];

    try {
      const access = await cheapDatabaseAccess();
      token = access.token;
      location = access.location;
      if (!isPathProxy) startRealtimeStream(location, token);

      const manual = options.manual === true || options.forceRetry === true;
      const pendingKeys = [...new Set(core.getSyncQueue().map(item => item.key).filter(key => CLOUD_DATA_KEYS.includes(key)))];
      if (!pendingKeys.length) return { processed: 0, pulled: 0, uploaded: 0, failed: 0, remaining: 0 };

      // فحص metadata واحد يحدد إن كانت هناك مجموعات أخرى تغيّرت على السحابة.
      // أما كل dataset عليه تعديل محلي فسيُقرأ بنفسه قبل الكتابة دائماً أدناه.
      const usageBefore = readUsageState();
      let remoteMeta = {};
      try { remoteMeta = await readMetaLocation(location, token, { fresh: true }); } catch (_) { remoteMeta = {}; }
      const remoteStampBefore = Number(remoteMeta?.updatedAt || 0);
      const knownRemoteStamp = Math.max(
        Number(usageBefore.lastRemoteUpdatedAt || 0),
        Number(readState().lastRemoteUpdatedAt || 0)
      );
      const remoteChanged = remoteStampBefore > 0 && knownRemoteStamp > 0 && remoteStampBefore > knownRemoteStamp;

      let pendingProgress = 0;
      reportSyncProgress(0, pendingKeys.length, options.importSync === true ? 'جاري رفع النسخة الاحتياطية...' : 'جاري رفع التعديلات المجمعة...');

      for (const key of pendingKeys) {
        if (!canRetryDatasetNow(key, manual)) {
          failedKeys.push(key);
          pendingProgress += 1;
          reportSyncProgress(pendingProgress, pendingKeys.length, `تأجيل ${key} مؤقتاً...`);
          continue;
        }

        try {
          const pending = pendingForKey(key);
          if (!pending) continue;

          // R108: كل dataset عليه تعديل محلي يقرأ نسخته السحابية أولاً ثم يدمجها
          // قبل الكتابة. هذه القراءة تخص المجموعات المتغيرة فقط، وليست سحباً كاملاً،
          // وتمنع جهازاً كان Offline من الكتابة فوق تعديلات المدير/الموظف أو جهاز آخر.
          const remoteRaw = await readDatasetLocation(location, key, token, { fresh: true });
          const remote = remoteRaw == null ? null : normalizeRemotePayload(remoteRaw);
          if (key === 'cashtop_company_access' && remoteRaw != null) mergeAdminControlledAccess(remoteRaw);

          const sourceLocalPayload = makeLocalPayload(key, remote?.revision || 0);
          const desired = mergePendingPayload(key, sourceLocalPayload, remote, pending);
          await writeDatasetLocation(location, key, token, desired);

          // الحذف لا يُعتبر ناجحاً بمجرد انتهاء طلب الكتابة. نتحقق من النسخة
          // الفعلية الموجودة في السحابة، وبالأخص tombstones، ثم نعيد المحاولة
          // بسرعة عند وجود قراءة قديمة أو تعارض من جهاز آخر. هذا يمنع رجوع
          // السجل بعد فتح صفحة أخرى. التحقق الإضافي يقتصر على العمليات التي
          // تحتوي حذفاً حتى لا نزيد قراءات المزامنة العادية.
          const hasDeletion = pending.deletedDataset === true ||
            (pending.deletedIds?.length || 0) > 0 ||
            (pending.deletedFields?.length || 0) > 0 ||
            Object.values(pending.nestedArrayChanges || {}).some(delta => (delta?.deletedIds?.length || 0) > 0);
          if (hasDeletion) {
            let verified = false;
            let latestRemote = desired;
            for (let verifyAttempt = 0; verifyAttempt < 3 && !verified; verifyAttempt += 1) {
              const verifiedRaw = await readDatasetLocation(location, key, token, { fresh: true });
              const verifiedPayload = verifiedRaw == null ? null : normalizeRemotePayload(verifiedRaw);
              latestRemote = verifiedPayload || desired;
              verified = pendingChangesPresent(verifiedRaw, desired, pending);
              if (!verified) {
                await writeDatasetLocation(location, key, token, desired);
                if (verifyAttempt < 2) await new Promise(resolve => setTimeout(resolve, 35 * (verifyAttempt + 1)));
              }
            }
            if (!verified) throw new Error(`تعذر تثبيت حذف ${key} على السحابة بعد عدة محاولات.`);
          }

          const currentRaw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
          const currentMeta = localMetaFor(key);
          const localUnchanged = currentRaw === (sourceLocalPayload.deleted ? null : sourceLocalPayload.value) &&
            Number(currentMeta.updatedAt || 0) <= Number(sourceLocalPayload.updatedAt || 0);
          if (localUnchanged) {
            if (!desired.deleted) applyMergedPayloadLocally(key, desired);
            if (markUploaded(key, desired)) { uploaded += 1; uploadedKeys.push(key); }
          }
          clearDatasetFailure(key);
        } catch (error) {
          noteDatasetFailure(key, error);
          failedKeys.push(key);
          errorSummaries.push({ key, message: safeSyncMessage(error) });
          console.warn('[CASH TOP 2] deferred dataset sync:', key, error);
        } finally {
          pendingProgress += 1;
          reportSyncProgress(pendingProgress, Math.max(1, pendingKeys.length), `مزامنة ${key}...`);
        }
      }

      // Pull only if another device actually changed the cloud, or when the user
      // explicitly asks for a full refresh. A local save never triggers a full
      // page pull anymore.
      if ((remoteChanged && options.importSync !== true) || options.forceCheck === true || options.manualPull === true) {
        try {
          const candidateKeys = CLOUD_DATA_KEYS;
          const pullKeys = (options.forceCheck === true
            ? candidateKeys
            : changedPriorityKeysFromMeta(remoteMeta, candidateKeys))
            .filter(key => !uploadedKeys.includes(key));
          if (pullKeys.length) {
            const pullResult = await pullDatasetKeys(pullKeys, { force: false, concurrency: 4, silentProgress: options.manual !== true, remoteMeta });
            pulled = Number(pullResult?.applied || 0);
          }
        } catch (error) {
          errorSummaries.push({ key: '__pull__', message: safeSyncMessage(error) });
        }
      }

      let remoteStampAfter = remoteStampBefore;
      if (uploaded > 0) {
        try {
          const stampPatch = metaWithUploadedDatasetStamps(remoteMeta, uploadedKeys);
          const metaWritten = await writeMetaLocation(location, token, companyMeta(location, {
            ...stampPatch,
            reconciledAt: Date.now(),
            lastSyncedBy: core.rawGet('cashtop_device_id') || ''
          }));
          remoteStampAfter = Number(metaWritten?.updatedAt || Date.now());
          markObservedDatasetStamps(uploadedKeys, metaWritten);
        } catch (error) {
          console.warn('[CASH TOP 2] metadata sync deferred:', error);
        }
      }

      const now = Date.now();
      writeUsageState({
        lastRemoteUpdatedAt: Math.max(remoteStampAfter, Number(readUsageState().lastRemoteUpdatedAt || 0)),
        lastMetaCheckAt: now,
        lastUploadAt: uploaded ? now : Number(readUsageState().lastUploadAt || 0)
      });

      const remaining = core.getSyncQueue().length;
      const deferredMessage = errorSummaries[0]?.message || '';
      writeState({
        syncing: false,
        initialLoaded: true,
        loadedAt: now,
        lastRemoteUpdatedAt: Math.max(remoteStampAfter, Number(readState().lastRemoteUpdatedAt || 0)),
        lastSuccessAt: uploaded > 0 || pulled > 0 || failedKeys.length === 0 ? now : readState().lastSuccessAt,
        lastError: '',
        lastDeferredError: deferredMessage,
        deferredAt: failedKeys.length ? now : 0,
        authMode: isPathProxy ? 'turso-api' : (token ? 'anonymous' : 'database-rules'),
        remotePath: locationPath(location)
      });
      core.updateSyncBadge();
      window.dispatchEvent(new CustomEvent('cashtop:sync-complete', {
        detail: { processed: uploaded, pulled, uploaded, failed: failedKeys.length, remaining, partial: failedKeys.length > 0, lowUsage: true }
      }));
      // After a successful local upload, make one delayed metadata revision check.
      // It detects changes from other devices across ALL datasets, but does not
      // force-download every dataset after each invoice save.
      if (uploaded > 0 && remaining === 0) {
        setTimeout(() => {
          if (document.hidden || core.getSyncQueue().length) return;
          checkRemoteAndPull(false).catch(() => null);
        }, 1800);
      }
      return {
        processed: uploaded,
        pulled,
        uploaded,
        failed: failedKeys.length,
        failedKeys,
        errors: errorSummaries,
        remaining,
        partial: failedKeys.length > 0,
        deferred: failedKeys.length > 0,
        projectId: cfg.projectId,
        path: locationPath(location),
        authMode: isPathProxy ? 'turso-api' : (token ? 'anonymous' : 'database-rules'),
        lowUsage: true
      };
    } catch (error) {
      const message = safeSyncMessage(error);
      writeState({ syncing: false, lastError: isTransientNetworkError(error) ? '' : message, lastDeferredError: message, errorAt: Date.now() });
      console.warn('[CASH TOP 2] database access deferred:', error);
      if (isTransientNetworkError(error)) {
        return { processed: uploaded, pulled, uploaded, failed: core.getSyncQueue().length, remaining: core.getSyncQueue().length, deferred: true, networkDeferred: true, message };
      }
      throw new Error(message);
    } finally {
      syncing = false;
      core.updateSyncBadge();
      reportSyncProgress(1, 1, core.getSyncQueue().length ? 'بقيت عمليات معلقة وستُعاد تلقائياً' : 'اكتملت المزامنة', {
        active: false, done: true, success: core.getSyncQueue().length === 0
      });
    }
  }

  async function reconcileAll(options = {}) {
    return reconcileDatasetsIndependently(options);
  }

  async function pullAll(options = {}) {
    return pullDatasetKeys(CLOUD_DATA_KEYS, {
      force: options.force === true,
      concurrency: options.concurrency || 4,
      remoteMeta: options.remoteMeta
    });
  }

  function syncAll(options = {}) {
    const run = async () => {
      const ready = core.syncReady || core.localReady;
      if (ready && typeof ready.then === 'function') {
        try { await ready; } catch (_) {}
      }
      // Before any network attempt, pin the current queue and changed datasets in
      // IndexedDB. A failed request/reload therefore cannot make a saved invoice
      // disappear or lose its pending synchronization marker.
      if (core.getSyncQueue().length) {
        try { await core.preservePendingSyncState?.(); } catch (_) {}
      }
      if (core.getSyncQueue().length) return reconcileAll(options);
      if (options.manual === true || options.forceCheck === true) {
        // الفحص اليدوي/الإجباري يزامن كل بيانات الشركة، لا بيانات الصفحة فقط.
        // هذا مهم للأجهزة الجديدة أو جهاز ظل مغلقاً فترة طويلة.
        return pullAll({ force: true, concurrency: 6 });
      }
      return checkRemoteAndPull(false);
    };
    syncSerial = syncSerial.catch(() => null).then(run);
    return syncSerial;
  }

  async function flushPendingQueue() {
    const result = await syncAll({ forceRetry: true });
    return { processed: result.uploaded || 0, remaining: result.remaining || 0, pulled: result.pulled || 0 };
  }

  async function checkRemoteAndPull(force = false) {
    const ready = core.syncReady || core.localReady;
    if (ready && typeof ready.then === 'function') {
      try { await ready; } catch (_) {}
    }
    // Never pull over a local write that has not completed queue restoration.
    if (core.getSyncQueue().length) return syncAll({ manual:false, forceCheck:false });
    if (navigator.onLine === false && force !== true) return { skipped: true, offline: true };

    const now = Date.now();
    const usage = readUsageState();
    const pageKey = String(core.FILE || 'app');
    const pageChecks = usage.pageChecks && typeof usage.pageChecks === 'object' ? usage.pageChecks : {};
    const pageRemoteStamps = usage.pageRemoteStamps && typeof usage.pageRemoteStamps === 'object' ? usage.pageRemoteStamps : {};
    const minGap = force ? 0 : NAV_REMOTE_CHECK_MS;
    const lastPageCheck = Number(pageChecks[pageKey] || 0);

    if (!force && now - lastPageCheck < minGap) {
      return { skipped: true, cached: true, remainingMs: minGap - (now - lastPageCheck) };
    }

    const access = await cheapDatabaseAccess();
    // Exactly one compact metadata row is read per live check. Payload rows are
    // fetched only if this page has not seen the newest company revision.
    const meta = await readMetaLocation(access.location, access.token, { fresh: true }).catch(() => ({}));
    const remoteStamp = Number(meta?.updatedAt || 0);
    writeUsageState({
      lastMetaCheckAt: now,
      pageChecks: { ...pageChecks, [pageKey]: now }
    });

    const bootstrapped = Boolean(rawStorage.get(bootstrapKey));
    if (!bootstrapped && !hasSubstantialLocalCache()) {
      // جهاز جديد: اسحب كل datasets مرة واحدة حتى لا يبدأ بجزء من بيانات الشركة.
      const result = await pullAll({ concurrency: 6, remoteMeta: meta });
      const nextUsage = readUsageState();
      writeUsageState({
        pageRemoteStamps: {
          ...(nextUsage.pageRemoteStamps || {}),
          [pageKey]: Math.max(remoteStamp, Number(result?.remoteUpdatedAt || 0))
        },
        lastFullPullAt: Date.now()
      });
      rawStorage.set(bootstrapKey, JSON.stringify({ at: Date.now(), full: true, remoteUpdatedAt: remoteStamp }));
      return { ...result, bootstrap: true, full: true };
    }

    if (!bootstrapped) {
      rawStorage.set(bootstrapKey, JSON.stringify({ at: now, adoptedLocalCache: true, remoteUpdatedAt: remoteStamp }));
    }

    const knownPageStamp = Number(pageRemoteStamps[pageKey] || 0);
    const fullRefreshDue = now - Number(usage.lastFullPullAt || 0) >= FULL_REFRESH_MS;
    if (!force && !fullRefreshDue && remoteStamp > 0 && knownPageStamp > 0 && remoteStamp <= knownPageStamp) {
      return { skipped: true, unchanged: true, remoteUpdatedAt: remoteStamp };
    }
    if (!force && !fullRefreshDue && remoteStamp === 0 && knownPageStamp === 0) {
      return { skipped: true, emptyRemote: true };
    }

    const syncScope = CLOUD_DATA_KEYS;
    const changedKeys = force
      ? CLOUD_DATA_KEYS
      : changedPriorityKeysFromMeta(meta, syncScope, readUsageState());
    if (!force && !fullRefreshDue && !changedKeys.length) {
      const latestUsage = readUsageState();
      writeUsageState({
        pageRemoteStamps: {
          ...(latestUsage.pageRemoteStamps || {}),
          [pageKey]: remoteStamp
        }
      });
      return { skipped: true, noRelevantPageChanges: true, remoteUpdatedAt: remoteStamp, page: pageKey };
    }

    const keysToPull = fullRefreshDue && !force ? CLOUD_DATA_KEYS : changedKeys;
    const result = await pullDatasetKeys(keysToPull, {
      force: force === true, concurrency: 6, silentProgress: !force, remoteMeta: meta
    });

    const latestUsage = readUsageState();
    writeUsageState({
      lastFullPullAt: (force || fullRefreshDue || keysToPull.length >= CLOUD_DATA_KEYS.length) ? Date.now() : Number(latestUsage.lastFullPullAt || 0),
      pageRemoteStamps: {
        ...(latestUsage.pageRemoteStamps || {}),
        [pageKey]: Math.max(remoteStamp, Number(result?.remoteUpdatedAt || 0))
      }
    });
    return { ...result, checked: true, page: pageKey };
  }

  let connectivityRecoveryRunning = false;
  let lastConnectivityFullPullAt = 0;

  let connectivityProbeRunning = null;
  let lastConnectivityProbeAt = 0;

  async function probeConnectivity(options = {}) {
    const now = Date.now();
    const minGap = Math.max(0, Number(options.minGap || 0));
    if (connectivityProbeRunning) return connectivityProbeRunning;
    if (minGap && now - lastConnectivityProbeAt < minGap) return readState().backendReachable === true;
    lastConnectivityProbeAt = now;
    connectivityProbeRunning = (async () => {
      try {
        const access = await cheapDatabaseAccess();
        const response = await fetchWithTimeout(metaEndpoint(access.location, access.token), {
          method: 'GET', headers: { 'Accept':'application/json' }
        }, Math.max(1800, Number(options.timeout || 3500)));
        if (!response.ok) throw await databaseError(response);
        writeState({ backendReachable:true, backendReachableAt:Date.now(), backendError:'' });
        return true;
      } catch (_) {
        return false;
      } finally {
        connectivityProbeRunning = null;
      }
    })();
    return connectivityProbeRunning;
  }

  async function pullAllWithRetry(options = {}) {
    let result = await pullAll({ force: options.force !== false, concurrency: options.concurrency || 6 });
    let failed = Array.isArray(result?.failedKeys) ? [...result.failedKeys] : [];
    for (let attempt = 0; failed.length && attempt < 2; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 450 + attempt * 650));
      const retry = await pullDatasetKeys(failed, { force: true, concurrency: 4, silentProgress: options.silentProgress === true });
      result = {
        ...result,
        applied: Number(result?.applied || 0) + Number(retry?.applied || 0),
        failed: Number(retry?.failed || 0),
        failedKeys: Array.isArray(retry?.failedKeys) ? [...retry.failedKeys] : [],
        complete: Number(retry?.failed || 0) === 0
      };
      failed = result.failedKeys;
    }
    let convergenceUpload = null;
    if (!failed.length && core.getSyncQueue().length) {
      convergenceUpload = await syncAll({ manual: true, forceRetry: true });
    }
    const remaining = core.getSyncQueue().length;
    const complete = !failed.length && remaining === 0;
    if (complete) markLoginFullSyncComplete({ recovery: options.reason || 'full-pull', datasetCount: CLOUD_DATA_KEYS.length });
    return { ...result, convergenceUpload, remaining, complete };
  }

  async function recoverConnectivityAndSync(reason = 'resume', options = {}) {
    if (connectivityRecoveryRunning) return { busy: true, remaining: core.getSyncQueue().length };
    connectivityRecoveryRunning = true;
    try {
      const ready = core.syncReady || core.localReady;
      if (ready && typeof ready.then === 'function') { try { await ready; } catch (_) {} }
      datasetRetryState.clear();
      let uploadResult = { remaining: core.getSyncQueue().length, uploaded: 0 };
      if (core.getSyncQueue().length) {
        try { await core.preservePendingSyncState?.(); } catch (_) {}
        uploadResult = await syncAll({ manual: true, forceRetry: true });
      }
      if (core.getSyncQueue().length || Number(uploadResult?.remaining || 0) > 0) return { ...uploadResult, deferred: true };

      const now = Date.now();
      const fullPullDue = options.forceFullPull === true || now - lastConnectivityFullPullAt > 45000;
      if (!fullPullDue) return { ...uploadResult, recovered: true, fullPullSkipped: true };
      const pullResult = await pullAllWithRetry({ force: true, concurrency: 6, reason });
      const recovered = Number(pullResult?.failed || 0) === 0 && Number(pullResult?.remaining || 0) === 0 && pullResult?.complete !== false;
      if (recovered) lastConnectivityFullPullAt = Date.now();
      return { ...uploadResult, pull: pullResult, recovered };
    } catch (error) {
      return { deferred: true, networkDeferred: isTransientNetworkError(error), remaining: core.getSyncQueue().length, message: safeSyncMessage(error) };
    } finally {
      connectivityRecoveryRunning = false;
    }
  }

  async function uploadDataset(key) {
    if (!CLOUD_DATA_KEYS.includes(key)) return false;
    core.enqueueSyncOperation(key);
    const result = await syncAll({ forceRetry: true });
    return Number(result.uploaded || 0) > 0;
  }

  function scheduleSync(delay = WRITE_DEBOUNCE_MS) {
    clearTimeout(scheduledSync);
    scheduledSync = setTimeout(() => {
      const job = Promise.resolve(core.syncReady || core.localReady)
        .catch(() => null)
        .then(() => core.getSyncQueue().length ? core.preservePendingSyncState?.().catch?.(() => null) : null)
        .then(() => syncAll({ manual: false, forceCheck: false }));
      job.then(result => {
        if (core.getSyncQueue().length) {
          scheduleSync(result?.networkDeferred ? 2500 : (result?.failed > 0 ? 1200 : 700));
        }
      }).catch(error => {
        console.warn('[CASH TOP 2] scheduled database sync:', error);
        if (core.getSyncQueue().length) scheduleSync(2500);
      });
    }, Math.max(0, Number(delay) || WRITE_DEBOUNCE_MS));
  }


  let legacyAuditCleanupDone = false;
  async function pruneRemoteAuditTrailRecent(location, token, limit = 100) {
    try {
      const response = await fetchWithTimeout(auditTrailRecentEndpoint(location, '', token), { method:'GET', headers:{Accept:'application/json'} }, 12000);
      if (!response.ok) return 0;
      const payload = await response.json().catch(()=>null);
      const rows = payload && typeof payload === 'object' ? Object.values(payload).filter(Boolean) : [];
      rows.sort((a,b)=>new Date(b.timestamp||0)-new Date(a.timestamp||0));
      const remove = rows.slice(Math.max(1, Number(limit)||100));
      await Promise.allSettled(remove.map(item=>fetchWithTimeout(auditTrailRecentEndpoint(location, item.id, token), {method:'DELETE'}, 9000)));
      return remove.length;
    } catch (_) { return 0; }
  }
  async function cleanupLegacyAuditTrail(location, token) {
    if (legacyAuditCleanupDone) return;
    legacyAuditCleanupDone = true;
    try { await fetchWithTimeout(auditTrailLegacyRootEndpoint(location, token), {method:'DELETE'}, 12000); } catch (_) {}
  }

  let auditTrailSyncing = false;
  async function flushAuditTrailPending(options = {}) {
    if (!AUDIT_CLOUD_ENABLED) {
      // Low-usage mode: audit remains in the local rolling cache and in backups.
      // It is intentionally not mirrored record-by-record to Turso.
      const pending = core.getAuditPendingAsync ? await core.getAuditPendingAsync(Math.max(1, Number(options.limit || 120))) : (core.getAuditPending?.() || []);
      const ids = (pending || []).map(item => String(item?.id || '')).filter(Boolean);
      if (ids.length) {
        if (core.completeAuditPendingAsync) await core.completeAuditPendingAsync(ids).catch(() => 0);
        else core.completeAuditPending?.(ids);
      }
      return { uploaded: 0, remaining: 0, localOnly: true };
    }
    if (auditTrailSyncing) return { uploaded: 0, busy: true };
    const limit = Math.max(1, Number(options.limit || 80));
    const pending = core.getAuditPendingAsync ? await core.getAuditPendingAsync(limit) : (core.getAuditPending?.() || []).slice(0, limit);
    if (!pending.length) return { uploaded: 0, remaining: 0 };
    if (navigator.onLine === false && options.force !== true) return { uploaded: 0, remaining: pending.length, offline: true };
    auditTrailSyncing = true;
    const succeeded = [];
    try {
      const { token, location } = await openLightDatabaseAccess();
      const batch = pending.slice(0, limit);
      const concurrency = Math.min(8, Math.max(1, Number(options.concurrency || 6)));
      let cursor = 0;
      async function worker() {
        while (cursor < batch.length) {
          const index = cursor++;
          const record = batch[index];
          if (!record?.id) continue;
          const stamp = String(record.timestamp || new Date().toISOString());
          const day = stamp.slice(0, 10) || new Date().toISOString().slice(0,10);
          const hour = String(new Date(stamp).getHours()).padStart(2,'0');
          try {
            const response = isPathProxy
              ? await writeJsonEndpoint(auditTrailRecentEndpoint(location, record.id, token), record, 9000)
              : await fetchWithTimeout(auditTrailRecentEndpoint(location, record.id, token), {
                  method: 'PUT', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify(record)
                }, 9000);
            if (!response.ok) throw await databaseError(response);
            succeeded.push(String(record.id));
          } catch (error) {
            if (!isTransientNetworkError(error)) console.warn('[CASH TOP 2] audit upload:', error);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, () => worker()));
      if (succeeded.length) {
        if (core.completeAuditPendingAsync) await core.completeAuditPendingAsync(succeeded);
        else core.completeAuditPending?.(succeeded);
        await pruneRemoteAuditTrailRecent(location, token, 100);
        cleanupLegacyAuditTrail(location, token).catch(() => null);
      }
      const remaining = core.getAuditPendingCountAsync ? await core.getAuditPendingCountAsync() : (core.getAuditPending?.().length || 0);
      if (remaining && navigator.onLine !== false) setTimeout(() => flushAuditTrailPending({ limit: 80 }).catch(() => null), 600);
      return { uploaded: succeeded.length, remaining };
    } finally {
      auditTrailSyncing = false;
    }
  }

  async function fetchAuditTrailRecent(limit = 100) {
    if (!AUDIT_CLOUD_ENABLED) {
      const rows = core.getRecentAuditCache?.() || [];
      return [...rows].sort((a,b)=>new Date(b.timestamp||0)-new Date(a.timestamp||0)).slice(0, Math.max(1, Number(limit)||100));
    }
    const { token, location } = await openLightDatabaseAccess();
    cleanupLegacyAuditTrail(location, token).catch(() => null);
    const response = await fetchWithTimeout(auditTrailRecentEndpoint(location, '', token), { method:'GET', headers:{Accept:'application/json'} }, 12000);
    if (!response.ok) throw await databaseError(response);
    const payload = await response.json().catch(()=>null);
    const rows = payload && typeof payload === 'object' ? Object.values(payload).filter(Boolean) : [];
    return rows.sort((a,b)=>new Date(b.timestamp||0)-new Date(a.timestamp||0)).slice(0, Math.max(1, Number(limit)||100));
  }

  async function fetchAuditTrailHour(day, hour) {
    const normalizedDay = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? String(day) : new Date().toISOString().slice(0,10);
    if (!AUDIT_CLOUD_ENABLED) {
      const normalizedHour = String(Math.max(0, Math.min(23, Number(hour || 0)))).padStart(2,'0');
      return (core.getRecentAuditCache?.() || []).filter(item => {
        const stamp = String(item?.timestamp || '');
        if (stamp.slice(0,10) !== normalizedDay) return false;
        const d = new Date(stamp);
        return Number.isFinite(d.getTime()) && String(d.getHours()).padStart(2,'0') === normalizedHour;
      }).sort((a,b)=>new Date(b.timestamp||0)-new Date(a.timestamp||0));
    }
    const normalizedHour = String(Math.max(0, Math.min(23, Number(hour || 0)))).padStart(2,'0');
    const { token, location } = await openLightDatabaseAccess();
    const response = await fetchWithTimeout(auditTrailEndpoint(location, normalizedDay, normalizedHour, '', token), { method: 'GET', headers: { Accept: 'application/json' } }, 12000);
    if (!response.ok) throw await databaseError(response);
    const payload = await response.json().catch(() => null);
    const rows = payload && typeof payload === 'object' ? Object.values(payload).filter(Boolean) : [];
    return rows.sort((a,b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }

  async function fetchAuditTrailDay(day) {
    const normalizedDay = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? String(day) : new Date().toISOString().slice(0,10);
    if (!AUDIT_CLOUD_ENABLED) {
      return (core.getRecentAuditCache?.() || []).filter(item => String(item?.timestamp || '').slice(0,10) === normalizedDay)
        .sort((a,b)=>new Date(b.timestamp||0)-new Date(a.timestamp||0));
    }
    const result = [];
    for (let hour = 23; hour >= 0; hour -= 1) {
      const rows = await fetchAuditTrailHour(normalizedDay, hour).catch(() => []);
      result.push(...rows);
    }
    return result.sort((a,b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }

  async function importDatasets(keys = []) {
    const unique = [...new Set((Array.isArray(keys) ? keys : []).filter(key => CLOUD_DATA_KEYS.includes(key)))];
    if (!unique.length) return { uploaded: 0, remaining: core.getSyncQueue().length, importSync: true };
    if (core.localReady && typeof core.localReady.then === 'function') {
      try { await core.localReady; } catch (_) {}
    }

    // R108: الاستعادة تستخدم نفس مسار المصالحة الآمن: قراءة المجموعة المتغيرة
    // من السحابة ثم دمج النسخة المستوردة معها ثم كتابة النتيجة. لا توجد UPSERT
    // عمياء، لذلك نسخة قديمة أو أقصر لا تمسح سجلات جهاز آخر.
    return syncAll({ manual: true, forceRetry: true, importSync: false, readBeforeWrite: true });
  }

  function resetSyncRuntime() {
    datasetRetryState.clear();
    clearTimeout(scheduledSync);
    scheduledSync = null;
    writeState({
      lastError: '',
      lastDeferredError: '',
      deferredAt: 0,
      queueResetAt: Date.now()
    });
    // لا نبدأ رفعاً بلا عمليات؛ أول تعديل جديد يطلق cashtop:data-changed
    // ويُضاف إلى السلسلة الموحدة بصورة طبيعية.
    if (core.getSyncQueue().length) scheduleSync(30);
    return Promise.resolve(true);
  }

  function signOut() {
    writeState({ signedOutAt: Date.now() });
    return Promise.resolve();
  }

  window.CashtopTurso = {
    syncAll,
    reconcileAll,
    flushAuditTrailPending,
    fetchAuditTrailDay,
    fetchAuditTrailHour,
    fetchAuditTrailRecent,
    flushPendingQueue,
    uploadDataset,
    importDatasets,
    pullAll,
    pullAllWithRetry,
    queryDatasetPage,
    pullDatasetKeys,
    pullPriorityDatasets,
    checkRemoteAndPull,
    probeConnectivity,
    recoverConnectivityAndSync,
    checkLicenseCloudNow,
    resetSyncRuntime,
    signOut,
    getState: readState,
    resetRemotePath: () => {
      rawStorage.remove(locationKey);
      selectedLocation = null;
      return Promise.resolve(true);
    },
    getProjectInfo: () => ({
      projectId: cfg.projectId,
      backend: settings.backendName || 'Turso / libSQL',
      databaseURL: readState().lastTransportBase || configuredBaseUrls[0] || cfg.databaseURL,
      databaseURLs: [...configuredBaseUrls],
      path: selectedLocation ? locationPath(selectedLocation) : `${primaryRoot}/${companyIds[0]}`,
      companyIds: [...companyIds],
      authMode: readState().authMode || 'auto'
    })
  };

  window.addEventListener('cashtop:data-changed', event => {
    const detail = event?.detail || {};
    // كل تعديل محلي يذهب للطابور فوراً. عمليات الحذف تحديداً لا تنتظر debounce
    // حتى لا تعود الفاتورة/السجل عند الانتقال بين الصفحات أو الأجهزة.
    const oldValue = detail.oldValue;
    const newValue = detail.value;
    const looksLikeDelete = newValue == null || (Array.isArray(oldValue) && Array.isArray(newValue) && newValue.length < oldValue.length);
    scheduleSync(looksLikeDelete ? 0 : WRITE_DEBOUNCE_MS);
  });
  window.addEventListener('cashtop:audit-pending', () => {
    if (AUDIT_CLOUD_ENABLED) setTimeout(() => flushAuditTrailPending().catch(() => null), 1200);
    else flushAuditTrailPending({ limit: 120 }).catch(() => null);
  });
  window.addEventListener('cashtop:sync-now', () => {
    if (core.getSyncQueue().length) scheduleSync(15);
    else checkRemoteAndPull(true).catch(() => null);
  });
  window.addEventListener('cashtop:sync-queue-restored', () => { if (core.FILE !== 'sync.html') scheduleSync(250); });
  window.addEventListener('online', () => {
    datasetRetryState.clear();
    recoverConnectivityAndSync('online', { forceFullPull: true }).catch(() => null);
    if (AUDIT_CLOUD_ENABLED) flushAuditTrailPending({ limit: 120 }).catch(() => null);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (core.getSyncQueue().length) recoverConnectivityAndSync('visible').catch(() => null);
    else checkRemoteAndPull(true).catch(() => null);
  });

  // R106 connectivity recovery: some Android/WebView builds do not reliably fire
  // the online event when mobile data is enabled after working offline. The
  // watchdog therefore retries the durable queue whenever the browser reports a
  // usable connection, and a real online/connection-change event also performs
  // one complete company pull after uploads finish.
  const resumeSyncRuntime = event => {
    datasetRetryState.clear();
    const reason = event?.type || 'resume';
    if (core.getSyncQueue().length) recoverConnectivityAndSync(reason).catch(() => null);
    else if (reason === 'change') recoverConnectivityAndSync('connection-change', { forceFullPull: true }).catch(() => null);
    else checkRemoteAndPull(true).catch(() => null);
  };
  pollTimer = setInterval(() => {
    if (document.hidden) return;
    if (core.getSyncQueue().length) {
      if (navigator.onLine !== false) {
        recoverConnectivityAndSync('watchdog').catch(() => null);
      } else {
        // navigator.onLine can stay false on some Android devices after mobile
        // data is enabled. Probe the real sync endpoint with a short deadline.
        probeConnectivity({ timeout: 3200, minGap: 7000 }).then(ok => {
          if (ok) recoverConnectivityAndSync('watchdog-probe', { forceFullPull: true }).catch(() => null);
        }).catch(() => null);
      }
      return;
    }
    if (navigator.onLine === false) {
      probeConnectivity({ timeout: 3200, minGap: 9000 }).then(ok => {
        if (ok) recoverConnectivityAndSync('idle-watchdog-probe', { forceFullPull: true }).catch(() => null);
      }).catch(() => null);
    } else {
      checkRemoteAndPull(false).catch(() => null);
    }
  }, Math.min(AUTO_REMOTE_CHECK_MS, 750));
  window.addEventListener('focus', resumeSyncRuntime, { passive:true });
  window.addEventListener('pageshow', resumeSyncRuntime, { passive:true });
  navigator.connection?.addEventListener?.('change', resumeSyncRuntime);

  // المفتاح له مراقبة خاصة مستقلة عن مزامنة السجلات الثقيلة.
  startLicenseCloudWatch();
  window.addEventListener('focus', () => checkLicenseCloudNow({ force:true }).catch(() => null), { passive:true });
  window.addEventListener('pageshow', () => checkLicenseCloudNow({ force:true }).catch(() => null), { passive:true });
  window.addEventListener('online', () => checkLicenseCloudNow({ force:true }).catch(() => null), { passive:true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkLicenseCloudNow({ force:true }).catch(() => null);
  }, { passive:true });

  window.addEventListener('pagehide', event => {
    clearTimeout(scheduledSync);
    clearTimeout(backgroundPullTimer);
    clearTimeout(realtimePullTimer);
    stopRealtimeStream();
    // In BFCache the document can come back without re-running this script.
    // Keep the watchdog interval alive in that case; pageshow will immediately
    // resume pending upload / remote revision checking.
    if (!event.persisted && pollTimer) clearInterval(pollTimer);
    if (!event.persisted && licenseWatchTimer) { clearInterval(licenseWatchTimer); licenseWatchTimer = null; }
  });

  if (AUDIT_CLOUD_ENABLED) {
    setTimeout(async()=>{if(navigator.onLine===false)return;try{const {token,location}=await cheapDatabaseAccess();await pruneRemoteAuditTrailRecent(location,token,100);await cleanupLegacyAuditTrail(location,token)}catch(_){}},5000);
    setTimeout(() => flushAuditTrailPending({ limit: 120 }).catch(() => null), 2500);
  } else {
    setTimeout(() => flushAuditTrailPending({ limit: 120 }).catch(() => null), 100);
  }

  // Cache-first startup: upload pending local edits after a debounce. With no
  // edits, perform a throttled metadata check. A new device pulls all datasets,
  // and later metadata changes converge every changed dataset across devices.
  if (core.FILE === 'sync.html') {
    // The login synchronization gate owns the first full upload/pull sequence so
    // its percentage reflects one deterministic job rather than racing startup.
  } else if (core.getSyncQueue().length) scheduleSync(80);
  else if (['customers.html','products.html','invoices.html'].includes(core.FILE)) {
    // R125: اترك أول frame/رسم للجدول والـ50 سجل أولاً، ثم شغّل المزامنة
    // بالخلفية. هذا لا يغيّر البيانات أو الحسابات؛ فقط يمنع تنافس المزامنة
    // الثقيلة مع أول فتح للصفحة على الجوال.
    const startRegisterBackgroundSync = () => checkRemoteAndPull(false).catch(() => null);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(startRegisterBackgroundSync, { timeout: 5000 });
    else setTimeout(startRegisterBackgroundSync, 3200);
  } else setTimeout(() => checkRemoteAndPull(false).catch(() => null), 220);
} else if (core) {
  console.warn('[CASH TOP 2] إعداد Turso للمزامنة غير مكتمل.');
  core.updateSyncBadge();
}
})();
