(function () {
  'use strict';
  if (!window.Cashtop) return;

  const SOURCE_KEYS = new Set([
    'cashtop_invoices', 'cashtop_sales_reversals', 'cashtop_sales_returns', 'cashtop_purchases', 'cashtop_purchase_reversals', 'cashtop_purchase_returns',
    'cashtop_expenses', 'cashtop_vouchers', 'cashtop_workers', 'cashtop_journal_reversal_archive'
  ]);

  const parse = (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  };
  const n = value => Number.parseFloat(value) || 0;
  const text = (value, fallback = '') => (value == null || value === '') ? fallback : String(value);

  function line(entryId, sourceType, sourceId, date, accountCode, accountName, debit, credit, description, extra = {}) {
    return {
      id: `${entryId}_${accountCode}_${Math.random().toString(36).slice(2, 7)}`,
      entryId,
      sourceType,
      sourceId,
      date: date || new Date().toISOString(),
      accountCode,
      accountName,
      debit: Number(n(debit).toFixed(2)),
      credit: Number(n(credit).toFixed(2)),
      description,
      ...extra
    };
  }

  function invoiceCost(invoice) {
    return (invoice.items || []).reduce((sum, item) => {
      const quantity = n(item.qty);
      const factor = window.CashtopMulti?.factorForUnit?.(item, item.selectedUnit)
        ?? (item.selectedUnit === 'unit' ? n(item.piecesPerUnit || 1) : 1);
      const pieces = quantity * Math.max(0.000001, n(factor) || 1);
      const allocations = Array.isArray(item.lotAllocations) ? item.lotAllocations : [];
      if (allocations.length) {
        const allocatedPieces = allocations.reduce((total, row) => total + Math.max(0, n(row.quantityPieces)), 0);
        const allocatedCost = allocations.reduce((total, row) => total + Math.max(0, n(row.quantityPieces)) * Math.max(0, n(row.cost)), 0);
        const fallbackCost = Number.isFinite(Number(item.costPerPiece)) ? n(item.costPerPiece) : n(item.cost || item.costPrice || 0);
        return sum + allocatedCost + Math.max(0, pieces - allocatedPieces) * fallbackCost;
      }
      const costPerPiece = Number.isFinite(Number(item.costPerPiece))
        ? n(item.costPerPiece)
        : n(item.cost || item.costPrice || 0);
      return sum + pieces * costPerPiece;
    }, 0);
  }

  function salePaymentLines(inv) {
    const paid = Math.max(0, n(inv?.paid));
    if (!paid) return [];
    if (Array.isArray(inv?.payments) && inv.payments.length) {
      const rows = inv.payments.map(payment => ({
        accountCode: text(payment.accountId, 'ACC_CASH_MAIN'),
        accountName: text(payment.accountName, 'الصندوق / الحساب'),
        amount: Math.max(0, n(payment.baseAmount || payment.amountBase || 0))
      })).filter(row => row.amount > 0);
      const assigned = rows.reduce((sum, row) => sum + row.amount, 0);
      if (assigned + 0.01 < paid) rows.push({ accountCode: text(inv.accountId, 'ACC_CASH_MAIN'), accountName: text(inv.accountName, 'الصندوق / الحساب'), amount: paid - assigned });
      return rows;
    }
    return [{ accountCode: text(inv.accountId, 'ACC_CASH_MAIN'), accountName: text(inv.accountName, 'الصندوق / الحساب'), amount: paid }];
  }

  function appendSaleJournal(journal, inv, options = {}) {
    if (!inv || typeof inv !== 'object' || inv.status === 'draft') return;
    const id = text(inv.id, `INV_${Date.now()}`);
    const total = n(inv.total);
    const paid = Math.min(total, n(inv.paid));
    const debt = Math.max(0, n(inv.debt || (total - paid)));
    const date = options.date || inv.date;
    const customer = text(inv.customer, 'عميل نقدي');
    const reversed = options.reversed === true;
    const sourceType = reversed ? 'sale-reversal' : 'sale';
    const entryId = reversed ? `JE_SALE_REV_${id}_${text(options.reversalId, Date.now())}` : `JE_SALE_${id}`;
    const branchId = text(inv.branchId, 'MAIN');
    const party = { branchId, partyType: 'customer', partyId: inv.customerId || null, partyName: customer };
    const payments = salePaymentLines({ ...inv, paid });

    if (!reversed) {
      payments.forEach((payment, index) => journal.push(line(entryId, sourceType, id, date, payment.accountCode, payment.accountName, payment.amount, 0, `المبلغ المقبوض من فاتورة البيع ${id}`, { ...party, paymentIndex: index })));
      if (debt) journal.push(line(entryId, sourceType, id, date, '1100', 'ذمم العملاء', debt, 0, `المبلغ الآجل من فاتورة البيع ${id}`, party));
      if (total) journal.push(line(entryId, sourceType, id, date, '4100', 'إيرادات المبيعات', 0, total, `إثبات فاتورة البيع ${id}`, party));
    } else {
      if (total) journal.push(line(entryId, sourceType, id, date, '4100', 'إيرادات المبيعات', total, 0, `عكس إيراد فاتورة البيع المحذوفة ${id}`, party));
      payments.forEach((payment, index) => journal.push(line(entryId, sourceType, id, date, payment.accountCode, payment.accountName, 0, payment.amount, `عكس التحصيل لفاتورة البيع المحذوفة ${id}`, { ...party, paymentIndex: index })));
      if (debt) journal.push(line(entryId, sourceType, id, date, '1100', 'ذمم العملاء', 0, debt, `عكس ذمة العميل لفاتورة البيع المحذوفة ${id}`, party));
    }

    const cost = invoiceCost(inv);
    if (!cost) return;
    const costEntryId = `${entryId}_COGS`;
    if (!reversed) {
      journal.push(line(costEntryId, 'sale-cost', id, date, '5100', 'تكلفة البضاعة المباعة', cost, 0, `تكلفة أصناف فاتورة البيع ${id}`, { branchId }));
      journal.push(line(costEntryId, 'sale-cost', id, date, '1200', 'المخزون', 0, cost, `إخراج مخزون فاتورة البيع ${id}`, { branchId }));
    } else {
      journal.push(line(costEntryId, 'sale-cost-reversal', id, date, '1200', 'المخزون', cost, 0, `عكس تكلفة مخزون فاتورة البيع المحذوفة ${id}`, { branchId }));
      journal.push(line(costEntryId, 'sale-cost-reversal', id, date, '5100', 'تكلفة البضاعة المباعة', 0, cost, `عكس تكلفة البضاعة المباعة لفاتورة ${id}`, { branchId }));
    }
  }

  function purchasePaymentLines(inv, paid) {
    if (!(paid > 0)) return [];
    if (Array.isArray(inv?.payments) && inv.payments.length) {
      const rows = inv.payments.map(payment => ({
        accountCode: text(payment.accountId, '2995'),
        accountName: text(payment.accountName, 'الصندوق / الحساب'),
        amount: Math.max(0, n(payment.baseAmount || 0))
      })).filter(row => row.amount > 0);
      const assigned = rows.reduce((sum, row) => sum + row.amount, 0);
      if (assigned + 0.01 < paid) rows.push({ accountCode: inv.accountId ? text(inv.accountId) : '2995', accountName: inv.accountId ? text(inv.accountName, 'الصندوق / الحساب') : 'تسوية مدفوعة خارج الصندوق', amount: paid - assigned });
      return rows;
    }
    if (inv.accountId && !String(inv.accountId).startsWith('__')) return [{ accountCode: text(inv.accountId), accountName: text(inv.accountName, 'الصندوق / الحساب'), amount: paid }];
    return [{ accountCode: '2995', accountName: 'تسوية مدفوعة خارج الصندوق', amount: paid }];
  }

  function appendPurchaseJournal(journal, inv, options = {}) {
    if (!inv || typeof inv !== 'object') return;
    const id = text(inv.id, `PUR_${Date.now()}`);
    const total = n(inv.total);
    const paid = Math.min(total, n(inv.paid));
    const debt = Math.max(0, n(inv.debt || (total - paid)));
    const date = options.date || inv.date;
    const supplier = text(inv.supplierName, inv.supplierId ? 'مورد' : 'بدون مورد');
    const supplierCode = inv.supplierId ? '2100' : '2190';
    const supplierAccountName = inv.supplierId ? 'ذمم الموردين' : 'ذمم مشتريات بدون مورد';
    const reversed = options.reversed === true;
    const entryId = reversed ? `JE_PUR_REV_${id}_${text(options.reversalId, Date.now())}` : `JE_PUR_${id}`;
    const sourceType = reversed ? 'purchase-reversal' : 'purchase';
    const branchId = text(inv.branchId, 'MAIN');
    const party = { branchId, partyType: inv.supplierId ? 'supplier' : 'other', partyId: inv.supplierId || null, partyName: supplier };
    const payments = purchasePaymentLines(inv, paid);
    if (!reversed) {
      if (total) journal.push(line(entryId, sourceType, id, date, '1200', 'المخزون', total, 0, `إثبات فاتورة المشتريات ${id}`, party));
      payments.forEach((payment,index) => journal.push(line(entryId, sourceType, id, date, payment.accountCode, payment.accountName, 0, payment.amount, `المبلغ المدفوع لفاتورة المشتريات ${id}`, { ...party, paymentIndex:index })));
      if (debt) journal.push(line(entryId, sourceType, id, date, supplierCode, supplierAccountName, 0, debt, `المبلغ الآجل من فاتورة المشتريات ${id}`, party));
      return;
    }
    payments.forEach((payment,index) => journal.push(line(entryId, sourceType, id, date, payment.accountCode, payment.accountName, payment.amount, 0, `عكس المبلغ المدفوع لفاتورة المشتريات ${id}`, { ...party, paymentIndex:index })));
    if (debt) journal.push(line(entryId, sourceType, id, date, supplierCode, supplierAccountName, debt, 0, `عكس التزام فاتورة المشتريات ${id}`, party));
    if (total) journal.push(line(entryId, sourceType, id, date, '1200', 'المخزون', 0, total, `عكس مخزون فاتورة المشتريات ${id}`, party));
  }

  function buildJournal() {
    const journal = [];

    const sales = parse('cashtop_invoices').filter(inv => inv && inv.status !== 'draft');
    const liveSaleIds = new Set(sales.map(inv => String(inv?.id || '')));
    sales.forEach(inv => appendSaleJournal(journal, inv));

    parse('cashtop_sales_reversals').forEach(record => {
      const inv = record?.originalInvoice || record?.invoice;
      if (!inv) return;
      if (!liveSaleIds.has(String(inv.id || ''))) appendSaleJournal(journal, inv);
      appendSaleJournal(journal, inv, { reversed: true, date: record.reversedAt || record.date || new Date().toISOString(), reversalId: record.id });
    });

    const purchases = parse('cashtop_purchases');
    const livePurchaseIds = new Set(purchases.map(inv => String(inv?.id || '')));
    purchases.forEach(inv => appendPurchaseJournal(journal, inv));

    parse('cashtop_purchase_reversals').forEach(record => {
      const inv = record?.originalInvoice || record?.invoice;
      if (!inv) return;
      if (!livePurchaseIds.has(String(inv.id || ''))) appendPurchaseJournal(journal, inv);
      appendPurchaseJournal(journal, inv, { reversed: true, date: record.reversedAt || record.date || new Date().toISOString(), reversalId: record.id });
    });

    parse('cashtop_sales_returns').forEach(ret => {
      const id = text(ret.id || ret.refNumber, `SRET_${Date.now()}`);
      const total = Math.max(0, n(ret.totalValue || ret.total || ret.amount));
      if (!total) return;
      const date = ret.date || ret.createdAt;
      const branchId = text(ret.branchId, 'MAIN');
      const customer = text(ret.customerName || ret.customer, 'عميل');
      const party = { branchId, partyType: 'customer', partyId: ret.customerId || null, partyName: customer };
      const entryId = `JE_SRET_${id}`;
      journal.push(line(entryId, 'sales-return', id, date, '4200', 'مردودات المبيعات', total, 0, `إثبات مرتجع المبيعات ${id}`, party));
      if (String(ret.sourceType || ret.returnSource || '') === 'customer_balance') {
        journal.push(line(entryId, 'sales-return', id, date, '2200', 'أرصدة العملاء', 0, total, `إضافة قيمة مرتجع ${id} إلى رصيد العميل ${customer}`, party));
      } else {
        journal.push(line(entryId, 'sales-return', id, date, text(ret.accountId, 'ACC_CASH_MAIN'), text(ret.accountName, 'الصندوق / الحساب'), 0, total, `رد نقدية مرتجع المبيعات ${id}`, party));
      }
      const cost = (ret.items || []).reduce((sum, item) => {
        const qty = Math.max(0, n(item.qty || item.inputQty));
        const factor = Math.max(0.000001, n(item.factorToBase || item.piecesPerUnit || 1) || 1);
        const costPerPiece = Math.max(0, n(item.costPerPiece || item.cost || 0));
        return sum + qty * factor * costPerPiece;
      }, 0);
      if (cost) {
        const costEntryId = `${entryId}_COGS`;
        journal.push(line(costEntryId, 'sales-return', id, date, '1200', 'المخزون', cost, 0, `إعادة مخزون مرتجع المبيعات ${id}`, { branchId }));
        journal.push(line(costEntryId, 'sales-return', id, date, '5100', 'تكلفة البضاعة المباعة', 0, cost, `عكس تكلفة الأصناف المرتجعة ${id}`, { branchId }));
      }
    });

    parse('cashtop_purchase_returns').forEach(ret => {
      const id = text(ret.id || ret.refNumber, `PRET_${Date.now()}`);
      const total = n(ret.totalValue || ret.total || ret.amount);
      const received = n(ret.receivedCash || ret.received || ret.paid || ret.cashReceived);
      const due = Math.max(0, n(ret.debtDeducted || ret.debt || ret.due || (total - received)));
      const entryId = `JE_PRET_${id}`;
      const branchId = text(ret.branchId, 'MAIN');
      const party = { branchId, partyType: ret.supplierId ? 'supplier' : 'other', partyId: ret.supplierId || null, partyName: text(ret.supplierName, ret.supplierId ? 'مورد' : 'بدون مورد') };
      if (received) journal.push(line(entryId, 'purchase-return', id, ret.date, text(ret.accountId, 'ACC_CASH_MAIN'), 'الصندوق / الحساب', received, 0, `نقدية مستردة من مرتجع المشتريات ${id}`, party));
      if (due) journal.push(line(entryId, 'purchase-return', id, ret.date, ret.supplierId ? '2100' : '2190', ret.supplierId ? 'ذمم الموردين' : 'ذمم مشتريات بدون مورد', due, 0, `تخفيض ذمة المورد بمرتجع ${id}`, party));
      if (total) journal.push(line(entryId, 'purchase-return', id, ret.date, '1200', 'المخزون', 0, total, `إخراج مخزون مرتجع المشتريات ${id}`, party));
    });

    parse('cashtop_expenses').forEach(exp => {
      const id = text(exp.id, `EXP_${Date.now()}`);
      const amount = n(exp.amount);
      if (!amount) return;
      const entryId = `JE_EXP_${id}`;
      const branch = { branchId: text(exp.branchId, 'MAIN') };
      journal.push(line(entryId, 'expense', id, exp.date, exp.sourceType === 'wastage' ? '5300' : '5200', text(exp.name, 'مصروف تشغيلي'), amount, 0, `إثبات المصروف ${text(exp.name, id)}`, branch));
      if (exp.nonCash === true || exp.sourceType === 'wastage') {
        journal.push(line(entryId, 'expense', id, exp.date, '1200', 'المخزون', 0, amount, `إخراج مخزون هالك ${text(exp.name, id)}`, branch));
      } else {
        journal.push(line(entryId, 'expense', id, exp.date, text(exp.accountId, 'ACC_CASH_MAIN'), 'الصندوق / الحساب', 0, amount, `صرف المصروف ${text(exp.name, id)}`, branch));
      }
    });

    parse('cashtop_vouchers').forEach(v => {
      const id = text(v.id || v.refNumber, `V_${Date.now()}`);
      const amount = n(v.amount);
      if (!amount) return;
      const entryId = `JE_V_${id}`;
      const cashCode = text(v.accountId, 'ACC_CASH_MAIN');
      const partyName = text(v.relationName, 'جهة أخرى');
      const party = { branchId: text(v.branchId, 'MAIN'), partyType: v.relationType || 'other', partyId: v.relationId || null, partyName };
      let counterCode = '2990';
      let counterName = 'حسابات متنوعة';
      if (v.relationType === 'client') { counterCode = '1100'; counterName = 'ذمم العملاء'; }
      if (v.relationType === 'supplier') { counterCode = '2100'; counterName = 'ذمم الموردين'; }
      if (v.type === 'قبض') {
        journal.push(line(entryId, 'voucher', id, v.date, cashCode, 'الصندوق / الحساب', amount, 0, `سند قبض ${text(v.refNumber, id)} من ${partyName}`, party));
        journal.push(line(entryId, 'voucher', id, v.date, counterCode, counterName, 0, amount, `تسوية سند قبض مع ${partyName}`, party));
      } else {
        journal.push(line(entryId, 'voucher', id, v.date, counterCode, counterName, amount, 0, `تسوية سند صرف مع ${partyName}`, party));
        journal.push(line(entryId, 'voucher', id, v.date, cashCode, 'الصندوق / الحساب', 0, amount, `سند صرف ${text(v.refNumber, id)} إلى ${partyName}`, party));
      }
    });

    parse('cashtop_journal_reversal_archive').forEach(record => {
      const lines = Array.isArray(record?.originalLines) ? record.originalLines : [];
      if (!lines.length) return;
      const deletedAt = record.deletedAt || new Date().toISOString();
      const byEntry = new Map();
      lines.forEach(original => {
        if (!original || typeof original !== 'object') return;
        const originalEntryId = text(original.entryId, `JE_ARCH_${record.sourceId || record.id}`);
        if (!byEntry.has(originalEntryId)) byEntry.set(originalEntryId, []);
        byEntry.get(originalEntryId).push(original);
        journal.push({ ...original, id: `${text(original.id, originalEntryId)}_ARCH_${text(record.id, Date.now())}`, entryId: `JE_ARCH_${text(record.id, Date.now())}_${originalEntryId}`, originalEntryId, archivedOriginal: true, reversalArchiveId: record.id });
      });
      byEntry.forEach((entryLines, originalEntryId) => {
        const reversalEntryId = `JE_AUTO_REV_${text(record.id, record.sourceId || Date.now())}_${originalEntryId}`;
        entryLines.forEach((original, index) => {
          journal.push({
            ...original,
            id: `${reversalEntryId}_${index}`,
            entryId: reversalEntryId,
            sourceType: `${text(original.sourceType, 'entry')}-reversal`,
            date: deletedAt,
            debit: Number(n(original.credit).toFixed(2)),
            credit: Number(n(original.debit).toFixed(2)),
            description: `${record.reversalReason === 'edit' ? 'عكس تلقائي قبل التعديل' : 'عكس تلقائي بعد الحذف'}: ${text(original.description, record.sourceId || '')}`,
            reversalOfEntryId: originalEntryId,
            reversalArchiveId: record.id,
            archivedOriginal: false
          });
        });
      });
    });

    return journal.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function validateBalanced(journal) {
    const totals = new Map();
    journal.forEach(item => {
      const current = totals.get(item.entryId) || { debit: 0, credit: 0 };
      current.debit += n(item.debit);
      current.credit += n(item.credit);
      totals.set(item.entryId, current);
    });
    const unbalanced = [];
    totals.forEach((totalsValue, entryId) => {
      const difference = Math.abs(totalsValue.debit - totalsValue.credit);
      if (difference > 0.01) unbalanced.push({ entryId, ...totalsValue, difference });
    });
    return unbalanced;
  }

  let rebuilding = false;
  function rebuild() {
    if (rebuilding) return;
    if (window.Cashtop?.isFinancialGroupReadOnly?.()) return;
    rebuilding = true;
    try {
      const journal = buildJournal();
      const unbalanced = validateBalanced(journal);
      localStorage.setItem('cashtop_journal', JSON.stringify(journal));
      window.Cashtop.accountingStatus = {
        updatedAt: new Date().toISOString(),
        entries: new Set(journal.map(row => row.entryId)).size,
        lines: journal.length,
        unbalanced
      };
      window.dispatchEvent(new CustomEvent('cashtop:journal-rebuilt', { detail: window.Cashtop.accountingStatus }));
      if (unbalanced.length) console.warn('[CASH TOP] قيود غير متوازنة:', unbalanced);
    } finally {
      rebuilding = false;
    }
  }

  window.Cashtop.rebuildJournal = rebuild;
  window.Cashtop.getJournal = () => parse('cashtop_journal');

  window.addEventListener('cashtop:data-changed', event => {
    if (SOURCE_KEYS.has(event.detail?.key)) setTimeout(rebuild, 30);
  });
  window.addEventListener('cashtop:remote-applied', event => {
    if (SOURCE_KEYS.has(event.detail?.key)) setTimeout(rebuild, 30);
  });
  document.addEventListener('DOMContentLoaded', rebuild, { once: true });
})();
