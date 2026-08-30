(function () {
  'use strict';

  const CURRENCY_PRESETS = {
    'شيكل': { id: 'ILS', name: 'شيكل إسرائيلي', code: 'ILS', symbol: '₪' },
    'دولار': { id: 'USD', name: 'دولار أمريكي', code: 'USD', symbol: '$' },
    'دينار': { id: 'JOD', name: 'دينار أردني', code: 'JOD', symbol: 'JD' },
    'ريال': { id: 'SAR', name: 'ريال سعودي', code: 'SAR', symbol: 'SR' }
  };

  function safeJson(raw, fallback) {
    try { return JSON.parse(raw == null ? '' : raw); } catch (_) { return fallback; }
  }

  function readSettings() {
    const value = safeJson(localStorage.getItem('cashtop_settings'), {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function presetFor(value) {
    const key = String(value || '').trim();
    return CURRENCY_PRESETS[key] || Object.values(CURRENCY_PRESETS).find(item => item.id === key || item.code === key) || null;
  }

  function makeCurrency(input, index = 0) {
    const preset = presetFor(input?.id || input?.code || input?.name || input);
    const name = String(input?.name || preset?.name || input || `عملة ${index + 1}`).trim();
    const code = String(input?.code || preset?.code || input?.id || `CUR${index + 1}`).trim().toUpperCase();
    const id = String(input?.id || code || `CUR_${index + 1}`).trim();
    const symbol = String(input?.symbol || preset?.symbol || code).trim();
    const rate = Number(input?.ratePer100Base ?? input?.rate ?? (index === 0 ? 100 : 0));
    return { id, name, code, symbol, ratePer100Base: Number.isFinite(rate) && rate > 0 ? rate : (index === 0 ? 100 : 1) };
  }

  function getCurrencyConfig(settings = readSettings()) {
    const preset = presetFor(settings.currency) || CURRENCY_PRESETS['شيكل'];
    const baseId = String(settings.baseCurrencyId || preset.id || 'ILS');
    let currencies = Array.isArray(settings.currencies) ? settings.currencies.map(makeCurrency) : [];
    if (!currencies.length) currencies = [makeCurrency({ ...preset, id: baseId, ratePer100Base: 100 }, 0)];
    let base = currencies.find(item => String(item.id) === baseId || String(item.code) === baseId);
    if (!base) {
      base = makeCurrency({ ...preset, id: baseId, ratePer100Base: 100 }, 0);
      currencies.unshift(base);
    }
    base.ratePer100Base = 100;
    currencies = currencies.map((item, index) => ({ ...item, ratePer100Base: String(item.id) === String(base.id) ? 100 : Math.max(0.000001, Number(item.ratePer100Base || 1)) }));
    return { enabled: settings.multiCurrencyEnabled === true, baseCurrencyId: base.id, base, currencies };
  }

  function getCurrency(id, settings) {
    const cfg = getCurrencyConfig(settings);
    return cfg.currencies.find(item => String(item.id) === String(id) || String(item.code) === String(id)) || cfg.base;
  }

  function toBase(amount, currencyId, settings) {
    const cfg = getCurrencyConfig(settings);
    const currency = getCurrency(currencyId || cfg.baseCurrencyId, settings);
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return 0;
    if (String(currency.id) === String(cfg.baseCurrencyId)) return value;
    return value * 100 / Math.max(0.000001, Number(currency.ratePer100Base || 1));
  }

  function fromBase(amount, currencyId, settings) {
    const cfg = getCurrencyConfig(settings);
    const currency = getCurrency(currencyId || cfg.baseCurrencyId, settings);
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return 0;
    if (String(currency.id) === String(cfg.baseCurrencyId)) return value;
    return value * Math.max(0.000001, Number(currency.ratePer100Base || 1)) / 100;
  }

  function convert(amount, fromCurrencyId, toCurrencyId, settings) {
    return fromBase(toBase(amount, fromCurrencyId, settings), toCurrencyId, settings);
  }

  function currencySymbol(currencyId, settings) {
    return getCurrency(currencyId, settings).symbol || getCurrency(currencyId, settings).code || '';
  }

  // تسوية أي مبلغ بعملة العملية إلى عملة الصندوق المختار عبر العملة الأساسية.
  // مثال: دولار -> شيكل (أساسي) -> دينار، بدون اشتراط أن تكون عملة الصندوق هي عملة العملية.
  function settleToAccount(amount, transactionCurrencyId, accountOrCurrencyId, settings) {
    const cfg = getCurrencyConfig(settings);
    const accountCurrencyId = typeof accountOrCurrencyId === 'object'
      ? (accountOrCurrencyId?.currencyId || cfg.baseCurrencyId)
      : (accountOrCurrencyId || cfg.baseCurrencyId);
    const txCurrencyId = transactionCurrencyId || cfg.baseCurrencyId;
    const transactionAmount = Number(amount || 0);
    const baseAmount = toBase(transactionAmount, txCurrencyId, settings);
    const accountAmount = fromBase(baseAmount, accountCurrencyId, settings);
    return {
      transactionAmount: Number.isFinite(transactionAmount) ? transactionAmount : 0,
      transactionCurrencyId: txCurrencyId,
      baseAmount,
      accountAmount,
      accountCurrencyId,
      transactionCurrency: getCurrency(txCurrencyId, settings),
      accountCurrency: getCurrency(accountCurrencyId, settings)
    };
  }

  function accountAmountFromBase(baseAmount, accountOrCurrencyId, settings) {
    const cfg = getCurrencyConfig(settings);
    const accountCurrencyId = typeof accountOrCurrencyId === 'object'
      ? (accountOrCurrencyId?.currencyId || cfg.baseCurrencyId)
      : (accountOrCurrencyId || cfg.baseCurrencyId);
    return fromBase(baseAmount, accountCurrencyId, settings);
  }

  function normalizeUnitTemplate(unit, index = 0) {
    const raw = unit && typeof unit === 'object' ? unit : {};
    let chain = Array.isArray(raw.chain) ? raw.chain : (Array.isArray(raw.units) ? raw.units : []);
    if (!chain.length) {
      const baseName = String(raw.pieceName || raw.baseUnitName || 'قطعة').trim() || 'قطعة';
      const topName = String(raw.unitName || '').trim();
      const count = Math.max(1, Number(raw.piecesCount || raw.piecesPerUnit || 1));
      chain = [{ id: `${raw.id || `U_${index}`}_BASE`, name: baseName, factorToPrevious: 1, factorToBase: 1 }];
      if (topName && (count > 1 || topName !== baseName)) chain.push({ id: `${raw.id || `U_${index}`}_L1`, name: topName, factorToPrevious: count, factorToBase: count });
    }
    const normalized = [];
    let total = 1;
    chain.forEach((level, levelIndex) => {
      const name = String(level?.name || level?.unitName || (levelIndex === 0 ? raw.pieceName : raw.unitName) || `وحدة ${levelIndex + 1}`).trim();
      if (!name) return;
      const factorToPrevious = levelIndex === 0 ? 1 : Math.max(0.000001, Number(level?.factorToPrevious || level?.ratio || level?.piecesCount || 1));
      total = levelIndex === 0 ? 1 : total * factorToPrevious;
      normalized.push({
        id: String(level?.id || `${raw.id || `U_${index}`}_L${levelIndex}`),
        name,
        factorToPrevious,
        factorToBase: Math.max(0.000001, Number(level?.factorToBase || total)),
        salePrice: Number.isFinite(Number(level?.salePrice)) ? Number(level.salePrice) : undefined,
        barcode: String(level?.barcode || '')
      });
    });
    if (!normalized.length) normalized.push({ id: `${raw.id || `U_${index}`}_BASE`, name: 'قطعة', factorToPrevious: 1, factorToBase: 1 });
    // Recalculate from previous factors so nested conversion is deterministic.
    total = 1;
    normalized.forEach((level, levelIndex) => {
      if (levelIndex === 0) { level.factorToPrevious = 1; level.factorToBase = 1; }
      else { total *= Math.max(0.000001, Number(level.factorToPrevious || 1)); level.factorToBase = total; }
    });
    const base = normalized[0];
    const top = normalized[normalized.length - 1];
    return {
      ...raw,
      id: String(raw.id || `U_${Date.now()}_${index}`),
      name: String(raw.name || top.name || base.name),
      chain: normalized,
      pieceName: base.name,
      unitName: top.name,
      piecesCount: top.factorToBase,
      unitCode: undefined,
      pieceCode: undefined,
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  function normalizeUnits(units) {
    return (Array.isArray(units) ? units : []).filter(Boolean).map(normalizeUnitTemplate);
  }

  function normalizeProductChain(product) {
    const raw = product && typeof product === 'object' ? product : {};
    let chain = Array.isArray(raw.unitChain) && raw.unitChain.length ? raw.unitChain : [];
    if (!chain.length) {
      const baseName = String(raw.pieceName || 'قطعة').trim() || 'قطعة';
      const topName = String(raw.unitName || '').trim();
      const ppu = Math.max(1, Number(raw.piecesPerUnit || 1));
      chain = [{ id: 'piece', name: baseName, factorToPrevious: 1, factorToBase: 1, salePrice: Number(raw.pricePiece ?? raw.price ?? 0), barcode: String(raw.pieceBarcode || raw.barcode || '') }];
      if (topName && ppu > 1) chain.push({ id: 'unit', name: topName, factorToPrevious: ppu, factorToBase: ppu, salePrice: Number(raw.priceUnit || 0), barcode: String(raw.unitBarcode || '') });
    }
    const template = normalizeUnitTemplate({ id: raw.unitId || raw.id || 'PRODUCT', chain });
    const priceMap = raw.unitPrices && typeof raw.unitPrices === 'object' ? raw.unitPrices : {};
    template.chain = template.chain.map((level, index) => {
      let price = Number(level.salePrice);
      if (!Number.isFinite(price)) price = Number(priceMap[level.id]);
      if (!Number.isFinite(price) && index === 0) price = Number(raw.pricePiece ?? raw.price ?? 0);
      if (!Number.isFinite(price) && index === template.chain.length - 1) price = Number(raw.priceUnit || 0);
      if (!Number.isFinite(price)) price = Number(raw.pricePiece ?? raw.price ?? 0) * Number(level.factorToBase || 1);
      return { ...level, salePrice: Math.max(0, price) };
    });
    return template.chain;
  }

  function buildProductUnitChain(template, prices = {}, barcodes = {}) {
    const normalized = normalizeUnitTemplate(template);
    return normalized.chain.map((level, index) => {
      const byId = Number(prices[level.id]);
      const byIndex = Number(prices[index]);
      const salePrice = Number.isFinite(byId) ? byId : (Number.isFinite(byIndex) ? byIndex : Number(level.salePrice || 0));
      return { ...level, salePrice: Math.max(0, salePrice), barcode: String(barcodes[level.id] || level.barcode || '') };
    });
  }

  function unitById(product, unitId) {
    const chain = normalizeProductChain(product);
    return chain.find(level => String(level.id) === String(unitId)) || chain.find((_, index) => (unitId === 'piece' && index === 0) || (unitId === 'unit' && index === chain.length - 1)) || chain[0];
  }

  function factorForUnit(product, unitId) {
    return Math.max(0.000001, Number(unitById(product, unitId)?.factorToBase || 1));
  }

  function getProductUnitPrice(product, unitId, groupPrice) {
    const chain = normalizeProductChain(product);
    const unit = unitById(product, unitId);
    const saved = groupPrice && typeof groupPrice === 'object' ? groupPrice : {};
    const unitPrices = saved.units && typeof saved.units === 'object' ? saved.units : {};
    let special = Number(unitPrices[unit.id]);
    if (!Number.isFinite(special) && unit.id === chain[0].id) special = Number(saved.piece);
    if (!Number.isFinite(special) && unit.id === chain[chain.length - 1].id) special = Number(saved.unit);
    return Number.isFinite(special) && special >= 0 ? special : Math.max(0, Number(unit.salePrice || 0));
  }

  function chainText(chainOrTemplate) {
    const chain = Array.isArray(chainOrTemplate) ? normalizeUnitTemplate({ chain: chainOrTemplate }).chain : normalizeUnitTemplate(chainOrTemplate).chain;
    return chain.map((level, index) => index === 0 ? level.name : `${level.name} = ${level.factorToPrevious} ${chain[index - 1].name}`).join(' ← ');
  }

  function ensureAccountCurrency(account, settings) {
    if (!account || typeof account !== 'object') return account;
    const cfg = getCurrencyConfig(settings);
    if (!account.currencyId) account.currencyId = cfg.baseCurrencyId;
    return account;
  }

  function nativeToBaseForAccount(amount, account, settings) {
    return toBase(amount, ensureAccountCurrency(account, settings)?.currencyId, settings);
  }

  function formatMoney(amount, currencyId, settings, digits = 2) {
    const value = Number(amount || 0);
    const symbol = currencySymbol(currencyId, settings);
    return `${Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 3 }) : '0.00'} ${symbol}`.trim();
  }



  const MULTI_PAYMENT_VALUE = '__MULTI_PAYMENT__';
  let multiPaymentContext = null;
  const multiPaymentDrafts = new Map();

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  // R86: use the exact native site dropdown engine from cashtop-core.js.
  // These compatibility helpers remain because payment pages call them after
  // rebuilding options or setting a value programmatically.
  function ensureSiteDropdownStyles() {}
  function closeSiteDropdowns() { window.Cashtop?.closeTransientUi?.({ closeSidebar:true }); }
  function refreshEnhancedSelect(select) {
    if (!select || select.tagName !== 'SELECT') return;
    window.Cashtop?.enhanceAllSelects?.(select);
  }
  function enhanceSiteSelect(selectOrId) {
    const select = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
    if (!select || select.tagName !== 'SELECT') return null;
    window.Cashtop?.enhanceAllSelects?.(select);
    return select;
  }
  function enhanceTaggedSelects(root = document) {
    root.querySelectorAll?.('select[data-ct-site-dropdown="true"]').forEach(enhanceSiteSelect);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => enhanceTaggedSelects(document), { once:true });
  else queueMicrotask(() => enhanceTaggedSelects(document));

  function ensureMultiPaymentUi() {
    if (document.getElementById('ctMultiPaymentModal')) return;
    ensureSiteDropdownStyles();
    const style = document.createElement('style');
    style.id = 'ctMultiPaymentStyles';
    style.textContent = `
      #ctMultiPaymentModal{position:fixed;inset:0;z-index:30500;background:rgba(15,23,42,.60);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:12px;font-family:Cairo,Arial,sans-serif;direction:rtl}
      #ctMultiPaymentModal.active{display:flex;animation:ctMpFade .14s ease-out}
      #ctMultiPaymentModal .ct-mp-box{width:min(650px,98vw);max-height:92vh;overflow:hidden;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.30);display:flex;flex-direction:column;transform:translateZ(0);animation:ctMpPop .15s cubic-bezier(.2,.8,.2,1)}
      @keyframes ctMpFade{from{opacity:0}to{opacity:1}}@keyframes ctMpPop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
      #ctMultiPaymentModal .ct-mp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 18px;border-bottom:1px solid #f1f5f9;background:#fafafa}
      #ctMultiPaymentModal .ct-mp-title{font-size:16px;font-weight:900;color:#1e293b;display:flex;align-items:center;gap:9px}#ctMultiPaymentModal .ct-mp-title:before{content:'';width:7px;height:24px;border-radius:10px;background:#605ca8}
      #ctMultiPaymentModal .ct-mp-close{border:1px solid #f1f5f9;background:#fff;width:32px;height:32px;border-radius:9px;font-size:23px;line-height:1;color:#94a3b8;cursor:pointer;display:grid;place-items:center}
      #ctMultiPaymentModal .ct-mp-body{padding:14px 16px 8px;overflow:auto;overscroll-behavior:contain}
      #ctMultiPaymentModal .ct-mp-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:12px}
      #ctMultiPaymentModal .ct-mp-stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;text-align:center;min-width:0}
      #ctMultiPaymentModal .ct-mp-stat span{display:block;font-size:9px;color:#64748b;font-weight:800;margin-bottom:3px}#ctMultiPaymentModal .ct-mp-stat b{display:block;font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #ctMultiPaymentModal .ct-mp-invoice-summary{grid-template-columns:1fr 1fr;margin-bottom:14px}
      #ctMultiPaymentModal .ct-mp-invoice-summary .ct-mp-stat{border:2px dashed #c7d2fe;background:#eef2ff55;padding:12px}
      #ctMultiPaymentModal .ct-mp-invoice-summary .ct-mp-stat:last-child{border-color:#fecaca;background:#fff1f255}
      #ctMultiPaymentModal .ct-mp-invoice-summary .ct-mp-stat.complete{border-color:#a7f3d0;background:#ecfdf555}.ct-mp-invoice-summary .ct-mp-stat.over{border-color:#fde68a!important;background:#fffbeb!important}
      #ctMultiPaymentModal .ct-mp-section-head{display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #f1f5f9;border-radius:10px;padding:8px 10px;margin-bottom:9px}
      #ctMultiPaymentModal .ct-mp-section-head b{font-size:11px;color:#475569}#ctMultiPaymentModal .ct-mp-add{border:1px solid #e0e7ff;background:#fff;color:#605ca8;border-radius:8px;padding:6px 10px;font:800 10px Cairo;cursor:pointer;display:flex;align-items:center;gap:5px}
      #ctMultiPaymentModal .ct-mp-rows{display:flex;flex-direction:column;gap:8px;padding-bottom:4px}
      #ctMultiPaymentModal .ct-mp-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 40px;gap:8px;align-items:center;position:relative}
      #ctMultiPaymentModal .ct-mp-field{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:6px 10px;min-width:0;box-shadow:0 1px 2px rgba(15,23,42,.03)}
      #ctMultiPaymentModal .ct-mp-field>label{display:block;font-size:9px;font-weight:800;color:#94a3b8;margin-bottom:1px}
      #ctMultiPaymentModal .ct-mp-field input{width:100%;height:27px;border:0!important;background:transparent;padding:0;font:800 13px Cairo;color:#1e293b;outline:none!important;box-shadow:none!important;text-align:right}
      #ctMultiPaymentModal .ct-mp-field select{width:100%;min-height:28px;border:0!important;background:transparent!important;padding:0 2px!important;font:800 12px Cairo!important;color:#1e293b!important;box-shadow:none!important}
      #ctMultiPaymentModal .ct-mp-hint{font-size:8.5px;color:#64748b;line-height:1.45;margin-top:2px;min-height:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #ctMultiPaymentModal .ct-mp-remove{width:38px;height:40px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc;color:#94a3b8;cursor:pointer;transition:.14s}.ct-mp-remove:hover{background:#fff1f2!important;border-color:#fecdd3!important;color:#e11d48!important}
      #ctMultiPaymentModal .ct-mp-message{font-size:9.5px;color:#64748b;line-height:1.65;margin-top:9px}
      #ctMultiPaymentModal .ct-mp-footer{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #f1f5f9;padding:12px 16px;background:#fafafa}
      #ctMultiPaymentModal .ct-mp-btn{border:0;border-radius:11px;padding:10px 18px;font:900 11px Cairo;cursor:pointer}.ct-mp-cancel{background:#fff!important;color:#64748b!important;border:1px solid #e2e8f0!important}.ct-mp-save{background:#605ca8!important;color:#fff!important}
      @media(max-width:560px){#ctMultiPaymentModal{padding:7px}#ctMultiPaymentModal .ct-mp-box{width:100%;max-height:94vh;border-radius:16px}#ctMultiPaymentModal .ct-mp-summary{grid-template-columns:1fr 1fr}#ctMultiPaymentModal .ct-mp-summary:not(.ct-mp-invoice-summary) .ct-mp-stat:last-child{grid-column:1/-1}#ctMultiPaymentModal .ct-mp-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 34px;gap:5px}#ctMultiPaymentModal .ct-mp-field{padding:5px 8px}#ctMultiPaymentModal .ct-mp-remove{width:34px;height:38px}}
      @media(prefers-reduced-motion:reduce){#ctMultiPaymentModal.active,#ctMultiPaymentModal .ct-mp-box{animation:none!important}}
    `;
    document.head.appendChild(style);
    const modal = document.createElement('div');
    modal.id = 'ctMultiPaymentModal';
    modal.innerHTML = `
      <div class="ct-mp-box" role="dialog" aria-modal="true">
        <div class="ct-mp-head"><div class="ct-mp-title"><span id="ctMpTitle">تفاصيل السداد</span></div><button type="button" class="ct-mp-close" id="ctMpClose">×</button></div>
        <div class="ct-mp-body">
          <div class="ct-mp-summary ct-mp-invoice-summary" id="ctMpInvoiceSummary">
            <div class="ct-mp-stat"><span id="ctMpInvoiceLabel">مبلغ الفاتورة</span><b id="ctMpInvoiceAmount">0</b></div>
            <div class="ct-mp-stat" id="ctMpRemainingCard"><span id="ctMpRemainingLabel">مكتمل</span><b id="ctMpRemaining">0</b></div>
          </div>
          <div class="ct-mp-section-head"><b>سجل المدفوعات</b><button type="button" class="ct-mp-add" id="ctMpAdd"><i class="fa-solid fa-plus"></i> إضافة دفعة</button></div>
          <div class="ct-mp-rows" id="ctMpRows"></div>
          <div class="ct-mp-message" id="ctMpMessage"></div>
        </div>
        <div class="ct-mp-footer"><button type="button" class="ct-mp-btn ct-mp-cancel" id="ctMpCancel">إلغاء</button><button type="button" class="ct-mp-btn ct-mp-save" id="ctMpSave"><i class="fa-solid fa-check"></i> حفظ وتأكيد</button></div>
      </div>`;
    document.body.appendChild(modal);
    const close = (reason = 'dismiss') => {
      const ctx = multiPaymentContext;
      if (ctx?.draftKey) {
        if (reason === 'cancel') multiPaymentDrafts.delete(ctx.draftKey);
        else {
          try { multiPaymentDrafts.set(ctx.draftKey, readMultiPaymentRows().map(item => ({...item}))); } catch (_) {}
        }
      }
      modal.classList.remove('active');
      multiPaymentContext = null;
      try { ctx?.onClose?.({ reason, preserved: reason !== 'cancel' }); } catch (_) {}
    };
    document.getElementById('ctMpClose').addEventListener('click', () => close('dismiss'));
    document.getElementById('ctMpCancel').addEventListener('click', () => close('cancel'));
    modal.addEventListener('click', event => { if (event.target === modal) close('dismiss'); });
    document.getElementById('ctMpAdd').addEventListener('click', () => addMultiPaymentRow({}));
    document.getElementById('ctMpSave').addEventListener('click', saveMultiPaymentModal);
  }

  function multiPaymentAccountOptions(selectedId = '') {
    const ctx = multiPaymentContext || {};
    return (ctx.accounts || []).map(account => {
      const currency = getCurrency(account.currencyId || getCurrencyConfig().baseCurrencyId);
      const selected = String(account.id) === String(selectedId) ? ' selected' : '';
      return `<option value="${escapeHtml(account.id)}"${selected}>${escapeHtml(account.name || 'طريقة دفع')} — ${Number(account.balance || 0).toFixed(2)} ${escapeHtml(currency.symbol || currency.code)}</option>`;
    }).join('');
  }

  function addMultiPaymentRow(split = {}) {
    const rows = document.getElementById('ctMpRows');
    if (!rows || !multiPaymentContext) return;
    const row = document.createElement('div');
    row.className = 'ct-mp-row';
    const fallbackAccount = (multiPaymentContext.accounts || [])[0];
    const accountId = split.accountId || fallbackAccount?.id || '';
    const amount = Number(split.transactionAmount ?? split.amount ?? 0);
    row.innerHTML = `
      <div class="ct-mp-field"><label>طريقة الدفع</label><select class="ct-mp-account" data-ct-site-dropdown="true" data-ct-icon="fa-wallet">${multiPaymentAccountOptions(accountId)}</select><div class="ct-mp-hint ct-mp-account-hint"></div></div>
      <div class="ct-mp-field"><label>المبلغ المدفوع</label><input class="ct-mp-amount" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" value="${Number.isFinite(amount) && amount > 0 ? amount : ''}"><div class="ct-mp-hint ct-mp-amount-hint"></div></div>
      <button type="button" class="ct-mp-remove" title="حذف طريقة الدفع"><i class="fa-solid fa-trash-can"></i></button>`;
    rows.appendChild(row);
    enhanceSiteSelect(row.querySelector('.ct-mp-account'));
    row.querySelector('.ct-mp-remove').addEventListener('click', () => { row.remove(); updateMultiPaymentUi(); });
    row.querySelector('.ct-mp-account').addEventListener('change', updateMultiPaymentUi);
    row.querySelector('.ct-mp-amount').addEventListener('input', updateMultiPaymentUi);
    updateMultiPaymentUi();
  }

  function readMultiPaymentRows() {
    const ctx = multiPaymentContext || {};
    return [...document.querySelectorAll('#ctMpRows .ct-mp-row')].map(row => {
      const accountId = row.querySelector('.ct-mp-account')?.value || '';
      const account = (ctx.accounts || []).find(item => String(item.id) === String(accountId));
      const transactionAmount = Math.max(0, Number(row.querySelector('.ct-mp-amount')?.value || 0));
      const settlement = account ? settleToAccount(transactionAmount, ctx.transactionCurrencyId, account) : null;
      return account && settlement ? {
        accountId: account.id,
        accountName: account.name || 'طريقة دفع',
        transactionAmount,
        transactionCurrencyId: ctx.transactionCurrencyId,
        baseAmount: Number(settlement.baseAmount || 0),
        accountAmount: Number(settlement.accountAmount || 0),
        accountCurrencyId: settlement.accountCurrencyId
      } : null;
    }).filter(Boolean);
  }

  function updateMultiPaymentUi() {
    const ctx = multiPaymentContext;
    if (!ctx) return;
    const cfg = getCurrencyConfig();
    const transactionCurrency = getCurrency(ctx.transactionCurrencyId || cfg.baseCurrencyId);
    const rows = [...document.querySelectorAll('#ctMpRows .ct-mp-row')];
    rows.forEach(row => {
      const accountId = row.querySelector('.ct-mp-account')?.value || '';
      const account = (ctx.accounts || []).find(item => String(item.id) === String(accountId));
      const amount = Math.max(0, Number(row.querySelector('.ct-mp-amount')?.value || 0));
      const accountHint = row.querySelector('.ct-mp-account-hint');
      const amountHint = row.querySelector('.ct-mp-amount-hint');
      if (!account) return;
      const accountCurrency = getCurrency(account.currencyId || cfg.baseCurrencyId);
      const settlement = settleToAccount(amount, ctx.transactionCurrencyId, account);
      if (accountHint) accountHint.textContent = `الرصيد: ${Number(account.balance || 0).toFixed(2)} ${accountCurrency.symbol || accountCurrency.code}`;
      if (amountHint) amountHint.textContent = `${ctx.direction === 'in' ? 'سيضاف' : 'سيخصم'} ${Number(settlement.accountAmount || 0).toFixed(3).replace(/\.?0+$/,'')} ${accountCurrency.symbol || accountCurrency.code}`;
    });
    const splits = readMultiPaymentRows();
    const totalNative = splits.reduce((sum, item) => sum + Number(item.transactionAmount || 0), 0);
    const totalEl = document.getElementById('ctMpTotal');
    if (totalEl) totalEl.textContent = `${Number(totalNative).toFixed(3).replace(/\.?0+$/,'')} ${transactionCurrency.symbol || transactionCurrency.code}`;
    const targetAmount = ctx.showInvoiceSummary
      ? Number(ctx.invoiceAmount || 0)
      : (ctx.requireExact ? Number(ctx.exactTransactionAmount || 0) : (Number.isFinite(Number(ctx.maxTransactionAmount)) ? Number(ctx.maxTransactionAmount) : 0));
    const remainingValue = targetAmount - totalNative;
    const remainingEl = document.getElementById('ctMpRemaining');
    const remainingLabel = document.getElementById('ctMpRemainingLabel');
    if (remainingEl) remainingEl.textContent = `${Math.abs(remainingValue).toFixed(3).replace(/\.?0+$/,'')} ${transactionCurrency.symbol || transactionCurrency.code}`;
    const remainingCard = document.getElementById('ctMpRemainingCard');
    remainingCard?.classList.remove('complete','over');
    if (remainingValue < -1e-9) { if (remainingLabel) remainingLabel.textContent = ctx.showInvoiceSummary ? 'الباقي للعميل' : 'الزيادة'; remainingCard?.classList.add('over'); }
    else if (Math.abs(remainingValue) <= 1e-9) { if (remainingLabel) remainingLabel.textContent = 'مكتمل'; remainingCard?.classList.add('complete'); }
    else if (remainingLabel) remainingLabel.textContent = 'المتبقي';
    const message = document.getElementById('ctMpMessage');
    if (message) {
      if (ctx.requireExact) message.textContent = `يجب أن يساوي الإجمالي ${Number(ctx.exactTransactionAmount || 0).toFixed(3).replace(/\.?0+$/,'')} ${transactionCurrency.symbol || transactionCurrency.code}.`;
      else if (ctx.enforceMaximum && Number.isFinite(Number(ctx.maxTransactionAmount))) message.textContent = `الحد الأعلى ${Number(ctx.maxTransactionAmount || 0).toFixed(3).replace(/\.?0+$/,'')} ${transactionCurrency.symbol || transactionCurrency.code}.`;
      else message.textContent = 'يمكن توزيع المبلغ على أكثر من طريقة دفع حتى لو اختلفت العملات.';
    }
  }

  function saveMultiPaymentModal() {
    const ctx = multiPaymentContext;
    if (!ctx) return;
    const splits = readMultiPaymentRows().filter(item => item.transactionAmount > 0);
    if (!splits.length) { window.Cashtop?.showToast?.('أدخل مبلغاً في طريقة دفع واحدة على الأقل.', 'error'); return; }
    const ids = splits.map(item => String(item.accountId));
    if (new Set(ids).size !== ids.length) { window.Cashtop?.showToast?.('لا يمكن تكرار طريقة الدفع نفسها أكثر من مرة.', 'error'); return; }
    const totalNative = splits.reduce((sum, item) => sum + Number(item.transactionAmount || 0), 0);
    const tolerance = 1e-6;
    if (ctx.enforceMaximum && Number.isFinite(Number(ctx.maxTransactionAmount)) && totalNative - Number(ctx.maxTransactionAmount) > tolerance) {
      window.Cashtop?.showToast?.('إجمالي طرق الدفع أكبر من الحد المحدد لهذه العملية.', 'error'); return;
    }
    if (ctx.requireExact && Math.abs(totalNative - Number(ctx.exactTransactionAmount || 0)) > tolerance) {
      window.Cashtop?.showToast?.('إجمالي المبالغ يجب أن يساوي قيمة العملية.', 'error'); return;
    }
    if (ctx.direction === 'out') {
      const insufficient = splits.find(split => {
        const account = (ctx.accounts || []).find(item => String(item.id) === String(split.accountId));
        return !account || Number(split.accountAmount || 0) - Number(account.balance || 0) > tolerance;
      });
      if (insufficient) {
        const account = (ctx.accounts || []).find(item => String(item.id) === String(insufficient.accountId));
        window.Cashtop?.showToast?.(`رصيد طريقة الدفع [${account?.name || 'المحددة'}] غير كافٍ.`, 'error'); return;
      }
    }
    try { ctx.onSave?.(splits, totalNative); } catch (error) { console.error(error); window.Cashtop?.showToast?.(error?.message || 'تعذر حفظ الدفع المتعدد.', 'error'); return; }
    if (ctx.draftKey) multiPaymentDrafts.delete(ctx.draftKey);
    document.getElementById('ctMultiPaymentModal')?.classList.remove('active');
    multiPaymentContext = null;
  }

  function openMultiPayment(options = {}) {
    ensureMultiPaymentUi();
    const cfg = getCurrencyConfig();
    const accounts = Array.isArray(options.accounts) ? options.accounts.filter(account => Boolean(account) && account.disabled !== true && account.active !== false && String(account.status || '').toLowerCase() !== 'inactive') : [];
    if (!accounts.length) { window.Cashtop?.showToast?.('لا توجد طرق دفع متاحة.', 'error'); return false; }
    const transactionCurrencyId = options.transactionCurrencyId || cfg.baseCurrencyId;
    const draftKey = String(options.draftKey || [
      options.title || 'multi-payment', options.direction || 'in', transactionCurrencyId,
      Number(options.exactTransactionAmount || 0), Number(options.maxTransactionAmount || 0), Number(options.invoiceAmount || 0),
      accounts.map(account => String(account.id)).join(',')
    ].join('|'));
    multiPaymentContext = {
      accounts,
      draftKey,
      transactionCurrencyId,
      maxTransactionAmount: Number.isFinite(Number(options.maxTransactionAmount)) ? Math.max(0, Number(options.maxTransactionAmount)) : null,
      enforceMaximum: options.enforceMaximum === true,
      exactTransactionAmount: Number.isFinite(Number(options.exactTransactionAmount)) ? Math.max(0, Number(options.exactTransactionAmount)) : 0,
      requireExact: options.requireExact === true,
      direction: options.direction === 'out' ? 'out' : 'in',
      showInvoiceSummary: options.showInvoiceSummary === true,
      invoiceAmount: Number.isFinite(Number(options.invoiceAmount)) ? Math.max(0, Number(options.invoiceAmount)) : (Number.isFinite(Number(options.maxTransactionAmount)) ? Math.max(0, Number(options.maxTransactionAmount)) : 0),
      onSave: typeof options.onSave === 'function' ? options.onSave : null,
      onClose: typeof options.onClose === 'function' ? options.onClose : null
    };
    const currency = getCurrency(multiPaymentContext.transactionCurrencyId);
    const summaryTarget = multiPaymentContext.showInvoiceSummary
      ? Number(multiPaymentContext.invoiceAmount || 0)
      : (multiPaymentContext.requireExact ? Number(multiPaymentContext.exactTransactionAmount || 0) : Number(multiPaymentContext.maxTransactionAmount || 0));
    const invoiceLabel = document.getElementById('ctMpInvoiceLabel');
    if (invoiceLabel) invoiceLabel.textContent = multiPaymentContext.showInvoiceSummary ? 'مبلغ الفاتورة' : 'مبلغ العملية';
    const invoiceAmountEl = document.getElementById('ctMpInvoiceAmount');
    if (invoiceAmountEl) invoiceAmountEl.textContent = `${summaryTarget.toFixed(3).replace(/\.?0+$/,'')} ${currency.symbol || currency.code}`;
    document.getElementById('ctMpTitle').textContent = options.title || 'تفاصيل السداد';
    const rows = document.getElementById('ctMpRows');
    rows.innerHTML = '';
    const explicitInitial = Array.isArray(options.initialSplits) && options.initialSplits.length ? options.initialSplits : null;
    const preservedInitial = !explicitInitial && multiPaymentDrafts.get(draftKey)?.length ? multiPaymentDrafts.get(draftKey) : null;
    const initial = explicitInitial || preservedInitial || [{ accountId: accounts[0]?.id, transactionAmount: options.defaultTransactionAmount || 0 }];
    initial.forEach(split => addMultiPaymentRow(split));
    document.getElementById('ctMultiPaymentModal').classList.add('active');
    updateMultiPaymentUi();
    return true;
  }
  window.CashtopMulti = {
    readSettings,
    getCurrencyConfig,
    getCurrency,
    toBase,
    fromBase,
    convert,
    currencySymbol,
    settleToAccount,
    accountAmountFromBase,
    formatMoney,
    normalizeUnitTemplate,
    normalizeUnits,
    normalizeProductChain,
    buildProductUnitChain,
    unitById,
    factorForUnit,
    getProductUnitPrice,
    chainText,
    ensureAccountCurrency,
    nativeToBaseForAccount,
    MULTI_PAYMENT_VALUE,
    enhanceSiteSelect,
    refreshEnhancedSelect,
    enhanceTaggedSelects,
    openMultiPayment
  };
})();
