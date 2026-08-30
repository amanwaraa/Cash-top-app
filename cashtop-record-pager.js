(() => {
  'use strict';

  const PAGE_SIZE = 50;
  const file = (() => {
    try { return decodeURIComponent((location.pathname.split('/').pop() || '').replace(/\+/g, ' ')); }
    catch (_) { return location.pathname.split('/').pop() || ''; }
  })();

  const configs = {
    'customers.html': {
      key: 'cashtop_customers',
      tableBody: 'customersTableBody',
      getDefault: () => (typeof customersData !== 'undefined' && Array.isArray(customersData) ? customersData : []),
      statIds: ['statTotalCust','statDebtors','statCreditors','statLimits'],
      applyStats(source) {
        const data = Array.isArray(source) ? source : [];
        const summary = data.reduce((acc, cust) => {
          const balanceValue = parseFloat(cust?.balance) || 0;
          const limitValue = parseFloat(cust?.creditLimit) || 0;
          if (balanceValue > 0) {
            acc.totalDebtors += balanceValue;
            if (limitValue > 0 && balanceValue > limitValue) acc.limitsExceeded += 1;
          } else if (balanceValue < 0) acc.totalCreditors += Math.abs(balanceValue);
          return acc;
        }, { totalDebtors: 0, totalCreditors: 0, limitsExceeded: 0 });
        const totalEl = document.getElementById('statTotalCust');
        const debtorsEl = document.getElementById('statDebtors');
        const creditorsEl = document.getElementById('statCreditors');
        const limitsEl = document.getElementById('statLimits');
        if (totalEl) totalEl.innerText = `${data.length} عميل`;
        if (debtorsEl) debtorsEl.innerText = summary.totalDebtors.toFixed(2);
        if (creditorsEl) creditorsEl.innerText = summary.totalCreditors.toFixed(2);
        if (limitsEl) limitsEl.innerText = `${summary.limitsExceeded} عملاء`;
      }
    },
    'products.html': {
      key: 'cashtop_products',
      tableBody: 'productsTableBody',
      getDefault: () => (typeof productsData !== 'undefined' && Array.isArray(productsData) ? productsData : []),
      statIds: ['statProductsCount','statTotalCost','statTotalSale','statTotalProfit'],
      applyStats(source) {
        const data = Array.isArray(source) ? source : [];
        let tCost = 0;
        let tSale = 0;
        data.forEach(prod => {
          const pCost = parseFloat(prod?.cost) || 0;
          const pPrice = parseFloat(prod?.pricePiece) || parseFloat(prod?.price) || 0;
          let pStock = 0;
          try { pStock = typeof displayStockForProduct === 'function' ? displayStockForProduct(prod) : (parseFloat(prod?.stockPieces) || parseFloat(prod?.stock) || 0); }
          catch (_) { pStock = parseFloat(prod?.stockPieces) || parseFloat(prod?.stock) || 0; }
          tCost += pCost * pStock;
          tSale += pPrice * pStock;
        });
        const fullProducts = configs['products.html'].getDefault();
        const symbol = (() => { try { return typeof productBaseSymbol === 'function' ? productBaseSymbol() : '₪'; } catch (_) { return '₪'; } })();
        const countEl = document.getElementById('statProductsCount');
        const costEl = document.getElementById('statTotalCost');
        const saleEl = document.getElementById('statTotalSale');
        const profitEl = document.getElementById('statTotalProfit');
        if (countEl) countEl.innerText = `${fullProducts.length} منتج`;
        if (costEl) costEl.innerText = `${tCost.toFixed(2)} ${symbol}`;
        if (saleEl) saleEl.innerText = `${tSale.toFixed(2)} ${symbol}`;
        if (profitEl) profitEl.innerText = `${(tSale - tCost).toFixed(2)} ${symbol}`;
      }
    },
    'invoices.html': {
      key: 'cashtop_invoices',
      tableBody: 'invoices-tbody',
      getDefault: () => {
        try {
          if (typeof visibleInvoices === 'function') return visibleInvoices();
          return typeof allInvoices !== 'undefined' && Array.isArray(allInvoices) ? allInvoices : [];
        } catch (_) { return []; }
      },
      // إحصائيات الفواتير يديرها invoices.js من كامل البيانات. لا نلمسها هنا.
      applyStats() {}
    }
  };

  const config = configs[file];
  if (!config) return;

  const state = {
    page: 1,
    source: [],
    originalRender: null,
    originalFilter: null,
    installed: false,
    raf: 0,
    remoteTotal: 0,
    remotePages: new Map(),
    syncingPages: new Set()
  };

  function cleanSource(value) {
    return (Array.isArray(value) ? value : []).filter(item => item && typeof item === 'object');
  }

  function newestFirst(source) {
    // نفس منطق R124: الإضافات الجديدة تكون في نهاية المصفوفة، لذلك الصفحة الأولى آخر 50.
    return cleanSource(source).slice().reverse();
  }

  function isUnfilteredView() {
    const search = String(document.getElementById('searchInput')?.value || '').trim();
    if (search) return false;
    try { if (file === 'customers.html' && typeof activeDebtFilter !== 'undefined' && activeDebtFilter !== 'all') return false; } catch (_) {}
    try { if (file === 'invoices.html' && document.getElementById('invoicePeriodFilter')?.value && document.getElementById('invoicePeriodFilter').value !== 'all') return false; } catch (_) {}
    return true;
  }

  function effectiveTotal() {
    return isUnfilteredView() ? Math.max(state.source.length, Number(state.remoteTotal || 0)) : state.source.length;
  }

  function pageCount() {
    return Math.max(1, Math.ceil(effectiveTotal() / PAGE_SIZE));
  }

  function clampPage(value) {
    return Math.max(1, Math.min(pageCount(), Number(value || 1)));
  }

  function pageSlice() {
    const page = clampPage(state.page);
    const start = (page - 1) * PAGE_SIZE;
    const localRows = state.source.slice(start, start + PAGE_SIZE);
    if (localRows.length || !isUnfilteredView()) return localRows;
    const cached = state.remotePages.get(page) || readRemotePageCache(page);
    return Array.isArray(cached?.items) ? cached.items : [];
  }


  function scopeId() {
    try {
      const session = window.Cashtop?.getSession?.() || {};
      const tenant = String(session.tenantId || session.companyId || session.licenseId || session.companyKey || 'default');
      const group = String(window.Cashtop?.currentFinancialGroupId?.() || window.Cashtop?.LEGACY_FINANCIAL_GROUP_ID || 'FG_LEGACY');
      return `${encodeURIComponent(tenant)}::${encodeURIComponent(group)}`;
    } catch (_) { return 'default::FG_LEGACY'; }
  }

  function remoteCacheKey(page) {
    return `ct_r127_register_page::${scopeId()}::${config.key}::${Math.max(1, Number(page || 1))}`;
  }

  function readRemotePageCache(page) {
    try {
      const parsed = JSON.parse(Storage.prototype.getItem.call(localStorage, remoteCacheKey(page)) || 'null');
      if (!parsed || !Array.isArray(parsed.items)) return null;
      state.remotePages.set(Number(page || 1), parsed);
      state.remoteTotal = Math.max(state.remoteTotal, Number(parsed.total || 0));
      return parsed;
    } catch (_) { return null; }
  }

  function saveRemotePageCache(result) {
    if (!result || !Array.isArray(result.items)) return;
    const payload = {
      page: Math.max(1, Number(result.page || 1)),
      pageSize: PAGE_SIZE,
      total: Math.max(0, Number(result.total || 0)),
      pages: Math.max(1, Number(result.pages || 1)),
      updatedAt: Number(result.updatedAt || 0),
      cachedAt: Date.now(),
      items: result.items
    };
    state.remotePages.set(payload.page, payload);
    state.remoteTotal = Math.max(state.remoteTotal, payload.total);
    try { Storage.prototype.setItem.call(localStorage, remoteCacheKey(payload.page), JSON.stringify(payload)); } catch (_) {}
  }

  function withDeadline(promise, timeout = 9000) {
    let timer = 0;
    return Promise.race([
      Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PAGE_SYNC_TIMEOUT')), timeout); })
    ]);
  }

  async function syncRemotePage(page) {
    page = Math.max(1, Number(page || 1));
    if (!isUnfilteredView() || navigator.onLine === false || state.syncingPages.has(page)) return;
    const api = window.CashtopTurso;
    if (!api?.queryDatasetPage) return;
    state.syncingPages.add(page);
    const host = document.getElementById('ctR125Pager');
    host?.classList.add('is-syncing');
    try {
      const result = await withDeadline(api.queryDatasetPage(config.key, { page, pageSize: PAGE_SIZE }), 9000);
      saveRemotePageCache(result);
      if (state.page === page) renderCurrentPage();
      else renderPager();
    } catch (error) {
      console.warn('[CASH TOP R125] page sync:', config.key, page, error);
    } finally {
      state.syncingPages.delete(page);
      if (!state.syncingPages.size) host?.classList.remove('is-syncing');
    }
  }

  function injectStyle() {
    if (document.getElementById('ctR125PagerStyle')) return;
    const style = document.createElement('style');
    style.id = 'ctR125PagerStyle';
    style.textContent = `
      /* R125: خطوط الجداول تبقى واضحة وثابتة بدون تأثير على حسابات الصفحة */
      #${config.tableBody} tr > td{border-bottom:1px solid #e6ebf2!important;}
      #${config.tableBody} tr:last-child > td{border-bottom:0!important;}
      #${config.tableBody} tr{transition:background-color 90ms linear!important;}
      .ct-r125-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0 2px;padding:11px 12px;border:1px solid #e4e9f0;border-radius:12px;background:#fff;box-shadow:0 2px 7px rgba(15,23,42,.035);font-family:Cairo,Arial,sans-serif;direction:rtl;content-visibility:auto;contain-intrinsic-size:52px}
      .ct-r125-pager__info{font-size:12px;font-weight:800;color:#536174;line-height:1.7}
      .ct-r125-pager__actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
      .ct-r125-pager button{height:36px;min-width:38px;border:1px solid #dce3ec;border-radius:9px;background:#fff;color:#334155;padding:0 10px;font:800 13px Cairo,Arial,sans-serif;touch-action:manipulation;cursor:pointer;transition:transform 80ms linear,background-color 80ms linear,border-color 80ms linear,color 80ms linear}
      .ct-r125-pager button:active:not(:disabled){transform:scale(.97)}
      .ct-r125-pager button.active{background:#605ca8;border-color:#605ca8;color:#fff}
      .ct-r125-pager button:disabled{opacity:.4;cursor:default}
      .ct-r125-pager__dots{padding:0 2px;color:#94a3b8;font-weight:800}
      .ct-r125-pager.is-syncing .ct-r125-pager__info::after{content:'  • تحديث 50 سجل بالخلفية';color:#6d64a8;font-weight:800}
      @media(max-width:640px){.ct-r125-pager{justify-content:center;padding:10px 8px}.ct-r125-pager__info{width:100%;text-align:center}.ct-r125-pager__actions{width:100%}.ct-r125-pager button{height:38px;min-width:39px;padding:0 9px}}
      @media(prefers-reduced-motion:reduce){#${config.tableBody} tr,.ct-r125-pager button{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function removeOldPager() {
    document.querySelectorAll('.ct-record-pager,.ghazal-pager,#ctRegisterPager,.ct-r125-pager').forEach(node => node.remove());
  }

  function pagerHost() {
    let host = document.getElementById('ctR125Pager');
    if (host) return host;
    const tbody = document.getElementById(config.tableBody);
    const table = tbody?.closest('table');
    const wrap = table?.closest('.table-responsive-box,.table-responsive,.table-wrapper,.table-wrap,.table-container,.data-table-wrap') || table?.parentElement || table;
    if (!wrap) return null;
    host = document.createElement('div');
    host.id = 'ctR125Pager';
    host.className = 'ct-r125-pager';
    host.innerHTML = '<div class="ct-r125-pager__info" id="ctR125PagerInfo"></div><div class="ct-r125-pager__actions" id="ctR125PagerActions"></div>';
    wrap.insertAdjacentElement('afterend', host);
    return host;
  }

  function pageNumbers(current, pages) {
    const set = new Set([1, pages, current - 2, current - 1, current, current + 1, current + 2]);
    return [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  }

  function renderPager() {
    const host = pagerHost();
    if (!host) return;
    const pages = pageCount();
    state.page = clampPage(state.page);
    const total = effectiveTotal();
    const from = total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
    const to = Math.min(total, state.page * PAGE_SIZE);
    const info = document.getElementById('ctR125PagerInfo');
    if (info) info.textContent = `الإجمالي: ${total} — عرض ${from}-${to} — صفحة ${state.page} من ${pages}`;
    const actions = document.getElementById('ctR125PagerActions');
    if (!actions) return;
    actions.replaceChildren();

    const button = (text, target, active = false, disabled = false) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = text;
      if (active) el.classList.add('active');
      el.disabled = disabled;
      el.addEventListener('click', () => goToPage(target), { passive: true });
      return el;
    };

    actions.appendChild(button('السابق', state.page - 1, false, state.page <= 1));
    const numbers = pageNumbers(state.page, pages);
    numbers.forEach((n, index) => {
      if (index && n - numbers[index - 1] > 1) {
        const dots = document.createElement('span');
        dots.className = 'ct-r125-pager__dots';
        dots.textContent = '…';
        actions.appendChild(dots);
      }
      actions.appendChild(button(String(n), n, n === state.page, false));
    });
    actions.appendChild(button('التالي', state.page + 1, false, state.page >= pages));
  }

  function applyPreservedStats(fullSource) {
    try { config.applyStats(fullSource); } catch (error) { console.warn('[CASH TOP R125] preserve stats:', error); }
  }

  function renderCurrentPage() {
    if (typeof state.originalRender !== 'function') return;
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(() => {
      const rows = pageSlice();
      state.originalRender(rows);
      // renderTable في العملاء/المنتجات كان يحسب البطاقات من rows المرسلة له.
      // نعيد نفس الحساب الأصلي لكن على كامل نتيجة البحث/الفلتر، وليس على 50 المعروضة.
      applyPreservedStats(state.source.slice().reverse());
      renderPager();
    });
  }

  function setSource(source, options = {}) {
    state.source = newestFirst(source);
    if (options.resetPage === true) state.page = 1;
    state.page = clampPage(state.page);
    renderCurrentPage();
  }

  function goToPage(page) {
    const next = clampPage(page);
    if (next === state.page) return;
    state.page = next;
    renderCurrentPage();
    syncRemotePage(next);
    const host = document.getElementById('ctR125Pager');
    if (host && typeof host.scrollIntoView === 'function') {
      // لا نستخدم smooth scrolling حتى لا نستهلك إطارات إضافية على الجوال.
      host.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  function install() {
    if (state.installed) return;
    if (typeof window.renderTable !== 'function') {
      setTimeout(install, 30);
      return;
    }
    state.installed = true;
    injectStyle();
    removeOldPager();
    state.originalRender = window.renderTable;

    window.renderTable = function ctR125PagedRender(data) {
      const source = Array.isArray(data) ? data : config.getDefault();
      setSource(source, { resetPage: false });
    };

    if (typeof window.filterTable === 'function') {
      state.originalFilter = window.filterTable;
      window.filterTable = function ctR125FilterWrapper(...args) {
        state.page = 1;
        return state.originalFilter.apply(this, args);
      };
    }

    // أول عرض بعد تركيب الـpager. الحسابات لا تتغير؛ الجدول فقط يصبح 50 سجلاً.
    readRemotePageCache(1);
    setSource(config.getDefault(), { resetPage: true });
    // مزامنة الصفحة الحالية 50 سجلاً فقط في قناة منفصلة وآمنة؛ لا تستبدل بيانات R108.
    setTimeout(() => syncRemotePage(1), 0);

    const refreshFromStorage = event => {
      const key = event?.detail?.key || event?.key || '';
      const expected = file === 'customers.html' ? 'cashtop_customers' : file === 'products.html' ? 'cashtop_products' : 'cashtop_invoices';
      if (key && !String(key).includes(expected)) return;
      // نترك كود الصفحة يحدّث المصفوفة أولاً ثم نعيد تقسيمها في frame واحد.
      requestAnimationFrame(() => setSource(config.getDefault(), { resetPage: false }));
    };
    window.addEventListener('cashtop:remote-applied', refreshFromStorage);
    window.addEventListener('cashtop:data-changed', refreshFromStorage);
    window.addEventListener('storage', refreshFromStorage);
    window.addEventListener('online', () => syncRemotePage(state.page));

    window.CashtopRecordPager = Object.freeze({
      pageSize: PAGE_SIZE,
      get page() { return state.page; },
      get pages() { return pageCount(); },
      next: () => goToPage(state.page + 1),
      previous: () => goToPage(state.page - 1),
      goToPage,
      syncPage: syncRemotePage
    });
  }

  // الملف يُحمّل بعد سكربت الصفحة، لذلك نركّب الـpager فوراً قبل DOMContentLoaded/load
  // حتى لا يرسم المتصفح مئات الصفوف ثم يعيد قصّها إلى 50.
  install();
})();
