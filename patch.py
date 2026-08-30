from pathlib import Path

root=Path('/mnt/data/cashtop_fix')
core=root/'cashtop-core.js'
products=root/'products.html'
accounts=root/'accounts.html'
sync=root/'turso-sync.js'

s=core.read_text(encoding='utf-8')
needle="""  function setRawCompanyDataset(key, value, options = {}) {\n"""
idx=s.index(needle)
# insert helper before setRawCompanyDataset
helper=r'''  // كتابة مباشرة لمجموعة مدارة مع تجاوز merge الخاص بالمجموعات ذات
  // السلوك المتخصص. تستخدم للحذف الفعلي لسجل واحد حتى لا تعيده طبقة الدمج.
  function replaceManagedDatasetRaw(key, value, options = {}) {
    const canonical = canonicalKey(key);
    if (!isManagedKey(canonical)) throw new Error('مجموعة البيانات غير مدارة');
    assertFinancialGroupWritable(canonical);
    const ns = namespaceKey(canonical);
    const oldValue = rawGet(ns);
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (oldValue === stringValue) return { changed:false, operationId:null };
    rawSet(ns, stringValue);
    const managedChange = describeManagedChange(oldValue, stringValue);
    const previousMeta = safeJson(rawGet(metaKey(canonical)), {}) || {};
    rawSet(metaKey(canonical), JSON.stringify({
      ...previousMeta,
      updatedAt: Date.now(),
      revision: Number(previousMeta.revision || 0) + 1,
      deviceId: getDeviceId(),
      page: FILE,
      recordTombstones: LOSSLESS_RECORD_DATASETS.has(canonical)
        ? mergeRecordTombstones(previousMeta.recordTombstones, managedChange)
        : previousMeta.recordTombstones
    }));
    if (options.audit !== false) {
      try { appendAudit(canonical, oldValue, stringValue, options.action); } catch (_) {}
    }
    const operationId = options.enqueue === false ? null : enqueueSyncOperation(canonical, {
      ...managedChange,
      deletedDataset: false,
      forceReplace: options.forceReplace === true
    });
    emitDataChange(canonical, oldValue, stringValue, options.source || 'local-direct', operationId);
    const deleted = (managedChange.deletedIds || []).length > 0 || Object.values(managedChange.nestedArrayChanges || {}).some(x => (x?.deletedIds || []).length);
    if (deleted) window.dispatchEvent(new CustomEvent('cashtop:sync-now', { detail:{ reason: options.action || 'delete-record', key: canonical, operationId } }));
    return { changed:true, operationId, change:managedChange };
  }

  function deleteManagedRecord(key, recordId, options = {}) {
    const canonical = canonicalKey(key);
    const ns = namespaceKey(canonical);
    const oldValue = safeJson(rawGet(ns), null);
    const id = String(recordId ?? '').trim();
    if (!id) return { changed:false, operationId:null };
    if (canonical === 'cashtop_products') {
      const rows = Array.isArray(oldValue) ? oldValue : [];
      const next = rows.filter(row => String(row?.id ?? '') !== id);
      if (next.length === rows.length) return { changed:false, operationId:null };
      return replaceManagedDatasetRaw(canonical, next, { ...options, action: options.action || 'delete-product' });
    }
    if (canonical === 'cashtop_funds_db') {
      const db = oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue) ? oldValue : {};
      const branch = branchIdFromSession();
      const accounts = Array.isArray(db.accounts) ? db.accounts : [];
      const logs = Array.isArray(db.accountLogs) ? db.accountLogs : [];
      const removed = accounts.find(a => String(a?.id ?? '') === id && sameBranch(a, branch));
      if (!removed) return { changed:false, operationId:null };
      const next = {
        ...db,
        accounts: accounts.filter(a => !(String(a?.id ?? '') === id && sameBranch(a, branch))),
        accountLogs: logs.filter(l => !(String(l?.accountId ?? '') === id && sameBranch(l, branch)))
      };
      return replaceManagedDatasetRaw(canonical, next, { ...options, action: options.action || 'delete-account' });
    }
    return { changed:false, operationId:null };
  }

'''
s=s[:idx]+helper+s[idx:]
# Export APIs
old="""    setRawCompanyDataset,\n"""
new="""    setRawCompanyDataset, replaceManagedDatasetRaw, deleteManagedRecord,\n"""
s=s.replace(old,new,1)
core.write_text(s,encoding='utf-8')

# Products: replace direct deletion implementation + add modal.
p=products.read_text(encoding='utf-8')
old='''        async function deleteProduct(productId) {\n            const prod = productsData.find(p => String(p.id) === String(productId));\n            if (!prod) return;\n            if (!confirm(`هل تريد حذف المنتج [${prod.name}]؟ لن يتم إنشاء أي قيد عكسي أو حركة مالية.`)) return;\n            productsData = productsData.filter(p => String(p.id) !== String(productId));\n            localStorage.setItem('cashtop_products', JSON.stringify(productsData));\n            updateDatalistOptions();\n            renderTable();\n            window.dispatchEvent(new CustomEvent('cashtop:sync-now', { detail:{ reason:'delete-product' } }));\n            showToast('تم حذف المنتج بدون إنشاء قيد عكسي', 'success');\n        }\n'''
new='''        let pendingProductDeleteId = null;\n\n        function openProductDeleteModal(productId) {\n            const prod = productsData.find(p => String(p.id) === String(productId));\n            if (!prod) return;\n            pendingProductDeleteId = String(productId);\n            const title = document.getElementById('productDeleteName');\n            const modal = document.getElementById('productDeleteModal');\n            if (title) title.textContent = prod.name || 'هذا المنتج';\n            if (modal) modal.classList.add('active');\n        }\n\n        function closeProductDeleteModal() {\n            pendingProductDeleteId = null;\n            document.getElementById('productDeleteModal')?.classList.remove('active');\n        }\n\n        async function executeProductDelete() {\n            const productId = pendingProductDeleteId;\n            if (!productId) return;\n            const prod = productsData.find(p => String(p.id) === String(productId));\n            if (!prod) { closeProductDeleteModal(); return; }\n            try {\n                const result = window.Cashtop?.deleteManagedRecord?.('cashtop_products', productId, { action:'delete-product' });\n                if (!result?.changed) throw new Error('تعذر حفظ حذف المنتج محلياً');\n                productsData = productsData.filter(p => String(p.id) !== productId);\n                updateDatalistOptions();\n                renderTable();\n                closeProductDeleteModal();\n                showToast('تم حذف المنتج محلياً وسيتم مزامنته فوراً.', 'success');\n                window.dispatchEvent(new CustomEvent('cashtop:sync-now', { detail:{ reason:'delete-product', key:'cashtop_products', operationId:result.operationId } }));\n            } catch (error) {\n                console.error(error);\n                showToast(error?.message || 'تعذر حذف المنتج.', 'error');\n            }\n        }\n\n        function deleteProduct(productId) { openProductDeleteModal(productId); }\n'''
if old not in p: raise SystemExit('product delete block not found')
p=p.replace(old,new,1)
p=p.replace(".btn-delete-act { color: #dd4b39; } .btn-delete-act:hover { background: rgba(221,75,57,0.1); }", ".btn-delete-act { color: #dd4b39; } .btn-delete-act:hover { background: rgba(221,75,57,0.1); }\n        .ct-delete-confirm-modal .modal-box { max-width: 430px; text-align:center; border-top:4px solid #ef4444; border-radius:18px; padding:26px 24px 22px; }\n        .ct-delete-icon { width:72px; height:72px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 14px; background:#fee2e2; color:#dc2626; font-size:30px; box-shadow:0 8px 24px rgba(220,38,38,.12); }\n        .ct-delete-actions { display:flex; gap:10px; margin-top:22px; }\n        .ct-delete-actions button { flex:1; border:0; border-radius:12px; padding:12px 14px; font-weight:800; cursor:pointer; font-family:inherit; }\n        .ct-delete-cancel { background:#f1f5f9; color:#334155; }\n        .ct-delete-confirm { background:#dc2626; color:#fff; box-shadow:0 6px 16px rgba(220,38,38,.22); }\n        .ct-delete-confirm:active,.ct-delete-cancel:active { transform:scale(.98); }")
marker='''    <div class="modal-overlay" id="productImageUrlModal">'''
modal='''    <div class="modal-overlay ct-delete-confirm-modal" id="productDeleteModal" aria-hidden="true">\n        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="productDeleteTitle">\n            <div class="ct-delete-icon"><i class="fa-solid fa-trash-can"></i></div>\n            <h3 id="productDeleteTitle" style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:900;">تأكيد حذف المنتج</h3>\n            <p style="margin:0;color:#64748b;line-height:1.8;font-size:14px;">هل أنت متأكد من حذف المنتج؟<br><strong id="productDeleteName" style="color:#dc2626;"></strong><br><span style="font-size:12px;">سيُحذف محلياً فوراً ثم تتم مزامنته مع بقية الأجهزة.</span></p>\n            <div class="ct-delete-actions">\n                <button type="button" class="ct-delete-cancel" onclick="closeProductDeleteModal()"><i class="fa-solid fa-xmark"></i> لا، تراجع</button>\n                <button type="button" class="ct-delete-confirm" onclick="executeProductDelete()"><i class="fa-solid fa-trash-can"></i> نعم، احذف</button>\n            </div>\n        </div>\n    </div>\n\n'''
if marker not in p: raise SystemExit('product modal marker not found')
p=p.replace(marker,modal+marker,1)
products.write_text(p,encoding='utf-8')

# Accounts: balance enabled, save balance, direct delete no conditions except group readonly, professional modal buttons already modal; change content/actions.
a=accounts.read_text(encoding='utf-8')
a=a.replace("document.getElementById('accBalance').disabled = true; // منع التلاعب بالرصيد أثناء التعديل", "document.getElementById('accBalance').disabled = false; // السماح بتعديل الرصيد مباشرة")
old_edit="""                    acc.name = usernameToSave;\n                    acc.type = finalType;\n                    if (!document.getElementById('accCurrency').disabled) acc.currencyId = document.getElementById('accCurrency').value || getCurrencyConfig().baseCurrencyId;\n                    acc.notes = notes;\n                    if (makeDropdownDefault) cashtop_funds_db.accounts.forEach(item => { item.isDropdownDefault = String(item.id) === String(acc.id); });\n                    else acc.isDropdownDefault = false;\n                    showToast('تم تعديل بيانات الحساب بنجاح.', 'success');\n"""
new_edit="""                    const oldBalance = Number(acc.balance || 0);\n                    const newBalance = parseFloat(document.getElementById('accBalance').value);\n                    if (!Number.isFinite(newBalance)) { showToast('أدخل رصيداً صحيحاً.', 'error'); return; }\n                    acc.name = usernameToSave;\n                    acc.type = finalType;\n                    acc.balance = newBalance;\n                    if (!document.getElementById('accCurrency').disabled) acc.currencyId = document.getElementById('accCurrency').value || getCurrencyConfig().baseCurrencyId;\n                    acc.notes = notes;\n                    if (makeDropdownDefault) cashtop_funds_db.accounts.forEach(item => { item.isDropdownDefault = String(item.id) === String(acc.id); });\n                    else acc.isDropdownDefault = false;\n                    const delta = newBalance - oldBalance;\n                    if (Math.abs(delta) > 0.0000001) {\n                        cashtop_funds_db.accountLogs.push({\n                            id:`MANUAL_BAL_${acc.id}_${Date.now()}`, sourceType:'manualBalanceAdjustment', sourceId:String(acc.id),\n                            accountId:acc.id, date:new Date().toISOString(), type:delta >= 0 ? 'إيداع' : 'سحب', amount:Math.abs(delta),\n                            baseAmount:Math.abs(delta), currencyId:acc.currencyId || getCurrencyConfig().baseCurrencyId,\n                            notes:'تعديل رصيد الحساب يدوياً'\n                        });\n                    }\n                    showToast('تم تعديل بيانات الحساب والرصيد بنجاح.', 'success');\n"""
if old_edit not in a: raise SystemExit('account edit block not found')
a=a.replace(old_edit,new_edit,1)
# Delete button rendering: remove condition lock and use confirm for all
old_btn="""                        ${(item.isDefaultCash === true || item.locked === true) ? '<span title=\"صندوق الكاش افتراضي ولا يمكن تعطيله أو حذفه\" style=\"display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;color:#16a34a;\"><i class=\"fa-solid fa-lock\"></i></span>' : `<button class=\"action-btn\" style=\"color:${isAccountActive(item)?'#f59e0b':'#16a34a'}\" title=\"${isAccountActive(item)?'إيقاف الحساب':'تفعيل الحساب'}\" onclick=\"toggleAccountStatus(${item.id})\"><i class=\"fa-solid ${isAccountActive(item)?'fa-pause':'fa-play'}\"></i></button><button class=\"action-btn btn-delete\" title=\"حذف إذا لم توجد عليه حركات\" onclick=\"confirmDeleteAccount(${item.id})\"><i class=\"fa-solid fa-trash-can\"></i></button>`}\n"""
new_btn="""                        <button class=\"action-btn\" style=\"color:${isAccountActive(item)?'#f59e0b':'#16a34a'}\" title=\"${isAccountActive(item)?'إيقاف الحساب':'تفعيل الحساب'}\" onclick=\"toggleAccountStatus(${item.id})\"><i class=\"fa-solid ${isAccountActive(item)?'fa-pause':'fa-play'}\"></i></button><button class=\"action-btn btn-delete\" title=\"حذف الصندوق\" onclick=\"confirmDeleteAccount(${item.id})\"><i class=\"fa-solid fa-trash-can\"></i></button>\n"""
if old_btn not in a: raise SystemExit('account delete button block not found')
a=a.replace(old_btn,new_btn,1)
# Replace confirm delete / execute delete block
start=a.index("        function confirmDeleteAccount(id) {")
end=a.index("        /* ========================================================== */\n        /*   نظام التحويلات المالية", start)
block=r'''        function confirmDeleteAccount(id) {
            if (window.Cashtop?.isFinancialGroupReadOnly?.()) { showToast('المجموعة المغلقة مؤرشفة ولا يمكن تعديل حساباتها.', 'error'); return; }
            const acc = cashtop_funds_db.accounts.find(a => String(a.id) === String(id));
            if (!acc) return;
            currentDeleteId = acc.id;
            document.getElementById('deleteAccNameText').innerText = acc.name || 'الصندوق';
            document.getElementById('deleteAccountModalTitle').innerText = 'تأكيد حذف الصندوق';
            document.getElementById('deleteAccountModalText').innerHTML = `هل أنت متأكد من حذف الصندوق <strong style="color:#dc2626;">${String(acc.name || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</strong>؟<br><span style="font-size:12px;color:#64748b;">سيُحذف محلياً فوراً وتتم مزامنته مباشرة مع بقية الأجهزة، بما في ذلك الرصيد والحركات المرتبطة به.</span>`;
            document.getElementById('deleteAccountConfirmBtn').innerHTML = '<i class="fa-solid fa-trash-can"></i> نعم، احذف';
            openModal('deleteModal');
        }

        function executeDelete() {
            if (window.Cashtop?.isFinancialGroupReadOnly?.()) { showToast('المجموعة المغلقة مؤرشفة ولا يمكن تعديل حساباتها.', 'error'); closeModal('deleteModal'); return; }
            if (currentDeleteId === null) return;
            const target = cashtop_funds_db.accounts.find(a => String(a.id) === String(currentDeleteId));
            if (!target) { closeModal('deleteModal'); currentDeleteId = null; return; }
            try {
                const result = window.Cashtop?.deleteManagedRecord?.('cashtop_funds_db', currentDeleteId, { action:'delete-account' });
                if (!result?.changed) throw new Error('تعذر حفظ حذف الصندوق محلياً');
                cashtop_funds_db.accounts = cashtop_funds_db.accounts.filter(a => String(a.id) !== String(currentDeleteId));
                cashtop_funds_db.accountLogs = (cashtop_funds_db.accountLogs || []).filter(l => String(l.accountId) !== String(currentDeleteId));
                initLayout();
                closeModal('deleteModal');
                showToast('تم حذف الصندوق محلياً وسيتم مزامنته فوراً.', 'success');
                window.dispatchEvent(new CustomEvent('cashtop:sync-now', { detail:{ reason:'delete-account', key:'cashtop_funds_db', operationId:result.operationId } }));
            } catch (error) {
                console.error(error);
                showToast(error?.message || 'تعذر حذف الصندوق.', 'error');
            } finally {
                currentDeleteId = null;
            }
        }

'''
a=a[:start]+block+a[end:]
# Make modal professional buttons
old_modal='''                <button type="button" class="btn-cancel" onclick="closeModal('deleteModal')">إلغاء وتراجع</button>\n                <button type="button" class="btn-red-submit" id="deleteAccountConfirmBtn" onclick="executeDelete()"><i class="fa-solid fa-trash-can"></i> تأكيد</button>\n'''
new_modal='''                <button type="button" class="btn-cancel" onclick="closeModal('deleteModal')" style="border-radius:12px;padding:12px 16px;font-weight:800;">لا، تراجع</button>\n                <button type="button" class="btn-red-submit" id="deleteAccountConfirmBtn" onclick="executeDelete()" style="border-radius:12px;padding:12px 16px;font-weight:800;"><i class="fa-solid fa-trash-can"></i> نعم، احذف</button>\n'''
a=a.replace(old_modal,new_modal,1)
# allow default cash currency maybe not relevant; keep
accounts.write_text(a,encoding='utf-8')

# Sync: make sync-now nearly immediate and support nested deletes for funds.
t=sync.read_text(encoding='utf-8')
old='''    if (LOSSLESS_OBJECT_KEYS.has(key) && localValue && remoteValue && typeof localValue === 'object' && typeof remoteValue === 'object' && !Array.isArray(localValue) && !Array.isArray(remoteValue)) {\n      return { ...localPayload, value: JSON.stringify(mergeLosslessObjectPending(key, localValue, remoteValue)), deleted: false };\n    }\n'''
new='''    if (LOSSLESS_OBJECT_KEYS.has(key) && localValue && remoteValue && typeof localValue === 'object' && typeof remoteValue === 'object' && !Array.isArray(localValue) && !Array.isArray(remoteValue)) {\n      if (pending?.nestedArrayChanges && typeof pending.nestedArrayChanges === 'object') {\n        const merged = { ...remoteValue, ...localValue };\n        for (const field of ['accounts','accountLogs']) {\n          const nested = pending.nestedArrayChanges[field];\n          if (!nested || !Array.isArray(localValue[field]) || !Array.isArray(remoteValue[field])) continue;\n          merged[field] = mergeArrayByDelta(localValue[field], remoteValue[field], nested.touchedIds || [], nested.deletedIds || []);\n        }\n        return { ...localPayload, value: JSON.stringify(merged), deleted: false };\n      }\n      return { ...localPayload, value: JSON.stringify(mergeLosslessObjectPending(key, localValue, remoteValue)), deleted: false };\n    }\n'''
if old not in t: raise SystemExit('sync lossless block not found')
t=t.replace(old,new,1)
t=t.replace("""  window.addEventListener('cashtop:sync-now', () => {\n    if (core.getSyncQueue().length) scheduleSync(80);\n    else checkRemoteAndPull(true).catch(() => null);\n  });\n""", """  window.addEventListener('cashtop:sync-now', () => {\n    if (core.getSyncQueue().length) scheduleSync(15);\n    else checkRemoteAndPull(true).catch(() => null);\n  });\n""",1)
sync.write_text(t,encoding='utf-8')

print('patched')
