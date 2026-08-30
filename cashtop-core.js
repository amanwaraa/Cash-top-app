(function () {
  'use strict';

  const FILE = decodeURIComponent((location.pathname.split('/').pop() || '').replace(/\+/g, ' '));
  const EXCLUDED = new Set(['صفحة تسجيل الدخول.html', 'index.html', 'offline.html']);
  const IS_APP_PAGE = !EXCLUDED.has(FILE);
  const APP_NAME = 'كاش توب 2';
  let deferredInstallPrompt = null;
  let appInstalled = window.matchMedia?.('(display-mode: standalone)')?.matches === true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.dispatchEvent(new CustomEvent('cashtop:pwa-ready'));
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    appInstalled = true;
    window.dispatchEvent(new CustomEvent('cashtop:pwa-installed'));
  });
  const RAW = {
    get: Storage.prototype.getItem,
    set: Storage.prototype.setItem,
    remove: Storage.prototype.removeItem,
    clear: Storage.prototype.clear,
    key: Storage.prototype.key
  };

  const GLOBAL_KEYS = new Set([
    'cashtop_remembered_key',
    'cashtop_device_id',
    'cashtop_admin_licenses',
    'cashtop_admin_users',
    'cashtop_superadmin_session',
    'cashtop_tenant_bindings',
    'cashtop_persistent_session_v1',
    'cashtop_server_clock_v1'
  ]);

  const ALIASES = {
    cashtop_funds_db_v4: 'cashtop_funds_db',
    cashtop_clients: 'cashtop_customers',
    cashtop_purchase_invoices: 'cashtop_purchases'
  };

  const DATA_KEYS = [
    'cashtop_products', 'cashtop_product_categories', 'cashtop_materials', 'cashtop_material_purchases', 'cashtop_customers', 'cashtop_customer_groups',
    'cashtop_suppliers', 'cashtop_supplier_movements', 'cashtop_invoices', 'cashtop_sales_reversals', 'cashtop_sales_returns',
    'cashtop_purchases', 'cashtop_purchase_reversals', 'cashtop_purchase_returns', 'cashtop_expenses',
    'cashtop_expense_types', 'cashtop_funds_db', 'cashtop_vouchers',
    'cashtop_units', 'cashtop_stores', 'cashtop_transfer_history',
    'cashtop_branches', 'cashtop_branch_transfer_history', 'cashtop_employees',
    'cashtop_company_access',
    'cashtop_workers', 'cashtop_sales_agents', 'cashtop_agent_movements',
    'cashtop_settings', 'cashtop_db', 'cashtop_printer_settings', 'cashtop_barcode_settings', 'cashtop_invoice_design',
    'cashtop_sms_template', 'cashtop_invoice_message_template', 'cashtop_journal', 'cashtop_journal_reversal_archive', 'cashtop_audit_log',
    'cashtop_sales_offers', 'cashtop_tax_settings', 'cashtop_notification_settings',
    'cashtop_financial_groups', 'cashtop_opening_balances',
'cashtop_manufacturing_recipes', 'cashtop_manufacturing_orders',
    'cashtop_wastage', 'cashtop_archive_index', 'cashtop_salary_payments'
  ];

  /* ============================================================
   * R77 — Financial Groups
   * ============================================================
   * R75 data stays exactly where it already is and becomes the first
   * financial group (FG_LEGACY). New groups get isolated local/cloud
   * dataset slots, while shared master/configuration data remains common.
   */
  const FINANCIAL_GROUPS_KEY = 'cashtop_financial_groups';
  const OPENING_BALANCES_KEY = 'cashtop_opening_balances';
  const LEGACY_FINANCIAL_GROUP_ID = 'FG_LEGACY';
  const FINANCIAL_GROUP_SCOPED_KEYS = new Set([
    'cashtop_products', 'cashtop_product_categories', 'cashtop_materials', 'cashtop_material_purchases',
    'cashtop_customers', 'cashtop_suppliers', 'cashtop_supplier_movements',
    'cashtop_invoices', 'cashtop_sales_reversals', 'cashtop_sales_returns', 'cashtop_purchases', 'cashtop_purchase_reversals', 'cashtop_purchase_returns',
    'cashtop_expenses', 'cashtop_funds_db', 'cashtop_vouchers',
    'cashtop_transfer_history', 'cashtop_branch_transfer_history',
    'cashtop_workers', 'cashtop_sales_agents', 'cashtop_agent_movements',
    'cashtop_journal', 'cashtop_journal_reversal_archive', 'cashtop_audit_log', 'cashtop_material_purchases',
    'cashtop_manufacturing_orders', 'cashtop_wastage', 'cashtop_archive_index',
    'cashtop_salary_payments', OPENING_BALANCES_KEY
  ]);
  const FINANCIAL_GROUP_RESET_KEYS = new Set([
    'cashtop_invoices', 'cashtop_sales_reversals', 'cashtop_sales_returns', 'cashtop_purchases', 'cashtop_purchase_reversals', 'cashtop_purchase_returns',
    'cashtop_expenses', 'cashtop_vouchers', 'cashtop_supplier_movements',
    'cashtop_transfer_history', 'cashtop_branch_transfer_history',
    'cashtop_journal', 'cashtop_journal_reversal_archive', 'cashtop_audit_log', 'cashtop_material_purchases',
    'cashtop_agent_movements', 'cashtop_manufacturing_orders', 'cashtop_wastage',
    'cashtop_salary_payments', 'cashtop_archive_index'
  ]);
  const FINANCIAL_GROUP_CARRY_KEYS = new Set([
    'cashtop_products', 'cashtop_product_categories', 'cashtop_materials', 'cashtop_customers',
    'cashtop_suppliers', 'cashtop_funds_db', 'cashtop_workers', 'cashtop_sales_agents'
  ]);

  const PERMISSION_GROUPS = [
    { id: 'pages', title: 'صلاحيات الصفحات والأقسام', permissions: [
      ['dashboard.view', 'عرض لوحة التحكم'], ['pos.access', 'فتح الكاشير ونقطة البيع'],
      ['sales.invoices.view', 'عرض فواتير المبيعات'], ['purchases.view', 'عرض فواتير المشتريات'],
      ['purchaseReturns.view', 'عرض مرتجع المشتريات'], ['products.view', 'عرض المنتجات'], ['materials.view', 'عرض الأصناف الخام'],
      ['warehouses.view', 'عرض المخازن'], ['branches.view', 'عرض الفروع'], ['units.view', 'عرض الوحدات'],
      ['shortages.view', 'عرض نواقص المخزون'], ['barcode.view', 'فتح مولد الباركود'],
      ['customers.view', 'عرض العملاء'], ['customerGroups.view', 'عرض مجموعات العملاء'],
      ['suppliers.view', 'عرض الموردين'], ['agents.view', 'عرض المناديب'],
      ['accounts.view', 'عرض الحسابات والصناديق'], ['journal.view', 'عرض دفتر الأستاذ'],
      ['vouchers.view', 'عرض سندات القبض والصرف'], ['expenses.view', 'عرض المصاريف'],
      ['reports.view', 'عرض التقارير'], ['financialGroups.view', 'عرض المجموعات المالية'], ['employees.view', 'عرض الموظفين'], ['workers.view', 'عرض العمال والأجور'],
      ['manufacturing.view', 'عرض إدارة التصنيع'], ['offers.view', 'عرض عروض المبيعات'], ['notifications.view', 'عرض الإشعارات'], ['settings.system', 'فتح إعدادات النظام'],
      ['settings.printer', 'فتح إعدادات الطابعة'], ['settings.tax', 'فتح إعدادات الضريبة'],
      ['settings.storage', 'فتح التخزين والأرشفة'], ['backup.manage', 'فتح النسخ الاحتياطي والاستعادة']
    ]},
    { id: 'sales', title: 'صلاحيات المبيعات والكاشير', permissions: [
      ['sales.create', 'إنشاء وحفظ فاتورة بيع'], ['sales.edit', 'تعديل فاتورة بيع وعكس حركتها'],
      ['sales.delete', 'حذف فاتورة بيع وعكس المخزون والحسابات'], ['sales.print', 'طباعة الفواتير'],
      ['sales.image', 'تنزيل الفاتورة كصورة'], ['sales.discount', 'تطبيق الخصم على المبيعات'],
      ['sales.changePrice', 'تعديل سعر الصنف في الكاشير'], ['sales.credit', 'تسجيل مبيعات آجلة وديون'],
      ['sales.hold', 'تعليق واسترجاع الفواتير'], ['sales.clearCart', 'تفريغ سلة الكاشير']
    ]},
    { id: 'purchases', title: 'صلاحيات المشتريات والموردين', permissions: [
      ['purchases.create', 'إنشاء فاتورة مشتريات متعددة المنتجات'], ['purchases.edit', 'تعديل فاتورة مشتريات'],
      ['purchases.delete', 'حذف فاتورة مشتريات وعكسها'], ['purchases.export', 'تصدير فواتير المشتريات'],
      ['purchases.discount', 'تطبيق خصم المشتريات'],
      ['purchaseReturns.create', 'إنشاء مرتجع مشتريات'], ['purchaseReturns.edit', 'تعديل مرتجع مشتريات'],
      ['purchaseReturns.delete', 'حذف مرتجع مشتريات'], ['purchaseReturns.export', 'تصدير مرتجعات المشتريات'],
      ['suppliers.create', 'إضافة مورد'], ['suppliers.edit', 'تعديل الموردين'],
      ['suppliers.delete', 'حذف الموردين'], ['suppliers.balance', 'إضافة دفعات وديون للموردين'],
      ['suppliers.export', 'تصدير بيانات الموردين']
    ]},
    { id: 'inventory', title: 'صلاحيات المنتجات والمخزون', permissions: [
      ['products.create', 'إضافة منتج'], ['products.edit', 'تعديل المنتجات'], ['products.delete', 'حذف المنتجات'],
      ['products.export', 'تصدير المنتجات'], ['materials.view', 'عرض الأصناف الخام'], ['materials.manage', 'إضافة وتعديل وتوريد الأصناف الخام'], ['materials.export', 'تصدير الأصناف الخام'], ['inventory.adjust', 'تعديل كميات المخزون'],
      ['inventory.transfer', 'نقل بين الفروع والمخازن (الموظف ينقل من فرعه فقط)'],
      ['inventory.importExport', 'استيراد وتصدير بيانات المخزون'],
      ['warehouses.manage', 'إضافة وتعديل وحذف المخازن'], ['branches.manage', 'إضافة وتعديل وحذف الفروع'],
      ['units.manage', 'إضافة وتعديل وحذف الوحدات'], ['shortages.supply', 'توريد ومعالجة نواقص المخزون'],
      ['barcode.manage', 'إنشاء وطباعة وتنزيل ملصقات الباركود']
    ]},
    { id: 'customers', title: 'صلاحيات العملاء', permissions: [
      ['customers.create', 'إضافة عميل'], ['customers.edit', 'تعديل العملاء'], ['customers.delete', 'حذف العملاء'],
      ['customers.balance', 'تعديل أرصدة وديون العملاء'], ['customers.export', 'تصدير وطباعة بيانات العملاء'],
      ['customerGroups.manage', 'إدارة مجموعات وتسعير العملاء']
    ]},
    { id: 'finance', title: 'الصلاحيات المالية والمحاسبية', permissions: [
      ['accounts.manage', 'إضافة وتعديل وحذف الصناديق والحسابات'],
      ['finance.transactions', 'إضافة التحويلات والحركات المالية'],
      ['finance.deleteTransactions', 'حذف وعكس الحركات المالية'], ['finance.export', 'تصدير الحسابات والحركات'],
      ['expenses.manage', 'إضافة وتعديل وحذف المصاريف وأنواعها'], ['expenses.export', 'تصدير المصاريف'],
      ['vouchers.manage', 'إضافة وتعديل وحذف السندات'], ['vouchers.export', 'طباعة وتصدير السندات'],
      ['journal.manage', 'إدارة دفتر الأستاذ'], ['journal.export', 'تصدير دفتر الأستاذ'],
      ['reports.export', 'تصدير التقارير'], ['reports.send', 'إرسال التقارير عبر قنوات المشاركة'],
      ['financialGroups.switch', 'الانتقال بين المجموعات المالية'], ['financialGroups.viewClosed', 'استعراض المجموعات المغلقة'],
      ['financialGroups.create', 'إغلاق المجموعة الحالية وفتح مجموعة مالية جديدة']
    ]},
    { id: 'staff', title: 'صلاحيات الموظفين والإدارة', permissions: [
      ['employees.manage', 'إضافة وتعديل وحذف وتعطيل الموظفين'], ['employees.export', 'تصدير بيانات الموظفين'],
      ['permissions.manage', 'تعديل صلاحيات الموظفين'],
      ['workers.manage', 'إضافة وتعديل وحذف العمال'], ['workers.payments', 'صرف رواتب ودفعات وديون العمال'],
      ['workers.export', 'تصدير بيانات العمال'], ['agents.manage', 'إضافة وتعديل وحذف المناديب'],
      ['agents.stock', 'تحميل واسترجاع مخزون المناديب'], ['agents.settle', 'تسوية مبيعات المناديب'],
      ['agents.payments', 'دفعات وحسابات المناديب'], ['agents.export', 'تصدير بيانات وحركات المناديب'],
      ['manufacturing.manage', 'إدارة الوصفات وأوامر التصنيع']
    ]},
    { id: 'system', title: 'صلاحيات النظام الحساسة', permissions: [
      ['settings.edit', 'تعديل إعدادات النظام والشركة وكلمة المرور'], ['settings.sms', 'تعديل قالب رسائل العملاء'],
      ['printer.edit', 'تعديل إعدادات الطابعة والفاتورة'], ['tax.edit', 'تعديل إعدادات الضريبة'],
      ['storage.manage', 'إدارة التخزين والأرشفة'], ['offers.manage', 'إدارة عروض المبيعات'], ['notifications.manage', 'إدارة إعدادات الإشعارات'], ['sync.run', 'تشغيل المزامنة اليدوية'],
      ['backup.exportImport', 'تصدير واستيراد نسخة احتياطية'], ['app.install', 'تثبيت تطبيق الويب']
    ]}
  ];

  const PAGE_PERMISSIONS = {
    'لوحة التحكم.html': 'dashboard.view', 'cashier.html': 'pos.access', 'invoices.html': 'sales.invoices.view', 'مرجع المبيعات.html': 'sales.invoices.view',
    'المشتريات.html': 'purchases.view', 'مرجع المشتريات.html': 'purchaseReturns.view', 'products.html': 'products.view', 'categories.html': 'products.view', 'materials.html': 'materials.view',
    'warehouses.html': 'warehouses.view', 'branches.html': ['branches.view', 'inventory.transfer'], 'units.html': 'units.view',
    'shortages.html': 'shortages.view', 'barcode-generator.html': 'barcode.view', 'customers.html': 'customers.view',
    'customer-groups.html': 'customerGroups.view', 'suppliers.html': 'suppliers.view', 'المناديب.html': 'agents.view',
    'accounts.html': 'accounts.view', 'journal.html': 'journal.view', 'financial-groups.html': 'financialGroups.view', 'sands.html': 'vouchers.view',
    'المصاريف.html': 'expenses.view', 'التقارير.html': 'reports.view', 'الموظفين.html': 'employees.view',
    'العمال والاجور.html': 'workers.view', 'ادارة التصنيع.html': 'manufacturing.view', 'sales-offers.html': 'offers.view', 'notifications.html': 'notifications.view', 'setting.html': 'settings.system', 'printer-settings.html': 'settings.printer',
    'tax-settings.html': 'settings.tax', 'storage-settings.html': 'settings.storage',
    'استيراد وتصدير ل كل قسم.html': 'backup.manage'
  };

  // Action-level permissions are applied to existing and dynamically-created
  // controls. This supplements page access with granular create/edit/delete/
  // payment/transfer/export restrictions without changing page business logic.
  const ACTION_PERMISSION_MAP = {
    'accounts.html': {
      openAddAccountModal: 'accounts.manage', editAccount: 'accounts.manage', saveAccount: 'accounts.manage',
      confirmDeleteAccount: 'accounts.manage', executeDelete: 'accounts.manage',
      handleTransfer: 'finance.transactions',
      exportAllAccountsExcel: 'finance.export', exportAllAccountsPDF: 'finance.export',
      exportAccountExcel: 'finance.export', exportAccountPDF: 'finance.export'
    },
    'barcode-generator.html': {
      addCurrentToLabelsGrid: 'barcode.manage', triggerPrint: 'barcode.manage',
      downloadPreviewAsImage: 'barcode.manage', clearPreviewZone: 'barcode.manage'
    },
    'branches.html': {
      openTransferModal: 'inventory.transfer', openTransferVariantModal: 'inventory.transfer',
      processTransfer: 'inventory.transfer', addProdToTransferCart: 'inventory.transfer', addVariantToTransfer: 'inventory.transfer',
      openEditBranchModal: 'branches.manage', openDeleteBranchModal: 'branches.manage',
      saveBranch: 'branches.manage', saveEditedBranch: 'branches.manage', saveManager: 'branches.manage',
      toggleBranchStatus: 'branches.manage', confirmDeleteBranch: 'branches.manage',
      exportHistoryExcel: 'products.export', exportHistoryPdf: 'products.export'
    },
    'cashier.html': {
      holdInvoice: 'sales.hold', openSuspendedModal: 'sales.hold', deleteSuspendedInvoice: 'sales.hold', clearBasket: 'sales.clearCart',
      applyDiscountValue: 'sales.discount', handleQuickProductSubmit: 'products.create'
    },
    'مرجع المبيعات.html': {
      saveReturnInvoice: ['sales.create','sales.edit'], editSalesReturn: 'sales.edit', openDeleteSalesReturn: 'sales.delete', confirmDeleteSalesReturn: 'sales.delete'
    },
    'customer-groups.html': {
      openGroupModal: 'customerGroups.manage', saveGroupData: 'customerGroups.manage',
      selectAllCustomers: 'customerGroups.manage', triggerPrint: 'customers.export'
    },
    'customers.html': {
      editCustomer: 'customers.edit', deleteCustomer: 'customers.delete',
      exportTableToExcel: 'customers.export', exportTableToPDF: 'customers.export',
      exportTableToImage: 'customers.export', exportRowPDF: 'customers.export', exportRowImage: 'customers.export'
    },
    'printer-settings.html': { savePrinterSettings: 'printer.edit', saveBarcodeSettings: 'printer.edit' },
    'products.html': {
      openProductModal: 'products.create', stageCurrentProduct: 'products.create', saveFinalPurchase: 'products.create',
      addVariantRow: 'products.create', editProduct: 'products.edit', editStagedItem: 'products.edit',
      deleteProduct: 'products.delete', deleteStagedItem: 'products.delete',
      openAdvancedTransferModal: 'inventory.transfer', openTransferVariantSelector: 'inventory.transfer',
      confirmTransferAction: 'inventory.transfer', addProdToTransfer: 'inventory.transfer', addVariantToTransferById: 'inventory.transfer',
      exportExcel: 'products.export', exportPDF: 'products.export', exportImage: 'products.export',
      exportTransferExcel: 'products.export', exportTransferPDF: 'products.export', exportTransferImage: 'products.export'
    },
    'categories.html': {
      openCategoryModal: 'products.edit', saveCategory: 'products.edit', deleteCategory: 'products.edit', toggleCategoryProduct: 'products.edit'
    },
    'materials.html': {
      openMaterialModal: 'materials.manage', saveMaterialPurchase: 'materials.manage', editMaterial: 'materials.manage', deleteMaterial: 'materials.manage',
      exportMaterialsExcel: 'materials.export', exportMaterialsPDF: 'materials.export'
    },
    'sales-offers.html': {
      'offerPage.openModal': 'offers.manage', 'offerPage.save': 'offers.manage', 'offerPage.edit': 'offers.manage',
      'offerPage.remove': 'offers.manage', 'offerPage.exportAll': 'reports.export', 'offerPage.exportOne': 'reports.export'
    },
    'sands.html': {
      openVoucherModal: 'vouchers.manage', saveVoucher: 'vouchers.manage', editVoucher: 'vouchers.manage',
      confirmDelete: 'vouchers.manage', executeDelete: 'vouchers.manage',
      exportAllVouchersExcel: 'vouchers.export', exportAllVouchersPDF: 'vouchers.export',
      exportAllVouchersImage: 'vouchers.export', exportVoucherPDF: 'vouchers.export',
      exportVoucherImage: 'vouchers.export', printVoucher: 'vouchers.export'
    },
    'notifications.html': { openSettings: 'notifications.manage', saveSettings: 'notifications.manage', payEmployeeSalary: 'employees.manage' },
    'financial-groups.html': { toggleForm: 'financialGroups.create', saveNewGroup: 'financialGroups.create', selectGroup: 'financialGroups.switch' },
    'setting.html': {
      saveSystemSettings: 'settings.edit', openPasswordModal: 'settings.edit',
      handlePasswordChange: 'settings.edit', saveSmsSettings: 'settings.sms', insertVariable: 'settings.sms'
    },
    'shortages.html': {
      openOrderModal: 'shortages.supply', openProductModal: 'products.create',
      handleQuickSupply: 'shortages.supply', saveQuickProduct: 'products.create'
    },
    'storage-settings.html': { runCompaction: 'storage.manage', saveStorage: 'storage.manage' },
    'suppliers.html': {
      openAddSupplierModal: 'suppliers.create', editSupplier: 'suppliers.edit', saveSupplier: ['suppliers.create', 'suppliers.edit'],
      executePayment: 'suppliers.balance', executeManualDebt: 'suppliers.balance',
      confirmDelete: 'suppliers.delete', executeDelete: 'suppliers.delete',
      exportAllSuppliersExcel: 'suppliers.export', exportAllSuppliersPDF: 'suppliers.export',
      exportIndividualPDF: 'suppliers.export', exportIndividualExcel: 'suppliers.export'
    },
    'tax-settings.html': { saveTax: 'tax.edit', confirmDelete: 'tax.edit' },
    'units.html': { openModal: 'units.manage', saveUnit: 'units.manage', editUnit: 'units.manage', deleteUnit: 'units.manage' },
    'warehouses.html': {
      openTransferModal: 'inventory.transfer', openTransferVariantModal: 'inventory.transfer', processTransfer: 'inventory.transfer',
      addProdToTransferCart: 'inventory.transfer', addVariantToTransfer: 'inventory.transfer',
      saveStockAdjustment: 'inventory.adjust', openEditModal: 'inventory.adjust', openDeleteModal: 'inventory.adjust',
      confirmDeleteProduct: 'inventory.adjust', saveNewStore: 'warehouses.manage',
      exportHistoryExcel: 'products.export', exportHistoryPdf: 'products.export',
      openExportModal: 'products.export', executeExport: 'products.export', exportToExcel: 'products.export', exportToPdf: 'products.export'
    },
    'ادارة التصنيع.html': {
      openRecipe: 'manufacturing.manage', openProduction: 'manufacturing.manage', saveRecipe: 'manufacturing.manage',
      addIngredient: 'manufacturing.manage', executeProduction: 'manufacturing.manage'
    },
    'استيراد وتصدير ل كل قسم.html': {
      triggerFullBackup: 'backup.exportImport', triggerFullRestore: 'backup.exportImport', handleFullRestore: 'backup.exportImport',
      exportSection: 'backup.exportImport', importSection: 'backup.exportImport', handleSectionImport: 'backup.exportImport'
    },
    'التقارير.html': { exportExcel: 'reports.export', exportPDF: 'reports.export', sendReport: 'reports.send' },
    'العمال والاجور.html': {
      openAddModal: 'workers.manage', openEditWorker: 'workers.manage', openDeleteWorker: 'workers.manage',
      saveWorker: ['workers.manage'], confirmDeleteWorker: 'workers.manage',
      openPayWorker: 'workers.payments', openDebtWorker: 'workers.payments',
      executePayment: 'workers.payments', executeDebt: 'workers.payments',
      exportToExcel: 'workers.export', exportToPDF: 'workers.export'
    },
    'المشتريات.html': {
      addNewProductRow: 'purchases.create', savePurchaseInvoice: 'purchases.create',
      openEditModal: 'purchases.edit', saveEditInvoice: 'purchases.edit',
      openDeleteModal: 'purchases.delete', confirmDeleteInvoice: 'purchases.delete',
      exportExcel: 'purchases.export', exportPDF: 'purchases.export'
    },
    'المصاريف.html': {
      openExpenseModal: 'expenses.manage', openEditExpense: 'expenses.manage', openTypeModal: 'expenses.manage',
      saveExpense: 'expenses.manage', saveExpenseType: 'expenses.manage',
      openDeleteExpenseModal: 'expenses.manage', executeDeleteExpense: 'expenses.manage',
      exportExcel: 'expenses.export', exportPDF: 'expenses.export'
    },
    'المناديب.html': {
      openAgentModal: 'agents.manage', saveAgent: 'agents.manage', openDeleteAgentModal: 'agents.manage',
      confirmDeleteAgent: 'agents.manage', openStockLoadModal: 'agents.stock', processLoadAction: 'agents.stock',
      openSettleModal: 'agents.settle', processSettlement: 'agents.settle',
      openPayModal: 'agents.payments', openPayRepModal: 'agents.payments', processPayment: 'agents.payments', processPayRep: 'agents.payments',
      exportMainExcel: 'agents.export', exportMainPDF: 'agents.export',
      exportAgentHistoryExcel: 'agents.export', exportAgentHistoryPDF: 'agents.export'
    },
    'الموظفين.html': {
      openAddModal: 'employees.manage', openEditModal: 'employees.manage', openDeleteModal: 'employees.manage',
      saveEmployee: 'employees.manage', confirmDelete: 'employees.manage', toggleEmployeeStatus: 'employees.manage',
      setAllPermissions: 'permissions.manage', exportToExcel: 'employees.export', exportToPDF: 'employees.export'
    },
    'مرجع المشتريات.html': {
      addNewProductRow: 'purchaseReturns.create', savePurchaseReturn: 'purchaseReturns.create',
      openEditReturn: 'purchaseReturns.edit', saveEditReturn: 'purchaseReturns.edit',
      openDeleteReturn: 'purchaseReturns.delete', confirmDeleteReturn: 'purchaseReturns.delete',
      exportExcel: 'purchaseReturns.export', exportPDF: 'purchaseReturns.export'
    }
  };

  const ACTION_SELECTOR_RULES = {
    'customers.html': [
      ['#openCustomerModalBtn', 'customers.create'],
      ['#customerForm', ['customers.create', 'customers.edit']]
    ],
    'warehouses.html': [['form[onsubmit*="saveNewStore"]', 'warehouses.manage']],
    'setting.html': [
      ['form[onsubmit*="saveSystemSettings"]', 'settings.edit'],
      ['form[onsubmit*="saveSmsSettings"]', 'settings.sms']
    ]
  };

  const LEGACY_PERMISSION_MAP = {
    dashboard: ['dashboard.view'],
    pos: ['pos.access', 'sales.create', 'sales.edit', 'sales.delete', 'sales.print', 'sales.image', 'sales.discount', 'sales.changePrice', 'sales.credit', 'sales.hold', 'sales.clearCart'],
    products: ['products.view', 'materials.view', 'warehouses.view', 'branches.view', 'units.view', 'shortages.view', 'barcode.view', 'products.create', 'products.edit', 'products.delete', 'products.export', 'materials.manage', 'materials.export', 'inventory.adjust', 'inventory.transfer', 'inventory.importExport', 'warehouses.manage', 'branches.manage', 'units.manage', 'shortages.supply', 'barcode.manage'],
    customers: ['customers.view', 'customerGroups.view', 'sales.invoices.view', 'customers.create', 'customers.edit', 'customers.delete', 'customers.balance', 'customers.export', 'customerGroups.manage'],
    suppliers: ['suppliers.view', 'purchases.view', 'purchaseReturns.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.export', 'purchases.discount', 'purchaseReturns.create', 'purchaseReturns.edit', 'purchaseReturns.delete', 'purchaseReturns.export', 'suppliers.create', 'suppliers.edit', 'suppliers.delete', 'suppliers.balance', 'suppliers.export'],
    funds: ['accounts.view', 'journal.view', 'vouchers.view', 'expenses.view', 'accounts.manage', 'finance.transactions', 'finance.deleteTransactions', 'finance.export', 'expenses.manage', 'expenses.export', 'vouchers.manage', 'vouchers.export', 'journal.manage', 'journal.export'],
    reports: ['reports.view', 'reports.export', 'reports.send'],
    settings: ['employees.view', 'workers.view', 'agents.view', 'manufacturing.view', 'offers.view', 'notifications.view', 'settings.system', 'settings.printer', 'settings.tax', 'settings.storage', 'backup.manage', 'employees.manage', 'employees.export', 'permissions.manage', 'workers.manage', 'workers.payments', 'workers.export', 'agents.manage', 'agents.stock', 'agents.settle', 'agents.payments', 'agents.export', 'manufacturing.manage', 'settings.edit', 'settings.sms', 'printer.edit', 'tax.edit', 'storage.manage', 'offers.manage', 'notifications.manage', 'sync.run', 'backup.exportImport', 'app.install']
  };

  function normalizePermissions(input) {
    const source = input && typeof input === 'object' ? input : {};
    const normalized = {};
    Object.entries(source).forEach(([key, value]) => {
      if (key.includes('.')) normalized[key] = value === true;
      else if (LEGACY_PERMISSION_MAP[key] && value === true) LEGACY_PERMISSION_MAP[key].forEach(permission => { normalized[permission] = true; });
    });
    return normalized;
  }

  function can(permission, session = getSession()) {
    if (!permission) return true;
    if (!session) return false;
    if (['admin', 'owner', 'superadmin'].includes(String(session.role || '').toLowerCase())) return true;
    const normalized = normalizePermissions(session.permissions);
    if (Object.keys(normalized).length === 0) {
      return String(session.role || '').toLowerCase() !== 'employee';
    }
    return normalized[permission] === true;
  }

  const NON_ARRAY_DEFAULTS = {
    cashtop_funds_db: { version: 5, accounts: [], accountLogs: [] },
    cashtop_settings: {},
    cashtop_db: {},
    cashtop_invoice_design: {},
    cashtop_company_access: {},
    cashtop_printer_settings: {},
    cashtop_barcode_settings: {},
    cashtop_sms_template: '',
    cashtop_invoice_message_template: 'مرحباً {name}، فاتورتك رقم {invoice} لدى {store}. الأصناف:\n{items}\nالإجمالي: {total}، المدفوع: {paid}، المتبقي: {balance}.',
    cashtop_tax_settings: { enabled: false, salesRate: 0, purchaseRate: 0, salesBearer: 'customer', purchaseBearer: 'business', pricesIncludeTax: false, rates: [], defaultSalesTaxId: null, defaultPurchaseTaxId: null },
    cashtop_notification_settings: { lowStockThreshold: 5, debtOverdueDays: 30, inactiveCustomerDays: 45, expiryWarningDays: 30, enabled: false, dailySummaryEnabled: true },
    cashtop_archive_index: { lastCompactionAt: 0, archivedCounts: {} }
  };

  /*
   * IndexedDB هو طبقة التخزين المحلية المتينة والكبيرة. localStorage يبقى
   * كـ hot cache متزامن حتى لا نكسر الصفحات القديمة التي تتوقع getItem فوراً،
   * بينما كل بيانات الشركة والـ meta وطابور المزامنة تُنسخ أيضاً إلى IndexedDB.
   * عند امتلاء localStorage تبقى القيمة في الذاكرة + IndexedDB بدلاً من فشل الحفظ.
   */
  const DURABLE_LOCAL_DB = 'cashtop-local-durable-v2';
  const DURABLE_LOCAL_STORE = 'kv';
  const durableMemory = new Map();
  let durableDbPromise = null;
  let durableWriteChain = Promise.resolve();
  let durableReadyPromise = Promise.resolve({ restored: 0 });

  const DURABLE_GLOBAL_KEYS = new Set([
    ...GLOBAL_KEYS,
    'ct_storage_persistence_v1',
    'cashtop_indexeddb_notice_shown_v1',
    'ct_image_outbox_fallback_meta_v1'
  ]);

  function isDurableLocalKey(key) {
    return typeof key === 'string' && (
      DURABLE_GLOBAL_KEYS.has(key) ||
      key.startsWith('cashtop_data::') ||
      key.startsWith('cashtop_meta::') ||
      key.startsWith('ct_sync_queue::') ||
      key.startsWith('ct_sync_queue_reset_at::') ||
      key.startsWith('ct_sync_queue_revision::') ||
      key.startsWith('cashtop_tx::')
    );
  }

  function isQuotaError(error) {
    return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      /quota|storage.*full|exceeded/i.test(String(error?.message || ''));
  }

  function openDurableLocalDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (durableDbPromise) return durableDbPromise;
    durableDbPromise = new Promise(resolve => {
      try {
        const request = indexedDB.open(DURABLE_LOCAL_DB, 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(DURABLE_LOCAL_STORE)) {
            db.createObjectStore(DURABLE_LOCAL_STORE, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => console.warn('[CASH TOP 2] durable local DB upgrade is blocked by another tab.');
      } catch (_) { resolve(null); }
    });
    return durableDbPromise;
  }

  async function persistDurableLocalKey(key, value) {
    if (!isDurableLocalKey(key)) return false;
    const db = await openDurableLocalDb();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(DURABLE_LOCAL_STORE, 'readwrite');
        tx.objectStore(DURABLE_LOCAL_STORE).put({ key, value: String(value), savedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  async function readDurableLocalKey(key) {
    if (!isDurableLocalKey(key)) return null;
    const db = await openDurableLocalDb();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(DURABLE_LOCAL_STORE, 'readonly');
        const request = tx.objectStore(DURABLE_LOCAL_STORE).get(key);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  async function deleteDurableLocalKey(key) {
    if (!isDurableLocalKey(key)) return false;
    const db = await openDurableLocalDb();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(DURABLE_LOCAL_STORE, 'readwrite');
        tx.objectStore(DURABLE_LOCAL_STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function scheduleDurablePersist(key, value) {
    if (!isDurableLocalKey(key)) return;
    durableWriteChain = durableWriteChain
      .catch(() => false)
      .then(() => persistDurableLocalKey(key, value))
      .catch(() => false);
  }

  function scheduleDurableDelete(key) {
    if (!isDurableLocalKey(key)) return;
    durableWriteChain = durableWriteChain
      .catch(() => false)
      .then(() => deleteDurableLocalKey(key))
      .catch(() => false);
  }

  async function flushDurableLocalWrites() {
    try { await durableWriteChain; } catch (_) {}
    return true;
  }

  /*
   * Critical business writes (especially invoices) must survive navigation even
   * when localStorage is full.  IndexedDB is the durable source; localStorage is
   * only a synchronous compatibility mirror for legacy pages.  This routine
   * explicitly commits the selected physical datasets + metadata + sync queue
   * before the UI reports a successful save.
   */
  async function commitCriticalData(keys = [], options = {}) {
    const requested = [...new Set((Array.isArray(keys) ? keys : [keys]).map(canonicalKey).filter(isManagedKey))];
    try { await durableReadyPromise; } catch (_) {}
    await flushDurableLocalWrites();

    const persisted = [];
    const failed = [];
    for (const canonical of requested) {
      const ns = namespaceKey(canonical);
      const metaNs = metaKey(canonical);
      const value = rawGet(ns);
      const metaValue = rawGet(metaNs);
      if (value !== null) {
        const ok = await persistDurableLocalKey(ns, value).catch(() => false);
        (ok ? persisted : failed).push(ns);
      }
      if (metaValue !== null) {
        const ok = await persistDurableLocalKey(metaNs, metaValue).catch(() => false);
        if (!ok) failed.push(metaNs);
      }
    }

    const queue = getSyncQueue();
    try { await backupSyncQueue(queue); } catch (_) {}
    const queuePairs = [
      [syncQueueKey(), JSON.stringify(queue)],
      [syncQueueResetMarkerKey(), String(syncQueueResetAt() || 0)],
      [syncQueueRevisionMarkerKey(), String(rawGet(syncQueueRevisionMarkerKey()) || '')]
    ];
    for (const [key, value] of queuePairs) {
      const ok = await persistDurableLocalKey(key, value).catch(() => false);
      if (!ok) failed.push(key);
    }

    let recordVerified = true;
    const verifyKey = options.recordKey ? canonicalKey(options.recordKey) : '';
    const requestedRecordIds = [...new Set([
      ...(Array.isArray(options.recordIds) ? options.recordIds : []),
      ...(options.recordId != null && options.recordId !== '' ? [options.recordId] : [])
    ].map(value => String(value)).filter(Boolean))];
    const missingRecordIds = [];
    if (verifyKey && requestedRecordIds.length) {
      const physical = namespaceKey(verifyKey);
      const durableRaw = await readDurableLocalKey(physical).catch(() => null);
      const mirrorRaw = rawGet(physical);
      const present = new Set();
      // افحص النسختين بدلاً من تفضيل نسخة IndexedDB قديمة عند تعذر آخر write.
      // النجاح مقبول إذا كان السجل المقصود قابلاً للقراءة من طبقة واحدة على الأقل،
      // بينما غيابه من الطبقتين يمنع واجهة الفاتورة من إعلان نجاح الحفظ.
      [durableRaw, mirrorRaw].forEach(raw => {
        const parsed = safeJson(raw, []);
        const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? Object.values(parsed) : []);
        rows.forEach(row => {
          const id = String(recordIdentity(row) || row?.id || '');
          if (id) present.add(id);
        });
      });
      requestedRecordIds.forEach(id => { if (!present.has(id)) missingRecordIds.push(id); });
      recordVerified = missingRecordIds.length === 0;
    }

    // A browser without IndexedDB may still have successfully written the hot
    // localStorage mirror.  For critical record verification accept either copy,
    // but never claim success when the record cannot be read from either layer.
    const ok = recordVerified && (failed.length === 0 || requested.every(canonical => rawGet(namespaceKey(canonical)) !== null));
    return { ok, durable: failed.length === 0, recordVerified, missingRecordIds, persisted, failed, queueLength: queue.length };
  }

  function rawGet(key) {
    if (durableMemory.has(key)) return durableMemory.get(key);
    return RAW.get.call(localStorage, key);
  }

  function rawSet(key, value) {
    const stringValue = String(value);
    let storedInLocalStorage = true;
    try {
      RAW.set.call(localStorage, key, stringValue);
      durableMemory.delete(key);
    } catch (error) {
      if (!isDurableLocalKey(key) || !isQuotaError(error)) throw error;
      storedInLocalStorage = false;
      durableMemory.set(key, stringValue);
      window.dispatchEvent(new CustomEvent('cashtop:local-storage-pressure', { detail: { key } }));
    }
    scheduleDurablePersist(key, stringValue);
    return storedInLocalStorage;
  }

  function rawRemove(key) {
    durableMemory.delete(key);
    try { RAW.remove.call(localStorage, key); } catch (_) {}
    scheduleDurableDelete(key);
  }

  async function restoreDurableCompanyData() {
    const db = await openDurableLocalDb();
    if (!db) return { restored: 0 };
    const tenant = encodeURIComponent(tenantIdFromSession());
    const dataPrefix = `cashtop_data::${tenant}::`;
    const metaPrefix = `cashtop_meta::${tenant}::`;
    const activeGroup = currentFinancialGroupId();
    const activeGroupDataPrefix = activeGroup === LEGACY_FINANCIAL_GROUP_ID ? dataPrefix : `${dataPrefix}fg::${encodeURIComponent(activeGroup)}::`;
    const activeGroupMetaPrefix = activeGroup === LEGACY_FINANCIAL_GROUP_ID ? metaPrefix : `${metaPrefix}fg::${encodeURIComponent(activeGroup)}::`;
    const prefixes = [
      dataPrefix,
      metaPrefix,
      `ct_sync_queue::${tenant}`,
      `ct_sync_queue_reset_at::${tenant}`,
      `ct_sync_queue_revision::${tenant}`,
      `cashtop_tx::${tenant}::`
    ];
    const records = await new Promise(resolve => {
      try {
        const tx = db.transaction(DURABLE_LOCAL_STORE, 'readonly');
        const request = tx.objectStore(DURABLE_LOCAL_STORE).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
    const recordMap = new Map(records.map(record => [String(record?.key || ''), record]));
    // If R99/R98 was closed after a local save but before the hot localStorage
    // mirror was refreshed, the durable queue tells us which IndexedDB datasets
    // are authoritative. Prefer those pending local copies over a newer-looking
    // stale remote mirror so unsynced invoices cannot vanish on restart.
    const durableQueueKey = `ct_sync_queue::${tenant}`;
    const durableResetKey = `ct_sync_queue_reset_at::${tenant}`;
    const durableResetAt = Math.max(0, Number(recordMap.get(durableResetKey)?.value || 0));
    const durableGeneration = String(durableResetAt || 'legacy');
    const durableQueueRaw = safeJson(recordMap.get(durableQueueKey)?.value, []);
    const durablePendingKeys = new Set((Array.isArray(durableQueueRaw) ? durableQueueRaw : [])
      .filter(item => !durableResetAt || String(item?.queueGeneration || '') === durableGeneration)
      .map(item => canonicalKey(item?.key || ''))
      .filter(key => DATA_KEYS.includes(key)));
    let restored = 0;
    const restoredDatasets = new Set();

    const writeRestored = (key, value) => {
      try {
        RAW.set.call(localStorage, key, value);
        durableMemory.delete(key);
      } catch (error) {
        if (!isQuotaError(error)) return false;
        durableMemory.set(key, value);
      }
      return true;
    };

    // استرجع المفاتيح العامة الصغيرة أيضاً. هذه مهمة لاستمرار الجلسة وربط
    // الشركة حتى لو امتلأ localStorage واضطررنا لحفظها في IndexedDB.
    for (const record of records) {
      const key = String(record?.key || '');
      if (!DURABLE_GLOBAL_KEYS.has(key)) continue;
      if (rawGet(key) !== null) continue;
      if (writeRestored(key, String(record?.value ?? ''))) restored += 1;
    }

    // البيانات أولاً، مع السماح لـ IndexedDB باستبدال القيم الفارغة التي أنشأها seed.
    for (const record of records) {
      const key = String(record?.key || '');
      if (!key.startsWith(dataPrefix)) continue;
      const suffixForGroup = key.slice(dataPrefix.length);
      if (suffixForGroup.startsWith('fg::') && !key.startsWith(activeGroupDataPrefix)) continue;
      const dataset = logicalDatasetFromPhysicalKey(key, tenantIdFromSession());
      // Unprefixed scoped rows belong to FG_LEGACY. When another financial group
      // is selected they must stay untouched in IndexedDB, not be restored into
      // the current page's logical dataset stream. Shared datasets are still restored.
      if (activeGroup !== LEGACY_FINANCIAL_GROUP_ID && !suffixForGroup.startsWith('fg::') && FINANCIAL_GROUP_SCOPED_KEYS.has(dataset)) continue;
      const physicalSuffix = key.slice(dataPrefix.length);
      const currentRaw = rawGet(key);
      const currentMeta = safeJson(rawGet(`${metaPrefix}${physicalSuffix}`), {}) || {};
      const durableMeta = safeJson(recordMap.get(`${metaPrefix}${physicalSuffix}`)?.value, {}) || {};
      const shouldRestore = durablePendingKeys.has(dataset) || currentRaw === null || currentMeta.seeded === true || Number(currentMeta.updatedAt || 0) <= 0 ||
        Number(durableMeta.updatedAt || 0) > Number(currentMeta.updatedAt || 0);
      if (!shouldRestore) continue;
      if (writeRestored(key, String(record?.value ?? ''))) {
        restored += 1;
        restoredDatasets.add(dataset);
      }
    }

    // ثم الـ meta والطابور والمعاملات غير المكتملة.
    for (const record of records) {
      const key = String(record?.key || '');
      if (!prefixes.some(prefix => key.startsWith(prefix)) || key.startsWith(dataPrefix)) continue;
      if (key.startsWith(metaPrefix)) {
        const metaSuffix = key.slice(metaPrefix.length);
        if (metaSuffix.startsWith('fg::') && !key.startsWith(activeGroupMetaPrefix)) continue;
        const metaDataset = logicalDatasetFromPhysicalKey(key, tenantIdFromSession());
        if (activeGroup !== LEGACY_FINANCIAL_GROUP_ID && !metaSuffix.startsWith('fg::') && FINANCIAL_GROUP_SCOPED_KEYS.has(metaDataset)) continue;
      }
      const current = rawGet(key);
      let shouldRestore = current === null;
      if (key.startsWith(metaPrefix)) {
        const currentMeta = safeJson(current, {}) || {};
        const durableMeta = safeJson(record?.value, {}) || {};
        shouldRestore = shouldRestore || durablePendingKeys.has(metaDataset) || currentMeta.seeded === true || Number(currentMeta.updatedAt || 0) <= 0 ||
          Number(durableMeta.updatedAt || 0) > Number(currentMeta.updatedAt || 0);
      }
      if (!shouldRestore) continue;
      if (writeRestored(key, String(record?.value ?? ''))) restored += 1;
    }

    if (restored) {
      restoredDatasets.forEach(key => {
        dispatchLogicalStorageEvents(key, null, rawGet(namespaceKey(key)));
        window.dispatchEvent(new CustomEvent('cashtop:remote-applied', { detail: { key, source: 'indexeddb-restore' } }));
      });
      window.dispatchEvent(new CustomEvent('cashtop:durable-restored', { detail: { restored, datasets: [...restoredDatasets] } }));
    }
    return { restored, datasets: [...restoredDatasets] };
  }

  function safeJson(value, fallback = null) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function trustedNowMs(session = null) {
    const activeSession = session || getSession?.() || {};
    let offset = Number(activeSession?.serverClockOffsetMs);
    let observedAt = Number(activeSession?.serverClockObservedAt);
    if (!Number.isFinite(offset) || !Number.isFinite(observedAt)) {
      const snapshot = safeJson(rawGet('cashtop_server_clock_v1'), {}) || {};
      offset = Number(snapshot.offsetMs);
      observedAt = Number(snapshot.observedAt);
    }
    if (Number.isFinite(offset) && Number.isFinite(observedAt) && Date.now() - observedAt < 30 * 86400000) return Date.now() + offset;
    // لا نستخدم startAt لمنع الدخول: المفتاح النشط يبدأ من لحظة تفعيله في الإدارة.
    // وإذا كانت ساعة اللابتوب مضبوطة على سنة بعيدة جداً، لا نجعلها وحدها تنهي
    // مفتاحاً نشطاً قبل أن نحصل على توقيت خادم موثوق من أول اتصال شبكي.
    const localNow = Date.now();
    const plausibleMin = Date.UTC(2024, 0, 1);
    const plausibleMax = Date.UTC(2038, 0, 1);
    if (localNow < plausibleMin || localNow > plausibleMax) {
      const lastCheck = Number(activeSession?.lastLicenseCheck || 0);
      if (Number.isFinite(lastCheck) && lastCheck >= plausibleMin && lastCheck <= plausibleMax) return lastCheck;
    }
    return localNow;
  }

  function normalizeArrayValue(value, fallback = []) {
    let parsed = value;
    // Turso login/bootstrap data can arrive as an encoded JSON string, a
    // normal array, or an object keyed by numeric/Turso ids. Normalize all
    // three shapes so callers never fail on .find/.filter/.map.
    for (let i = 0; i < 2 && typeof parsed === 'string'; i += 1) {
      const decoded = safeJson(parsed, null);
      if (decoded === null) break;
      parsed = decoded;
    }
    if (Array.isArray(parsed)) return parsed.filter(item => item != null);
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([key, item]) => {
        if (item && typeof item === 'object' && !Array.isArray(item) && item.id == null && !/^\d+$/.test(key)) {
          return { ...item, id: key };
        }
        return item;
      }).filter(item => item != null);
    }
    return Array.isArray(fallback) ? [...fallback] : [];
  }
  function canonicalKey(key) { return ALIASES[key] || key; }

  function baseNamespaceKey(key, companyId = tenantIdFromSession()) {
    return `cashtop_data::${encodeURIComponent(companyId)}::${canonicalKey(key)}`;
  }
  function baseMetaKey(key, companyId = tenantIdFromSession()) {
    return `cashtop_meta::${encodeURIComponent(companyId)}::${canonicalKey(key)}`;
  }
  function financialGroupSelectionKey(companyId = tenantIdFromSession()) {
    return `ct_financial_group_view_v1::${encodeURIComponent(companyId)}`;
  }
  function financialGroupToastKey(companyId = tenantIdFromSession()) {
    return `ct_financial_group_toast_v1::${encodeURIComponent(companyId)}`;
  }
  function normalizeFinancialGroups(value) {
    const source = Array.isArray(value) ? value : [];
    const list = source.map((group, index) => ({
      id: String(group?.id || `FG_${index + 1}`),
      name: String(group?.name || `مجموعة مالية ${index + 1}`),
      status: group?.status === 'closed' ? 'closed' : 'active',
      createdAt: group?.createdAt || group?.openedAt || new Date().toISOString(),
      openedAt: group?.openedAt || group?.createdAt || new Date().toISOString(),
      closedAt: group?.closedAt || '',
      previousGroupId: group?.previousGroupId || '',
      nextGroupId: group?.nextGroupId || '',
      legacy: group?.legacy === true,
      capitalOpening: Number(group?.capitalOpening || 0),
      capitalClosing: Number(group?.capitalClosing || 0),
      closingSummary: group?.closingSummary && typeof group.closingSummary === 'object' ? group.closingSummary : null,
      openingSummary: group?.openingSummary && typeof group.openingSummary === 'object' ? group.openingSummary : null,
      settingsSource: group?.settingsSource || 'previous',
      createdBy: group?.createdBy || ''
    }));
    if (!list.length) {
      list.push({
        id: LEGACY_FINANCIAL_GROUP_ID,
        name: 'المجموعة الأساسية',
        status: 'active',
        legacy: true,
        createdAt: new Date().toISOString(),
        openedAt: new Date().toISOString(),
        closedAt: '', previousGroupId: '', nextGroupId: '',
        capitalOpening: 0, capitalClosing: 0, closingSummary: null, openingSummary: null, createdBy: ''
      });
    }
    const active = list.filter(group => group.status === 'active');
    if (active.length > 1) {
      const keep = active[active.length - 1].id;
      list.forEach(group => { if (group.status === 'active' && group.id !== keep) group.status = 'closed'; });
    } else if (!active.length) {
      list[list.length - 1].status = 'active';
    }
    return list;
  }
  function getFinancialGroups(companyId = tenantIdFromSession()) {
    const raw = rawGet(baseNamespaceKey(FINANCIAL_GROUPS_KEY, companyId));
    return normalizeFinancialGroups(safeJson(raw, []));
  }
  function explicitFinancialGroupId(companyId = tenantIdFromSession()) {
    try { return String(sessionStorage.getItem(financialGroupSelectionKey(companyId)) || '').trim(); } catch (_) { return ''; }
  }
  function currentFinancialGroupId(companyId = tenantIdFromSession()) {
    const groups = getFinancialGroups(companyId);
    const explicit = explicitFinancialGroupId(companyId);
    if (explicit) {
      const selected = groups.find(group => group.id === explicit);
      if (selected && (selected.status !== 'closed' || can('financialGroups.viewClosed'))) return explicit;
      // A permission may have been revoked while this tab still remembered an old
      // closed folder. Drop that selection so the employee falls back to the active
      // group and cannot bypass viewClosed by keeping a stale sessionStorage id.
      try { sessionStorage.removeItem(financialGroupSelectionKey(companyId)); } catch (_) {}
    }
    return String(groups.find(group => group.status === 'active')?.id || groups[groups.length - 1]?.id || LEGACY_FINANCIAL_GROUP_ID);
  }
  function getCurrentFinancialGroup(companyId = tenantIdFromSession()) {
    const id = currentFinancialGroupId(companyId);
    return getFinancialGroups(companyId).find(group => group.id === id) || null;
  }
  function isFinancialGroupScopedKey(key) {
    return FINANCIAL_GROUP_SCOPED_KEYS.has(canonicalKey(key));
  }
  function isFinancialGroupReadOnly(companyId = tenantIdFromSession()) {
    return getCurrentFinancialGroup(companyId)?.status === 'closed';
  }
  function financialGroupNamespaceKey(key, groupId, companyId = tenantIdFromSession()) {
    const canonical = canonicalKey(key);
    if (!FINANCIAL_GROUP_SCOPED_KEYS.has(canonical) || String(groupId || '') === LEGACY_FINANCIAL_GROUP_ID) {
      return baseNamespaceKey(canonical, companyId);
    }
    return `cashtop_data::${encodeURIComponent(companyId)}::fg::${encodeURIComponent(String(groupId || LEGACY_FINANCIAL_GROUP_ID))}::${canonical}`;
  }
  function financialGroupMetaKey(key, groupId, companyId = tenantIdFromSession()) {
    const canonical = canonicalKey(key);
    if (!FINANCIAL_GROUP_SCOPED_KEYS.has(canonical) || String(groupId || '') === LEGACY_FINANCIAL_GROUP_ID) {
      return baseMetaKey(canonical, companyId);
    }
    return `cashtop_meta::${encodeURIComponent(companyId)}::fg::${encodeURIComponent(String(groupId || LEGACY_FINANCIAL_GROUP_ID))}::${canonical}`;
  }
  function logicalDatasetFromPhysicalKey(storageKey, companyId = tenantIdFromSession()) {
    const dataPrefix = `cashtop_data::${encodeURIComponent(companyId)}::`;
    const metaPrefix = `cashtop_meta::${encodeURIComponent(companyId)}::`;
    let suffix = storageKey.startsWith(dataPrefix) ? storageKey.slice(dataPrefix.length)
      : storageKey.startsWith(metaPrefix) ? storageKey.slice(metaPrefix.length) : '';
    if (!suffix) return '';
    if (suffix.startsWith('fg::')) {
      const parts = suffix.split('::');
      return canonicalKey(parts.slice(2).join('::'));
    }
    return canonicalKey(suffix);
  }
  const TAB_SESSION_KEY = 'cashtop_tab_session_v2';
  const PERSISTENT_SESSION_KEY = 'cashtop_persistent_session_v1';
  const WINDOW_SESSION_PREFIX = 'CASHTOP_SESSION_V2:';
  function sessionTenantId(session) {
    return session && (session.tenantId || session.companyId || session.companyKey)
      ? String(session.tenantId || session.companyId || session.companyKey)
      : '';
  }
  function getSession() {
    try {
      const session = safeJson(sessionStorage.getItem(TAB_SESSION_KEY), null);
      if (session) return session;
    } catch (_) {}
    try {
      if (String(window.name || '').startsWith(WINDOW_SESSION_PREFIX)) {
        const session = safeJson(String(window.name).slice(WINDOW_SESSION_PREFIX.length), null);
        if (session) { try { sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(session)); } catch (_) {} return session; }
      }
    } catch (_) {}
    try {
      const persistent = safeJson(rawGet(PERSISTENT_SESSION_KEY), null);
      if (persistent) {
        const serialized = JSON.stringify(persistent);
        try { sessionStorage.setItem(TAB_SESSION_KEY, serialized); } catch (_) {}
        try { window.name = WINDOW_SESSION_PREFIX + serialized; } catch (_) {}
        return persistent;
      }
    } catch (_) {}
    return null;
  }
  function persistSession(session) {
    if (!session) return;
    const serialized = JSON.stringify(session);
    try { sessionStorage.setItem(TAB_SESSION_KEY, serialized); } catch (_) {}
    try { rawSet(PERSISTENT_SESSION_KEY, serialized); } catch (_) {}
    try { window.name = WINDOW_SESSION_PREFIX + serialized; } catch (_) {}
  }
  function tenantIdFromSession() {
    const session = getSession();
    return session && (session.tenantId || session.companyId || session.companyKey)
      ? String(session.tenantId || session.companyId || session.companyKey)
      : 'unassigned';
  }
  // companyIdFromSession بقي للاسم القديم، لكن القيمة الآن هي معرّف المستأجر الثابت.
  // هذا يمنع أن يتغير مسار التخزين عند تغيير مفتاح الشركة أو إعادة استخدام مفتاح قديم.
  function companyIdFromSession() { return tenantIdFromSession(); }
  function namespaceKey(key, companyId = tenantIdFromSession(), groupId = null) {
    const canonical = canonicalKey(key);
    if (!FINANCIAL_GROUP_SCOPED_KEYS.has(canonical)) return baseNamespaceKey(canonical, companyId);
    const selectedGroup = groupId || (String(companyId) === String(tenantIdFromSession()) ? currentFinancialGroupId(companyId) : LEGACY_FINANCIAL_GROUP_ID);
    return financialGroupNamespaceKey(canonical, selectedGroup, companyId);
  }
  function metaKey(key, companyId = tenantIdFromSession(), groupId = null) {
    const canonical = canonicalKey(key);
    if (!FINANCIAL_GROUP_SCOPED_KEYS.has(canonical)) return baseMetaKey(canonical, companyId);
    const selectedGroup = groupId || (String(companyId) === String(tenantIdFromSession()) ? currentFinancialGroupId(companyId) : LEGACY_FINANCIAL_GROUP_ID);
    return financialGroupMetaKey(canonical, selectedGroup, companyId);
  }
  function isManagedKey(key) {
    return typeof key === 'string' && key.startsWith('cashtop_') && !GLOBAL_KEYS.has(key) &&
      !key.startsWith('cashtop_data::') && !key.startsWith('cashtop_meta::');
  }
  function getDeviceId() {
    let id = rawGet('cashtop_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      rawSet('cashtop_device_id', id);
    }
    return id;
  }


  function syncQueueKey() {
    return `ct_sync_queue::${encodeURIComponent(companyIdFromSession())}`;
  }

  function syncQueueResetMarkerKey() {
    return `ct_sync_queue_reset_at::${encodeURIComponent(companyIdFromSession())}`;
  }

  function syncQueueRevisionMarkerKey() {
    return `ct_sync_queue_revision::${encodeURIComponent(companyIdFromSession())}`;
  }

  function syncQueueResetAt() {
    return Math.max(0, Number(rawGet(syncQueueResetMarkerKey()) || 0));
  }

  function queueAfterLastReset(queue) {
    const resetAt = syncQueueResetAt();
    if (!Array.isArray(queue)) return [];
    if (!resetAt) return queue;
    const generation = String(resetAt);
    // بعد التصفير لا نعتمد على ساعة الجهاز وحدها؛ لا تقبل العملية إلا إذا
    // أُنشئت صراحةً داخل جيل الطابور الحالي. بذلك لا تعود أي عملية قديمة حتى
    // لو كان createdAt الخاص بها خاطئاً أو مستقبلياً.
    return queue.filter(item => String(item?.queueGeneration || '') === generation);
  }

  /*
   * R59 يبدأ بطابور نظيف مرة واحدة فقط لكل شركة على كل جهاز. هذا يمسح
   * العمليات القديمة التي بقيت عالقة من السيرفر السابق، ولا يمس البيانات
   * المحلية نفسها. أي تعديل يحدث بعد لحظة التصفير يُضاف كعملية جديدة عادية.
   */
  function primeRevisionQueueResetR59() {
    const revisionKey = syncQueueRevisionMarkerKey();
    if (rawGet(revisionKey) === 'r59') return false;
    const resetAt = Date.now();
    rawSet(syncQueueResetMarkerKey(), String(resetAt));
    rawSet(syncQueueKey(), '[]');
    rawSet(revisionKey, 'r59');
    return true;
  }

  const SYNC_QUEUE_DB = 'cashtop-sync-queue-v1';
  const SYNC_QUEUE_STORE = 'queues';
  let syncQueueBackupChain = Promise.resolve();

  function openSyncQueueDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const request = indexedDB.open(SYNC_QUEUE_DB, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) db.createObjectStore(SYNC_QUEUE_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  async function listSyncQueueBackupKeys() {
    const db = await openSyncQueueDb();
    if (!db) return [];
    return new Promise(resolve => {
      try {
        const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
        const request = tx.objectStore(SYNC_QUEUE_STORE).getAllKeys();
        request.onsuccess = () => resolve((Array.isArray(request.result) ? request.result : []).map(String));
        request.onerror = () => resolve([]);
        tx.oncomplete = () => db.close();
      } catch (_) { try { db.close(); } catch (_) {} resolve([]); }
    });
  }

  async function backupSyncQueue(queue) {
    const db = await openSyncQueueDb();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
        tx.objectStore(SYNC_QUEUE_STORE).put(Array.isArray(queue) ? queue : [], syncQueueKey());
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
      } catch (_) { try { db.close(); } catch (_) {} resolve(false); }
    });
  }

  async function restoreSyncQueueBackup() {
    const db = await openSyncQueueDb();
    if (!db) return [];
    const restored = await new Promise(resolve => {
      try {
        const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
        const request = tx.objectStore(SYNC_QUEUE_STORE).get(syncQueueKey());
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => resolve([]);
        tx.oncomplete = () => db.close();
      } catch (_) { try { db.close(); } catch (_) {} resolve([]); }
    });
    const eligible = queueAfterLastReset(restored).slice(-1200);
    if (eligible.length !== restored.length) await backupSyncQueue(eligible).catch(() => false);
    if (!getSyncQueue().length && eligible.length) {
      rawSet(syncQueueKey(), JSON.stringify(eligible));
      updateSyncBadge();
      window.dispatchEvent(new CustomEvent('cashtop:sync-queue-restored', { detail: { count: eligible.length } }));
    }
    return eligible;
  }


  async function readSyncQueueBackupByKey(queueKey) {
    const db = await openSyncQueueDb();
    if (!db) return [];
    return new Promise(resolve => {
      try {
        const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
        const request = tx.objectStore(SYNC_QUEUE_STORE).get(queueKey);
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => resolve([]);
        tx.oncomplete = () => db.close();
      } catch (_) { try { db.close(); } catch (_) {} resolve([]); }
    });
  }

  async function deleteSyncQueueBackupByKey(queueKey) {
    const db = await openSyncQueueDb();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
        tx.objectStore(SYNC_QUEUE_STORE).delete(queueKey);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
      } catch (_) { try { db.close(); } catch (_) {} resolve(false); }
    });
  }

  function legacySyncQueueCandidateKeys() {
    const currentTenant = String(companyIdFromSession());
    const current = syncQueueKey();
    const identifiers = new Set();
    const session = getSession() || {};
    [session.tenantId, session.companyId, session.licenseId, session.companyKey].forEach(value => {
      if (value !== undefined && value !== null && String(value).trim()) identifiers.add(String(value));
    });

    const bindings = safeJson(rawGet('cashtop_tenant_bindings'), {}) || {};
    Object.entries(bindings).forEach(([key, tenant]) => {
      if (String(tenant) === currentTenant && String(key).trim()) identifiers.add(String(key));
    });

    const licenses = normalizeAdminRecords(rawGet('cashtop_admin_licenses'), ['key', 'tenantId', 'companyId']);
    licenses.forEach(item => {
      const tenant = String(item?.tenantId || item?.companyId || item?.id || '');
      if (tenant !== currentTenant) return;
      [item.key, item.id, item.tenantId, item.companyId].forEach(value => {
        if (value !== undefined && value !== null && String(value).trim()) identifiers.add(String(value));
      });
    });

    // نكتشف أيضاً مساحة قديمة مرتبطة صراحةً بنفس tenantId من بيانات الوصول.
    for (let i = 0; i < localStorage.length; i += 1) {
      const candidateQueueKey = RAW.key.call(localStorage, i);
      if (!candidateQueueKey?.startsWith('ct_sync_queue::') || candidateQueueKey === current) continue;
      const encodedId = candidateQueueKey.slice('ct_sync_queue::'.length);
      let legacyId = '';
      try { legacyId = decodeURIComponent(encodedId); } catch (_) { legacyId = encodedId; }
      const accessRaw = rawGet(`cashtop_data::${encodedId}::cashtop_company_access`);
      const access = safeJson(accessRaw, {}) || {};
      const currentCompanyKey = String(session.companyKey || '').trim().toUpperCase();
      const accessCompanyKey = String(access.companyKey || access.licenseKey || access.key || '').trim().toUpperCase();
      if (String(access.tenantId || access.companyId || '') === currentTenant ||
          Boolean(currentCompanyKey && accessCompanyKey === currentCompanyKey)) identifiers.add(legacyId);
    }

    return [...identifiers]
      .map(value => `ct_sync_queue::${encodeURIComponent(value)}`)
      .filter(key => key !== current);
  }

  function mergeLegacyPendingRaw(oldRaw, currentRaw, pending = {}) {
    if (oldRaw === null || oldRaw === undefined) return null;
    if (currentRaw === null || currentRaw === undefined || pending.forceReplace === true) return String(oldRaw);
    const oldValue = safeJson(oldRaw, null);
    const currentValue = safeJson(currentRaw, null);

    const mergeArrayDelta = (source, target, touchedIds = [], deletedIds = []) => {
      if (!Array.isArray(source) || !Array.isArray(target)) return null;
      const touched = new Set(touchedIds || []);
      const deleted = new Set(deletedIds || []);
      if (!touched.size && !deleted.size) return null;
      const sourceMap = new Map(source.map(item => [recordIdentity(item), item]).filter(([id]) => id));
      const merged = new Map(target.map(item => [recordIdentity(item), item]).filter(([id]) => id));
      for (const id of deleted) merged.delete(id);
      for (const id of touched) if (sourceMap.has(id)) merged.set(id, sourceMap.get(id));
      const anonymous = target.filter(item => !recordIdentity(item));
      return [...merged.values(), ...anonymous];
    };

    if (Array.isArray(oldValue) && Array.isArray(currentValue)) {
      const merged = mergeArrayDelta(oldValue, currentValue, pending.touchedIds, pending.deletedIds);
      return merged ? JSON.stringify(merged) : null;
    }

    if (oldValue && currentValue && typeof oldValue === 'object' && typeof currentValue === 'object' &&
        !Array.isArray(oldValue) && !Array.isArray(currentValue)) {
      const touchedFields = pending.touchedFields || [];
      const deletedFields = pending.deletedFields || [];
      if (!touchedFields.length && !deletedFields.length) return null;
      const merged = { ...currentValue };
      for (const field of touchedFields) {
        if (!Object.prototype.hasOwnProperty.call(oldValue, field)) continue;
        const nested = pending.nestedArrayChanges?.[field];
        if (nested && Array.isArray(oldValue[field]) && Array.isArray(currentValue[field])) {
          merged[field] = mergeArrayDelta(oldValue[field], currentValue[field], nested.touchedIds, nested.deletedIds) || oldValue[field];
        } else {
          merged[field] = oldValue[field];
        }
      }
      for (const field of deletedFields) delete merged[field];
      return JSON.stringify(merged);
    }
    return null;
  }

  async function discoverLegacySyncQueueCandidateKeys() {
    const currentQueueKey = syncQueueKey();
    const currentTenant = String(companyIdFromSession());
    const currentSession = getSession() || {};
    const currentCompanyKey = String(currentSession.companyKey || '').trim().toUpperCase();
    const identityHints = new Set([
      currentTenant,
      currentSession.tenantId,
      currentSession.companyId,
      currentSession.licenseId,
      currentSession.companyKey
    ].filter(value => value !== undefined && value !== null && String(value).trim()).map(value => String(value).trim()));
    const candidates = new Set(legacySyncQueueCandidateKeys());
    const backupKeys = await listSyncQueueBackupKeys();
    const storageQueueKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = RAW.key.call(localStorage, i);
      if (key?.startsWith('ct_sync_queue::')) storageQueueKeys.push(key);
    }
    const allKnownQueueKeys = [...new Set([...backupKeys, ...storageQueueKeys])];

    for (const queueKey of allKnownQueueKeys) {
      if (!queueKey.startsWith('ct_sync_queue::') || queueKey === currentQueueKey || candidates.has(queueKey)) continue;
      const encodedLegacyId = queueKey.slice('ct_sync_queue::'.length);
      let legacyTenantId = '';
      try { legacyTenantId = decodeURIComponent(encodedLegacyId); } catch (_) { legacyTenantId = encodedLegacyId; }
      const storageQueue = safeJson(rawGet(queueKey), []);
      const backupQueue = await readSyncQueueBackupByKey(queueKey);
      const queue = [
        ...(Array.isArray(storageQueue) ? storageQueue : []),
        ...(Array.isArray(backupQueue) ? backupQueue : [])
      ];
      let belongsToCurrentCompany = queue.some(item => [
        item?.tenantId,
        item?.companyId,
        item?.licenseId,
        item?.companyKey,
        item?.sourceTenantId
      ].some(value => value !== undefined && value !== null && identityHints.has(String(value).trim())));

      if (!belongsToCurrentCompany) {
        const accessStorageKey = namespaceKey('cashtop_company_access', legacyTenantId);
        const accessRaw = rawGet(accessStorageKey) ?? await readDurableLocalKey(accessStorageKey);
        const access = safeJson(accessRaw, {}) || {};
        const accessTenant = String(access.tenantId || access.companyId || '').trim();
        const accessCompanyKey = String(access.companyKey || access.licenseKey || access.key || '').trim().toUpperCase();
        belongsToCurrentCompany = accessTenant === currentTenant || Boolean(currentCompanyKey && accessCompanyKey === currentCompanyKey);
      }

      if (belongsToCurrentCompany) candidates.add(queueKey);
    }
    return [...candidates];
  }

  async function migrateLegacySyncQueues() {
    const candidates = await discoverLegacySyncQueueCandidateKeys();
    if (!candidates.length) return { migrated: 0, sources: 0 };
    let migrated = 0;
    let sources = 0;

    for (const queueKey of candidates) {
      const encodedLegacyId = queueKey.slice('ct_sync_queue::'.length);
      let legacyTenantId = '';
      try { legacyTenantId = decodeURIComponent(encodedLegacyId); } catch (_) { legacyTenantId = encodedLegacyId; }
      const fromStorage = safeJson(rawGet(queueKey), []);
      const fromBackup = await readSyncQueueBackupByKey(queueKey);
      const combinedAll = [
        ...(Array.isArray(fromStorage) ? fromStorage : []),
        ...(Array.isArray(fromBackup) ? fromBackup : [])
      ];
      const combined = queueAfterLastReset(combinedAll);
      if (!combined.length) {
        // بعد تصفير الطابور لا نعيد عمليات قديمة من localStorage أو IndexedDB.
        rawRemove(queueKey);
        await deleteSyncQueueBackupByKey(queueKey);
        continue;
      }
      sources += 1;
      const seen = new Set();
      for (const item of combined) {
        if (!item?.key || !DATA_KEYS.includes(canonicalKey(item.key))) continue;
        const canonical = canonicalKey(item.key);
        const fingerprint = `${item.id || ''}|${item.key}|${item.createdAt || ''}`;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);

        // إذا كان الطابور القديم تابعاً لمساحة key قديمة، ننقل قيمة dataset المعلقة
        // إلى مساحة tenant الحالية قبل رفعها. لا نستبدل نسخة محلية أحدث.
        if (legacyTenantId && legacyTenantId !== companyIdFromSession()) {
          const oldDataKey = namespaceKey(canonical, legacyTenantId);
          const oldMetaKey = metaKey(canonical, legacyTenantId);
          const oldRaw = rawGet(oldDataKey) ?? await readDurableLocalKey(oldDataKey);
          const oldMetaRaw = rawGet(oldMetaKey) ?? await readDurableLocalKey(oldMetaKey);
          const oldMeta = safeJson(oldMetaRaw, {}) || {};
          const currentRaw = rawGet(namespaceKey(canonical));
          const currentMeta = safeJson(rawGet(metaKey(canonical)), {}) || {};
          const deltaMergedRaw = mergeLegacyPendingRaw(oldRaw, currentRaw, item);
          const oldIsNewer = Number(oldMeta.updatedAt || 0) >= Number(currentMeta.updatedAt || 0);
          if (oldRaw !== null && (deltaMergedRaw !== null || currentRaw === null || oldIsNewer)) {
            rawSet(namespaceKey(canonical), deltaMergedRaw !== null ? deltaMergedRaw : oldRaw);
            rawSet(metaKey(canonical), JSON.stringify({
              ...currentMeta,
              ...oldMeta,
              updatedAt: Math.max(Number(currentMeta.updatedAt || 0), Number(oldMeta.updatedAt || 0), Date.now()),
              migratedFromTenant: legacyTenantId,
              migratedAt: Date.now(),
              seeded: false
            }));
          }
        }

        enqueueSyncOperation(canonical, {
          touchedIds: item.touchedIds || [],
          deletedIds: item.deletedIds || [],
          touchedFields: item.touchedFields || [],
          deletedFields: item.deletedFields || [],
          nestedArrayChanges: item.nestedArrayChanges || {},
          deletedDataset: item.deletedDataset === true,
          forceReplace: item.forceReplace === true
        });
        migrated += 1;
      }
      // بعد نسخها إلى الطابور الحالي وحفظه في IndexedDB نحذف النسخة القديمة
      // حتى لا تعود العملية نفسها في كل دخول.
      rawRemove(queueKey);
      await deleteSyncQueueBackupByKey(queueKey);
    }

    if (migrated) {
      await backupSyncQueue(getSyncQueue()).catch(() => false);
      window.dispatchEvent(new CustomEvent('cashtop:sync-queue-restored', { detail: { count: getSyncQueue().length, migrated, sources } }));
    }
    return { migrated, sources };
  }

  function getSyncQueue() {
    const queue = safeJson(rawGet(syncQueueKey()), []);
    return queueAfterLastReset(Array.isArray(queue) ? queue : []);
  }

  function requestBackgroundSyncIfPossible() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(registration => {
      try { return registration.sync?.register?.('cashtop-flush-pending'); } catch (_) { return null; }
    }).catch(() => null);
  }

  function writeSyncQueue(queue) {
    const normalized = queueAfterLastReset(Array.isArray(queue) ? queue : []).slice(-1200);
    rawSet(syncQueueKey(), JSON.stringify(normalized));
    syncQueueBackupChain = syncQueueBackupChain.then(() => backupSyncQueue(normalized)).catch(() => false);
    if (normalized.length) requestBackgroundSyncIfPossible();
    updateSyncBadge();
    window.dispatchEvent(new CustomEvent('cashtop:sync-queue-changed', { detail: { count: normalized.length } }));
    return normalized;
  }

  function recordIdentity(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    for (const field of ['id', '_id', 'uuid', 'code', 'key', 'barcode']) {
      const value = item[field];
      if (value !== undefined && value !== null && String(value).trim()) return `${field}:${String(value).trim()}`;
    }
    return '';
  }

  function describeManagedChange(oldValue, newValue) {
    const before = safeJson(oldValue, null);
    const after = safeJson(newValue, null);
    const detail = { touchedIds: [], deletedIds: [], touchedFields: [], deletedFields: [], nestedArrayChanges: {} };
    if (Array.isArray(before) && Array.isArray(after)) {
      const beforeMap = new Map(before.map(item => [recordIdentity(item), item]).filter(([id]) => id));
      const afterMap = new Map(after.map(item => [recordIdentity(item), item]).filter(([id]) => id));
      if (beforeMap.size || afterMap.size) {
        for (const [id, item] of afterMap) {
          if (!beforeMap.has(id) || JSON.stringify(beforeMap.get(id)) !== JSON.stringify(item)) detail.touchedIds.push(id);
        }
        for (const id of beforeMap.keys()) if (!afterMap.has(id)) detail.deletedIds.push(id);
      }
    } else if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(after, key)) {
          detail.deletedFields.push(key);
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(before, key) || JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          detail.touchedFields.push(key);
          if (Array.isArray(before[key]) && Array.isArray(after[key])) {
            const beforeMap = new Map(before[key].map(item => [recordIdentity(item), item]).filter(([id]) => id));
            const afterMap = new Map(after[key].map(item => [recordIdentity(item), item]).filter(([id]) => id));
            if (beforeMap.size || afterMap.size) {
              const touchedIds = [];
              const deletedIds = [];
              for (const [id, item] of afterMap) {
                if (!beforeMap.has(id) || JSON.stringify(beforeMap.get(id)) !== JSON.stringify(item)) touchedIds.push(id);
              }
              for (const id of beforeMap.keys()) if (!afterMap.has(id)) deletedIds.push(id);
              detail.nestedArrayChanges[key] = { touchedIds, deletedIds };
            }
          }
        }
      }
    }
    return detail;
  }

  function enqueueSyncOperation(key, change = {}) {
    const canonical = canonicalKey(key);
    const queue = getSyncQueue();
    const mergeUnique = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
    // عملية واحدة لكل dataset، مع الاحتفاظ بتفاصيل السجلات/الحقول المتغيرة
    // حتى يمكن دمج تعديلات جهازين بدلاً من استبدال المجموعة كاملة.
    const existing = queue.find(item => item.key === canonical);
    if (existing) {
      existing.createdAt = Math.max(Date.now(), syncQueueResetAt() + 1);
      existing.queueGeneration = String(syncQueueResetAt() || 'legacy');
      existing.deviceId = getDeviceId();
      existing.page = FILE;
      existing.tenantId = companyIdFromSession();
      existing.companyId = companyIdFromSession();
      existing.companyKey = String((getSession() || {}).companyKey || '');
      const touchedNow = new Set(change.touchedIds || []);
      const deletedNow = new Set(change.deletedIds || []);
      const touchedFieldsNow = new Set(change.touchedFields || []);
      const deletedFieldsNow = new Set(change.deletedFields || []);
      existing.touchedIds = mergeUnique((existing.touchedIds || []).filter(id => !deletedNow.has(id)), [...touchedNow]);
      existing.deletedIds = mergeUnique((existing.deletedIds || []).filter(id => !touchedNow.has(id)), [...deletedNow]);
      existing.touchedFields = mergeUnique((existing.touchedFields || []).filter(field => !deletedFieldsNow.has(field)), [...touchedFieldsNow]);
      existing.deletedFields = mergeUnique((existing.deletedFields || []).filter(field => !touchedFieldsNow.has(field)), [...deletedFieldsNow]);
      existing.nestedArrayChanges = existing.nestedArrayChanges && typeof existing.nestedArrayChanges === 'object' ? existing.nestedArrayChanges : {};
      Object.entries(change.nestedArrayChanges || {}).forEach(([field, delta]) => {
        const previous = existing.nestedArrayChanges[field] || { touchedIds: [], deletedIds: [] };
        const nestedTouchedNow = new Set(delta?.touchedIds || []);
        const nestedDeletedNow = new Set(delta?.deletedIds || []);
        existing.nestedArrayChanges[field] = {
          touchedIds: mergeUnique((previous.touchedIds || []).filter(id => !nestedDeletedNow.has(id)), [...nestedTouchedNow]),
          deletedIds: mergeUnique((previous.deletedIds || []).filter(id => !nestedTouchedNow.has(id)), [...nestedDeletedNow])
        };
      });
      for (const field of deletedFieldsNow) delete existing.nestedArrayChanges[field];
      if (Object.prototype.hasOwnProperty.call(change, 'deletedDataset')) existing.deletedDataset = change.deletedDataset === true;
      if (change.forceReplace === true) existing.forceReplace = true;
      writeSyncQueue(queue);
      return existing.id;
    }
    const operation = {
      id: crypto.randomUUID ? crypto.randomUUID() : `SYNC_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      key: canonical,
      createdAt: Math.max(Date.now(), syncQueueResetAt() + 1),
      queueGeneration: String(syncQueueResetAt() || 'legacy'),
      deviceId: getDeviceId(),
      page: FILE,
      tenantId: companyIdFromSession(),
      companyId: companyIdFromSession(),
      companyKey: String((getSession() || {}).companyKey || ''),
      touchedIds: mergeUnique([], change.touchedIds),
      deletedIds: mergeUnique([], change.deletedIds),
      touchedFields: mergeUnique([], change.touchedFields),
      deletedFields: mergeUnique([], change.deletedFields),
      nestedArrayChanges: JSON.parse(JSON.stringify(change.nestedArrayChanges || {})),
      deletedDataset: change.deletedDataset === true,
      forceReplace: change.forceReplace === true
    };
    queue.push(operation);
    writeSyncQueue(queue);
    return operation.id;
  }

  function completeSyncOperation(operationId) {
    if (!operationId) return getSyncQueue().length;
    const queue = getSyncQueue();
    const index = queue.findIndex(item => item.id === operationId);
    if (index >= 0) queue.splice(index, 1);
    writeSyncQueue(queue);
    return queue.length;
  }

  function clearSyncQueue() {
    return writeSyncQueue([]);
  }

  async function preservePendingSyncState() {
    const queue = getSyncQueue();
    // انتظر الكتابات السابقة أولاً ثم ثبّت الطابور ومجموعاته في قاعدتي IndexedDB.
    try { await durableWriteChain; } catch (_) {}
    await backupSyncQueue(queue).catch(() => false);
    const durableEntries = new Map([
      [syncQueueKey(), JSON.stringify(queue)],
      [syncQueueResetMarkerKey(), String(syncQueueResetAt() || 0)],
      [syncQueueRevisionMarkerKey(), String(rawGet(syncQueueRevisionMarkerKey()) || '')]
    ]);
    queue.forEach(item => {
      const key = canonicalKey(item?.key || '');
      if (!DATA_KEYS.includes(key)) return;
      const dataStorageKey = namespaceKey(key);
      const metadataStorageKey = metaKey(key);
      const dataValue = rawGet(dataStorageKey);
      const metadataValue = rawGet(metadataStorageKey);
      if (dataValue !== null) durableEntries.set(dataStorageKey, dataValue);
      if (metadataValue !== null) durableEntries.set(metadataStorageKey, metadataValue);
    });
    await Promise.all([...durableEntries.entries()].map(([key, value]) => persistDurableLocalKey(key, value).catch(() => false)));
    return { count: queue.length, savedAt: Date.now() };
  }

  async function resetSyncQueueCompletely() {
    const discarded = getSyncQueue().length;
    const resetAt = Date.now();
    rawSet(syncQueueResetMarkerKey(), String(resetAt));

    const legacyKeys = await discoverLegacySyncQueueCandidateKeys().catch(() => []);
    const queueKeys = [...new Set([syncQueueKey(), ...legacyKeys])];
    for (const queueKey of queueKeys) {
      if (queueKey === syncQueueKey()) continue;
      rawRemove(queueKey);
      await deleteSyncQueueBackupByKey(queueKey).catch(() => false);
      await deleteDurableLocalKey(queueKey).catch(() => false);
    }

    // لو حدث تعديل جديد أثناء تنفيذ التصفير، يحتفظ به لأنه يحمل جيل
    // الطابور الحالي، بينما تختفي العمليات القديمة فقط.
    const newOperations = getSyncQueue();
    writeSyncQueue(newOperations);
    try { await syncQueueBackupChain; } catch (_) {}
    await persistDurableLocalKey(syncQueueResetMarkerKey(), String(resetAt)).catch(() => false);
    await persistDurableLocalKey(syncQueueKey(), JSON.stringify(newOperations)).catch(() => false);
    window.dispatchEvent(new CustomEvent('cashtop:sync-queue-reset', { detail: { discarded, resetAt, remaining: newOperations.length } }));
    return { discarded, resetAt, remaining: newOperations.length };
  }

  function updateSyncBadge() {
    const count = getSyncQueue().length;
    const button = document.getElementById('ctSyncButton');
    const badge = document.getElementById('ctSyncBadge');
    if (badge) {
      badge.textContent = count > 999 ? '999+' : String(count);
      badge.hidden = count === 0;
    }
    if (button) button.title = count ? `عمليات بانتظار المزامنة: ${count}` : 'البيانات متزامنة';
    return count;
  }


  let lastSyncProgressDetail = { active: false, done: true };
  function setSyncProgress(detail = {}) {
    lastSyncProgressDetail = { ...lastSyncProgressDetail, ...detail };
    const button = document.getElementById('ctSyncButton');
    const track = document.getElementById('ctSyncProgress');
    const bar = document.getElementById('ctSyncProgressBar');
    if (!track || !bar) return;
    const active = detail.active !== false && detail.done !== true;
    const total = Math.max(0, Number(detail.total || 0));
    const current = Math.max(0, Number(detail.current || 0));
    const percent = total > 0 ? Math.max(3, Math.min(100, (current / total) * 100)) : 28;
    track.hidden = !active;
    track.classList.toggle('ct-sync-progress-indeterminate', active && total <= 0);
    if (total > 0) bar.style.width = `${percent}%`;
    else bar.style.width = '28%';
    if (button) {
      button.classList.toggle('ct-syncing', active);
      if (detail.label) button.title = String(detail.label);
    }
    if (!active) {
      bar.style.width = detail.success === false ? '0%' : '100%';
      window.setTimeout(() => {
        if (track) track.hidden = true;
        if (button) button.classList.remove('ct-syncing');
      }, 320);
    }
  }

  function setRecordsPulling(active, detail = {}) {
    document.body?.classList.toggle('ct-records-pulling', Boolean(active));
    if (document.body) {
      document.body.dataset.ctPullDataset = active ? String(detail.key || detail.dataset || '') : '';
    }
  }

  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('cashtop-app') : null;
  let suppressEvents = false;

  function appendAudit(key, oldValue, newValue, actionOverride) {
    const canonical = canonicalKey(key);
    if (canonical === 'cashtop_audit_log') return;
    const session = getSession() || {};
    const auditNs = namespaceKey('cashtop_audit_log');
    const list = safeJson(rawGet(auditNs), []) || [];
    const oldParsed = safeJson(oldValue, oldValue);
    const newParsed = safeJson(newValue, newValue);
    let action = actionOverride || 'update';
    if (Array.isArray(oldParsed) && Array.isArray(newParsed)) {
      if (newParsed.length > oldParsed.length) action = 'create';
      else if (newParsed.length < oldParsed.length) action = 'delete';
    } else if (oldValue == null && newValue != null) action = 'create';
    else if (newValue == null) action = 'delete';
    const entityInfo = auditEntityInfo(oldParsed, newParsed, action);

    list.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `AUD_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      tenantId: session.tenantId || session.companyId || session.companyKey || null,
      companyId: session.tenantId || session.companyId || session.companyKey || null,
      branchId: branchIdFromSession(session),
      userId: session.uid || session.username || null,
      username: session.displayName || session.name || session.username || 'غير معروف',
      role: session.role || 'user',
      page: FILE,
      dataset: canonical,
      action,
      entityId: entityInfo.entityId,
      entityName: entityInfo.entityName,
      details: entityInfo.details,
      oldSummary: summarizeValue(oldParsed),
      newSummary: summarizeValue(newParsed),
      deviceId: getDeviceId()
    });
    // Keep only a small recent cache locally. Full history is uploaded as
    // append-only day-sharded records by turso-sync.js, so large audit logs
    // never become one giant localStorage/Turso dataset.
    if (list.length > 100) list.splice(0, list.length - 100);
    const record = list[list.length - 1];
    rawSet(auditNs, JSON.stringify(list));
    const pendingKey = auditPendingStorageKey();
    const pending = safeJson(rawGet(pendingKey), []) || [];
    pending.push(record);
    // Small synchronous fallback/recent queue. The durable offline queue is
    // IndexedDB so months of audit activity do not fill localStorage or RAM.
    if (pending.length > 100) pending.splice(0, pending.length - 100);
    rawSet(pendingKey, JSON.stringify(pending));
    const signalAuditPending = () => window.dispatchEvent(new CustomEvent('cashtop:audit-pending', { detail: { id: record.id } }));
    auditQueuePut(record).then(() => pruneAuditQueueCompany(100)).then(signalAuditPending).catch(signalAuditPending);
  }

  function auditPendingStorageKey() {
    return `ct_audit_pending::${encodeURIComponent(companyIdFromSession())}`;
  }

  function getAuditPending() {
    return normalizeArrayValue(rawGet(auditPendingStorageKey()), []).slice(-100);
  }

  function completeAuditPending(ids = []) {
    const set = new Set((ids || []).map(String));
    if (!set.size) return 0;
    const pending = getAuditPending();
    const remaining = pending.filter(item => !set.has(String(item?.id || '')));
    rawSet(auditPendingStorageKey(), JSON.stringify(remaining));
    return pending.length - remaining.length;
  }

  function getRecentAuditCache() {
    return normalizeArrayValue(rawGet(namespaceKey('cashtop_audit_log')), []).slice(-100);
  }

  const AUDIT_QUEUE_DB = 'cashtop-audit-queue-v1';
  const AUDIT_QUEUE_STORE = 'pending';
  let auditDbPromise = null;
  function openAuditQueueDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    if (auditDbPromise) return auditDbPromise;
    auditDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(AUDIT_QUEUE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.objectStoreNames.contains(AUDIT_QUEUE_STORE)
          ? req.transaction.objectStore(AUDIT_QUEUE_STORE)
          : db.createObjectStore(AUDIT_QUEUE_STORE, { keyPath: 'id' });
        if (!store.indexNames.contains('companyId')) store.createIndex('companyId', 'companyId', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('AUDIT_DB_OPEN_FAILED'));
      req.onblocked = () => reject(new Error('AUDIT_DB_BLOCKED'));
    }).catch(error => { auditDbPromise = null; throw error; });
    return auditDbPromise;
  }

  async function auditQueuePut(record) {
    if (!record?.id) return false;
    const db = await openAuditQueueDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIT_QUEUE_STORE, 'readwrite');
      tx.objectStore(AUDIT_QUEUE_STORE).put({ ...record, companyId: String(record.companyId || companyIdFromSession()) });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('AUDIT_DB_PUT_FAILED'));
      tx.onabort = () => reject(tx.error || new Error('AUDIT_DB_PUT_ABORTED'));
    });
  }

  async function pruneAuditQueueCompany(limit = 100) {
    if (!('indexedDB' in window)) return 0;
    try {
      const db = await openAuditQueueDb();
      const companyId = String(companyIdFromSession());
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIT_QUEUE_STORE, 'readonly');
        const index = tx.objectStore(AUDIT_QUEUE_STORE).index('companyId');
        const req = index.openCursor(IDBKeyRange.only(companyId));
        const out = [];
        req.onsuccess = () => { const c=req.result; if(!c) return resolve(out); out.push(c.value); c.continue(); };
        req.onerror = () => reject(req.error || new Error('AUDIT_DB_READ_FAILED'));
      });
      rows.sort((a,b)=>normalizeDateValue(b.timestamp)-normalizeDateValue(a.timestamp));
      const remove = rows.slice(Math.max(0, Number(limit)||100)).map(x=>String(x.id||'')).filter(Boolean);
      if (!remove.length) return 0;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIT_QUEUE_STORE, 'readwrite');
        const store = tx.objectStore(AUDIT_QUEUE_STORE);
        remove.forEach(id=>store.delete(id));
        tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error || new Error('AUDIT_DB_PRUNE_FAILED'));
      });
      return remove.length;
    } catch (_) { return 0; }
  }

  async function getAuditPendingAsync(limit = 0) {
    const fallback = getAuditPending();
    try {
      const db = await openAuditQueueDb();
      const companyId = String(companyIdFromSession());
      const max = Math.max(0, Number(limit || 0));
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIT_QUEUE_STORE, 'readonly');
        const index = tx.objectStore(AUDIT_QUEUE_STORE).index('companyId');
        const req = index.openCursor(IDBKeyRange.only(companyId));
        const out = [];
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor || (max && out.length >= max)) return resolve(out);
          out.push(cursor.value);
          cursor.continue();
        };
        req.onerror = () => reject(req.error || new Error('AUDIT_DB_READ_FAILED'));
      });
      const map = new Map();
      [...rows, ...fallback].forEach(item => item?.id && map.set(String(item.id), item));
      const merged = [...map.values()].sort((a,b) => normalizeDateValue(a.timestamp) - normalizeDateValue(b.timestamp));
      return max ? merged.slice(0, max) : merged;
    } catch (_) {
      return limit ? fallback.slice(0, Number(limit)) : fallback;
    }
  }

  async function completeAuditPendingAsync(ids) {
    const set = new Set((ids || []).map(String));
    if (!set.size) return 0;
    completeAuditPending([...set]);
    try {
      const db = await openAuditQueueDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIT_QUEUE_STORE, 'readwrite');
        const store = tx.objectStore(AUDIT_QUEUE_STORE);
        set.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('AUDIT_DB_DELETE_FAILED'));
      });
    } catch (_) {}
    return set.size;
  }

  async function getAuditPendingCountAsync() {
    try {
      const db = await openAuditQueueDb();
      const companyId = String(companyIdFromSession());
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIT_QUEUE_STORE, 'readonly');
        const req = tx.objectStore(AUDIT_QUEUE_STORE).index('companyId').count(IDBKeyRange.only(companyId));
        req.onsuccess = () => resolve(Number(req.result || 0));
        req.onerror = () => reject(req.error || new Error('AUDIT_DB_COUNT_FAILED'));
      });
    } catch (_) { return getAuditPending().length; }
  }

  function summarizeValue(value) {
    if (Array.isArray(value)) return { type: 'array', count: value.length };
    if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 30) };
    if (typeof value === 'string') return value.slice(0, 180);
    return value;
  }

  function auditEntityInfo(oldValue, newValue, action) {
    const idOf = item => item && typeof item === 'object' ? String(item.id ?? item._id ?? item.uid ?? item.refNumber ?? item.number ?? '') : '';
    const nameOf = item => item && typeof item === 'object'
      ? String(item.name ?? item.title ?? item.employeeName ?? item.customer ?? item.supplierName ?? item.productName ?? item.refNumber ?? item.id ?? '')
      : '';
    let before = null, after = null;
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (newValue.length > oldValue.length) {
        const ids = new Set(oldValue.map(idOf).filter(Boolean));
        after = newValue.find(item => { const id = idOf(item); return id && !ids.has(id); }) || newValue[newValue.length - 1] || null;
      } else if (newValue.length < oldValue.length) {
        const ids = new Set(newValue.map(idOf).filter(Boolean));
        before = oldValue.find(item => { const id = idOf(item); return id && !ids.has(id); }) || oldValue[oldValue.length - 1] || null;
      } else {
        const limit = Math.min(oldValue.length, newValue.length);
        for (let i = 0; i < limit; i += 1) {
          const a = oldValue[i], b = newValue[i];
          if (idOf(a) !== idOf(b) || JSON.stringify(a) !== JSON.stringify(b)) { before = a; after = b; break; }
        }
      }
    } else if (oldValue && typeof oldValue === 'object' && newValue && typeof newValue === 'object') {
      before = oldValue; after = newValue;
    } else if (action === 'create') after = newValue;
    else if (action === 'delete') before = oldValue;
    const entity = after || before;
    const entityId = idOf(entity);
    const entityName = nameOf(entity);
    const details = [entityName, entityId && entityId !== entityName ? `#${entityId}` : ''].filter(Boolean).join(' ');
    return { entityId: entityId || null, entityName: entityName || null, details: details || null };
  }

  function dispatchLogicalStorageEvents(key, oldValue, newValue) {
    const canonical = canonicalKey(key);
    const logicalKeys = [canonical, ...Object.keys(ALIASES).filter(alias => ALIASES[alias] === canonical)];
    logicalKeys.forEach(logicalKey => {
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: logicalKey,
          oldValue: oldValue == null ? null : String(oldValue),
          newValue: newValue == null ? null : String(newValue),
          url: location.href,
          storageArea: localStorage
        }));
      } catch (_) {
        const event = new Event('storage');
        Object.defineProperties(event, {
          key: { value: logicalKey }, oldValue: { value: oldValue }, newValue: { value: newValue },
          url: { value: location.href }, storageArea: { value: localStorage }
        });
        window.dispatchEvent(event);
      }
    });
  }

  function emitDataChange(key, oldValue, value, source = 'local', operationId = null) {
    if (suppressEvents) return;
    const detail = {
      key: canonicalKey(key),
      oldValue,
      value,
      companyId: companyIdFromSession(),
      updatedAt: Date.now(),
      source,
      deviceId: getDeviceId(),
      operationId
    };
    window.dispatchEvent(new CustomEvent('cashtop:data-changed', { detail }));
    if (detail.key === 'cashtop_funds_db') window.dispatchEvent(new CustomEvent('cashtop:funds-changed', { detail }));
    if (channel) channel.postMessage({ type: 'data-change', ...detail });
  }

  function canClaimLegacyUnscopedData(tenantId) {
    const ownerKey = 'ct_legacy_data_owner_tenant_v2';
    const currentOwner = rawGet(ownerKey);
    if (currentOwner) return currentOwner === String(tenantId);

    // إذا كانت هناك مساحة بيانات لشركة أخرى فلا ننقل أي مفاتيح قديمة غير معزولة
    // إلى الشركة الحالية. هذا هو أهم حاجز لمنع ظهور بيانات مفتاح سابق داخل مفتاح جديد.
    const encodedCurrent = encodeURIComponent(String(tenantId));
    for (let i = 0; i < localStorage.length; i += 1) {
      const storageKey = RAW.key.call(localStorage, i);
      if (!storageKey || !storageKey.startsWith('cashtop_data::')) continue;
      const remainder = storageKey.slice('cashtop_data::'.length);
      const encodedTenant = remainder.split('::')[0];
      if (encodedTenant && encodedTenant !== encodedCurrent) return false;
    }
    rawSet(ownerKey, String(tenantId));
    return true;
  }

  function migrateLegacyValue(key) {
    const canonical = canonicalKey(key);
    const tenantId = tenantIdFromSession();
    const ns = namespaceKey(canonical, tenantId);
    let current = rawGet(ns);
    if (current !== null) return current;

    const candidates = [canonical, ...Object.keys(ALIASES).filter(k => ALIASES[k] === canonical)];
    const hasLegacy = candidates.some(candidate => rawGet(candidate) !== null);
    if (!hasLegacy || !canClaimLegacyUnscopedData(tenantId)) return null;

    for (const candidate of candidates) {
      const legacy = rawGet(candidate);
      if (legacy !== null) {
        rawSet(ns, legacy);
        rawSet(metaKey(canonical, tenantId), JSON.stringify({ updatedAt: Date.now(), revision: 1, migratedFrom: candidate, tenantId }));
        candidates.forEach(rawRemove);
        return legacy;
      }
    }
    return null;
  }


  const BRANCH_SCOPED_ARRAY_KEYS = new Set([
    'cashtop_product_categories', 'cashtop_customers', 'cashtop_customer_groups', 'cashtop_suppliers', 'cashtop_supplier_movements',
    'cashtop_invoices', 'cashtop_sales_reversals', 'cashtop_sales_returns', 'cashtop_purchases', 'cashtop_purchase_reversals', 'cashtop_purchase_returns', 'cashtop_expenses',
    'cashtop_expense_types', 'cashtop_vouchers', 'cashtop_stores', 'cashtop_transfer_history',
    'cashtop_workers', 'cashtop_sales_agents', 'cashtop_agent_movements', 'cashtop_journal', 'cashtop_journal_reversal_archive',
    'cashtop_audit_log', 'cashtop_sales_offers', 'cashtop_manufacturing_recipes',
    'cashtop_manufacturing_orders', 'cashtop_wastage'
  ]);
  const BRANCH_SCOPED_OBJECT_KEYS = new Set(['cashtop_funds_db']);

  function isCompanyAdminRole(role) {
    return ['admin', 'owner', 'company-admin'].includes(String(role || '').toLowerCase());
  }

  function isBasicStaffRole(session = getSession()) {
    const role = String(session?.role || '').toLowerCase();
    return ['employee', 'representative', 'sales-representative', 'sales-agent', 'agent'].includes(role)
      || String(session?.uid || '').startsWith('AG_');
  }

  function deepClone(value) {
    if (value == null) return value;
    try { return structuredClone(value); } catch (_) {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }
  }

  function fullDatasetValue(key, fallback = null, companyId = companyIdFromSession()) {
    const raw = rawGet(namespaceKey(canonicalKey(key), companyId));
    if (raw == null) return fallback;
    return safeJson(raw, fallback);
  }

  function branchIdFromSession(session = getSession()) {
    session = session || {};
    if (session.dataBranchId) return String(session.dataBranchId);
    const role = String(session.role || '').toLowerCase();
    if (isCompanyAdminRole(role)) return 'MAIN';
    const recordId = session.branchRecordId || session.branchId;
    if (!recordId) return 'MAIN';
    const companyId = session.tenantId || session.companyId || session.companyKey || companyIdFromSession();
    const branches = normalizeArrayValue(fullDatasetValue('cashtop_branches', [], companyId), []);
    const branch = branches.find(item => String(item.id) === String(recordId));
    return branch?.isMain === true ? 'MAIN' : String(recordId);
  }

  function recordBranchId(record) {
    const value = record && (record.dataBranchId || record.branchId);
    return value == null || value === '' ? 'MAIN' : String(value);
  }

  const branchStoreScopeCache = new Map();
  function storeIdsForBranch(branchId, companyId = companyIdFromSession()) {
    const branch = String(branchId || 'MAIN');
    const rawStores = rawGet(namespaceKey('cashtop_stores', companyId)) || '[]';
    const cacheKey = `${companyId}::${branch}`;
    const cached = branchStoreScopeCache.get(cacheKey);
    if (cached && cached.raw === rawStores) return cached.ids;
    const stores = normalizeArrayValue(safeJson(rawStores, []), []);
    const ids = new Set(stores.filter(store => recordBranchId(store) === branch).map(store => String(store.id || '')).filter(Boolean));
    branchStoreScopeCache.set(cacheKey, { raw: rawStores, ids });
    return ids;
  }

  function filterStockMapForStores(stockMap, storeIds) {
    const source = stockMap && typeof stockMap === 'object' ? stockMap : {};
    const result = {};
    storeIds.forEach(id => {
      if (Object.prototype.hasOwnProperty.call(source, id)) result[id] = Math.max(0, Number(source[id] || 0));
    });
    return result;
  }

  function mergeStockMapForStores(oldMap, incomingMap, storeIds) {
    const result = deepClone(oldMap && typeof oldMap === 'object' ? oldMap : {}) || {};
    const source = incomingMap && typeof incomingMap === 'object' ? incomingMap : {};
    storeIds.forEach(id => {
      if (Object.prototype.hasOwnProperty.call(source, id)) result[id] = Math.max(0, Number(source[id] || 0));
      else delete result[id];
    });
    return result;
  }

  function sameBranch(record, branchId = branchIdFromSession()) {
    return recordBranchId(record) === String(branchId || 'MAIN');
  }

  function productVisibleInBranch(product, branchId) {
    if (!product || typeof product !== 'object') return false;
    const branch = String(branchId || 'MAIN');
    const catalog = product.branchCatalog && typeof product.branchCatalog === 'object' ? product.branchCatalog : {};
    if (branch === 'MAIN') {
      if (catalog.MAIN === true || String(product.ownerBranchId || 'MAIN') === 'MAIN') return true;
      if (!Object.keys(catalog).length && product.ownerBranchId == null) return true; // legacy product
      return Number(product.stockPieces || 0) !== 0 || Array.isArray(product.inventoryLots) && product.inventoryLots.length > 0;
    }
    if (catalog[branch] === true || String(product.ownerBranchId || '') === branch) return true;
    if (product.branchStocks && Object.prototype.hasOwnProperty.call(product.branchStocks, branch)) return true;
    if (product.branchInventoryLots && Array.isArray(product.branchInventoryLots[branch])) return true;
    const scopedStores = storeIdsForBranch(branch);
    if ([...scopedStores].some(id => Number(product.storeStocks?.[id] || 0) > 0)) return true;
    return Array.isArray(product.variants) && product.variants.some(v =>
      (v?.branchStocks && Object.prototype.hasOwnProperty.call(v.branchStocks, branch)) ||
      [...scopedStores].some(id => Number(v?.storeStocks?.[id] || 0) > 0)
    );
  }

  function projectProductForBranch(product, branchId) {
    const branch = String(branchId || 'MAIN');
    const clone = deepClone(product) || {};
    const scopedStores = storeIdsForBranch(branch);
    clone.__ctDataBranchId = branch;
    clone.storeStocks = filterStockMapForStores(product.storeStocks, scopedStores);
    if (branch === 'MAIN') {
      clone.inventoryLots = normalizeArrayValue(product.inventoryLots || [], []).filter(lot => recordBranchId(lot) === 'MAIN');
      if (Array.isArray(clone.variants)) clone.variants.forEach((variant, index) => {
        variant.qty = Number(product.variants?.[index]?.qty || 0);
        variant.storeStocks = filterStockMapForStores(product.variants?.[index]?.storeStocks, scopedStores);
      });
      return clone;
    }
    const branchStockKeyExists = Object.prototype.hasOwnProperty.call(product.branchStocks || {}, branch);
    const branchStockDirect = Math.max(0, Number(product.branchStocks?.[branch] || 0));
    const scopedStoreStock = [...scopedStores].reduce((sum, storeId) => sum + Math.max(0, Number(product.storeStocks?.[storeId] || 0)), 0);
    // المنتجات التي أُضيفت مباشرة إلى مخزن فرعي قد لا تحتوي branchStocks بعد؛
    // في هذه الحالة يكون storeStocks هو الرصيد الحقيقي للفرع وليس صفراً.
    clone.stockPieces = branchStockKeyExists ? branchStockDirect : scopedStoreStock;
    clone.inventoryLots = deepClone(product.branchInventoryLots?.[branch] || normalizeArrayValue(product.inventoryLots || [], []).filter(lot => recordBranchId(lot) === branch)) || [];
    if (Array.isArray(clone.variants)) {
      clone.variants.forEach((variant, index) => {
        const original = product.variants?.[index] || variant;
        const variantBranchKeyExists = Object.prototype.hasOwnProperty.call(original.branchStocks || {}, branch);
        const variantStoreStock = [...scopedStores].reduce((sum, storeId) => sum + Math.max(0, Number(original.storeStocks?.[storeId] || 0)), 0);
        variant.qty = variantBranchKeyExists ? Math.max(0, Number(original.branchStocks?.[branch] || 0)) : variantStoreStock;
        variant.storeStocks = filterStockMapForStores(original.storeStocks, scopedStores);
      });
    }
    return clone;
  }

  function projectProducts(rawValue) {
    const branch = branchIdFromSession();
    return JSON.stringify(normalizeArrayValue(rawValue, []).filter(product => productVisibleInBranch(product, branch)).map(product => projectProductForBranch(product, branch)));
  }

  function variantIdentity(variant, index) {
    return String(variant?.id || variant?.barcode || `${variant?.size || ''}::${variant?.color || ''}::${index}`);
  }

  function mergeProductForBranch(existing, incoming, branchId) {
    const branch = String(branchId || 'MAIN');
    const source = deepClone(incoming) || {};
    delete source.__ctDataBranchId;
    let target = existing ? deepClone(existing) : {};
    const preserved = {
      stockPieces: Number(target.stockPieces || 0),
      inventoryLots: deepClone(target.inventoryLots || []),
      branchStocks: deepClone(target.branchStocks || {}),
      branchInventoryLots: deepClone(target.branchInventoryLots || {}),
      branchCatalog: deepClone(target.branchCatalog || {}),
      storeStocks: deepClone(target.storeStocks || {}),
      variants: deepClone(target.variants || [])
    };
    const skip = new Set(['stockPieces','inventoryLots','branchStocks','branchInventoryLots','branchCatalog','storeStocks','variants','__ctDataBranchId']);
    Object.entries(source).forEach(([key, value]) => { if (!skip.has(key)) target[key] = deepClone(value); });
    target.id = target.id || source.id || `P_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    target.branchStocks = preserved.branchStocks || {};
    target.branchInventoryLots = preserved.branchInventoryLots || {};
    target.branchCatalog = preserved.branchCatalog || {};
    const scopedStores = storeIdsForBranch(branch);
    target.storeStocks = mergeStockMapForStores(preserved.storeStocks, source.storeStocks, scopedStores);
    const oldVariants = preserved.variants || [];
    const oldById = new Map(oldVariants.map((v,i) => [variantIdentity(v,i), v]));
    target.variants = normalizeArrayValue(source.variants || [], []).map((variant, index) => {
      const old = oldById.get(variantIdentity(variant,index)) || oldVariants[index] || {};
      const merged = { ...deepClone(old), ...deepClone(variant) };
      merged.branchStocks = deepClone(old.branchStocks || variant.branchStocks || {});
      merged.storeStocks = mergeStockMapForStores(old.storeStocks || {}, variant.storeStocks || {}, scopedStores);
      if (branch === 'MAIN') merged.qty = Math.max(0, Number(variant.qty || 0));
      else {
        merged.qty = Math.max(0, Number(old.qty || 0));
        merged.branchStocks[branch] = Math.max(0, Number(variant.qty || 0));
      }
      return merged;
    });
    if (branch === 'MAIN') {
      target.stockPieces = Math.max(0, Number(source.stockPieces || 0));
      target.inventoryLots = normalizeArrayValue(source.inventoryLots || [], []).map(lot => ({ ...deepClone(lot), branchId: 'MAIN' }));
      target.branchCatalog.MAIN = true;
      target.ownerBranchId = target.ownerBranchId || 'MAIN';
    } else {
      target.stockPieces = preserved.stockPieces;
      target.inventoryLots = preserved.inventoryLots;
      target.branchStocks[branch] = Math.max(0, Number(source.stockPieces || 0));
      target.branchInventoryLots[branch] = normalizeArrayValue(source.inventoryLots || [], []).map(lot => ({ ...deepClone(lot), branchId: branch }));
      target.branchCatalog[branch] = true;
      target.ownerBranchId = target.ownerBranchId || branch;
    }
    return target;
  }

  function productHasAnyBranch(product) {
    if (Number(product.stockPieces || 0) > 0 || product.branchCatalog?.MAIN === true) return true;
    if (Object.values(product.branchStocks || {}).some(value => Number(value || 0) > 0)) return true;
    if (Object.values(product.storeStocks || {}).some(value => Number(value || 0) > 0)) return true;
    if (Object.values(product.branchCatalog || {}).some(Boolean)) return true;
    return Array.isArray(product.variants) && product.variants.some(v =>
      Number(v.qty || 0) > 0 ||
      Object.values(v.branchStocks || {}).some(value => Number(value || 0) > 0) ||
      Object.values(v.storeStocks || {}).some(value => Number(value || 0) > 0)
    );
  }

  function mergeProducts(rawOld, incomingValue) {
    const branch = branchIdFromSession();
    const full = normalizeArrayValue(rawOld, []);
    const incoming = normalizeArrayValue(incomingValue, []);
    const incomingIds = new Set(incoming.map(p => String(p.id)));
    const byId = new Map(full.map(p => [String(p.id), p]));
    incoming.forEach(item => byId.set(String(item.id), mergeProductForBranch(byId.get(String(item.id)), item, branch)));
    for (const product of full) {
      if (!productVisibleInBranch(product, branch) || incomingIds.has(String(product.id))) continue;
      const target = byId.get(String(product.id));
      const scopedStores = storeIdsForBranch(branch);
      if (branch === 'MAIN') {
        target.stockPieces = 0; target.inventoryLots = [];
        if (target.branchCatalog) delete target.branchCatalog.MAIN;
        scopedStores.forEach(id => { if (target.storeStocks) delete target.storeStocks[id]; });
        (target.variants || []).forEach(v => {
          v.qty = 0;
          scopedStores.forEach(id => { if (v.storeStocks) delete v.storeStocks[id]; });
        });
      } else {
        if (target.branchStocks) delete target.branchStocks[branch];
        if (target.branchInventoryLots) delete target.branchInventoryLots[branch];
        if (target.branchCatalog) delete target.branchCatalog[branch];
        scopedStores.forEach(id => { if (target.storeStocks) delete target.storeStocks[id]; });
        (target.variants || []).forEach(v => {
          if (v.branchStocks) delete v.branchStocks[branch];
          scopedStores.forEach(id => { if (v.storeStocks) delete v.storeStocks[id]; });
        });
      }
      if (!productHasAnyBranch(target)) byId.delete(String(product.id));
    }
    return JSON.stringify([...byId.values()]);
  }

  function projectBranchArray(rawValue) {
    const branch = branchIdFromSession();
    return JSON.stringify(normalizeArrayValue(rawValue, []).filter(item => sameBranch(item, branch)));
  }

  function recordIdentity(record, index) {
    return String(record?.id || record?.invoiceId || record?.code || record?.number || `IDX_${index}`);
  }

  function mergeBranchArray(rawOld, incomingValue) {
    const branch = branchIdFromSession();
    const old = normalizeArrayValue(rawOld, []);
    const incoming = normalizeArrayValue(incomingValue, []).map(item => ({ ...deepClone(item), branchId: branch }));
    const keep = old.filter(item => !sameBranch(item, branch));
    return JSON.stringify([...keep, ...incoming]);
  }

  function fundLogIdentity(log, index = 0) {
    const branch = recordBranchId(log);
    const accountId = String(log?.accountId || '');
    const type = String(log?.type || '');
    const amount = Number(log?.amount || 0).toFixed(8);
    const baseAmount = Number(log?.baseAmount ?? log?.amount ?? 0).toFixed(8);
    const currencyId = String(log?.currencyId || '');
    const date = String(log?.date || '');
    const notes = String(log?.notes || '').trim();
    const sourceType = String(log?.sourceType || log?.refType || '');
    const sourceId = String(log?.sourceId || log?.refId || '');
    if (/رصيد\s*افتتاحي/.test(notes)) return `opening:${branch}:${accountId}:${date}:${type}:${amount}:${baseAmount}:${currencyId}:${notes}`;
    if (log?.id != null && String(log.id).trim()) return `id:${String(log.id).trim()}`;
    if (sourceType && sourceId) return `ref:${branch}:${accountId}:${sourceType}:${sourceId}:${date}:${type}:${amount}:${baseAmount}:${currencyId}:${notes}`;
    return `legacy:${branch}:${accountId}:${date}:${type}:${amount}:${baseAmount}:${currencyId}:${notes || index}`;
  }

  function dedupeFundLogs(logs) {
    const unique = new Map();
    normalizeArrayValue(logs || [], []).forEach((log, index) => unique.set(fundLogIdentity(log, index), log));
    return [...unique.values()];
  }

  function projectFunds(rawValue) {
    const branch = branchIdFromSession();
    const db = safeJson(rawValue, {}) || {};
    return JSON.stringify({
      ...db,
      accounts: normalizeArrayValue(db.accounts || [], []).filter(item => sameBranch(item, branch)),
      accountLogs: dedupeFundLogs(normalizeArrayValue(db.accountLogs || [], []).filter(item => sameBranch(item, branch)))
    });
  }

  function mergeFunds(rawOld, incomingValue) {
    const branch = branchIdFromSession();
    const old = safeJson(rawOld, {}) || {};
    const incoming = safeJson(incomingValue, {}) || {};
    const oldLogs = normalizeArrayValue(old.accountLogs || [], []);
    const incomingLogs = normalizeArrayValue(incoming.accountLogs || [], []).map(item => ({ ...deepClone(item), branchId: branch }));
    const accountLogs = dedupeFundLogs([
      ...oldLogs.filter(item => !sameBranch(item, branch)),
      ...incomingLogs
    ]);
    const oldBranchAccounts = normalizeArrayValue(old.accounts || [], []).filter(item => sameBranch(item, branch));
    const incomingBranchAccounts = normalizeArrayValue(incoming.accounts || [], []).map(item => ({ ...deepClone(item), branchId: branch }));
    const incomingIds = new Set(incomingBranchAccounts.map(account => String(account?.id)));
    // الحساب ذو الرصيد الصفري يمكن حذفه بعد حذف/عكس العمليات المرتبطة به، حتى لو
    // بقي له أثر تاريخي قديم. نحمي فقط صندوق النظام المقفول أو الحساب الذي ما زال
    // يحمل رصيداً فعلياً، كي لا تعيد المزامنة صندوقاً صفرياً حذفه المستخدم عمداً.
    const protectedMissingAccounts = oldBranchAccounts.filter(account => {
      if (incomingIds.has(String(account?.id))) return false;
      return account?.isDefaultCash === true || account?.locked === true || Math.abs(Number(account?.balance || 0)) > 0.0001;
    }).map(account => {
      const locked = account?.isDefaultCash === true || account?.locked === true;
      return { ...deepClone(account), active:locked ? true : false, disabled:locked ? false : true, status:locked ? 'active' : 'inactive', disabledAt:locked ? '' : (account?.disabledAt || new Date().toISOString()), hasFinancialHistory:true, branchId:branch };
    });
    const accounts = [
      ...normalizeArrayValue(old.accounts || [], []).filter(item => !sameBranch(item, branch)),
      ...incomingBranchAccounts,
      ...protectedMissingAccounts
    ].map(account => {
      const hasLog = accountLogs.some(log => String(log?.accountId) === String(account?.id) && (Math.abs(Number(log?.amount || log?.baseAmount || 0)) > 0.0000001 || log?.sourceType || log?.refType));
      return hasLog || account?.hasFinancialHistory === true ? { ...account, hasFinancialHistory: true } : account;
    });
    return JSON.stringify({ ...old, ...incoming, accounts, accountLogs });
  }

  function getCompanyAccess() {
    return fullDatasetValue('cashtop_company_access', {}) || {};
  }

  const PLUS_LIMITS = Object.freeze({
    products:200, suppliers:50, branches:2, storesPerBranch:2, employeesPerBranch:3,
    invoicesDailyPerBranch:200, expensesDailyCompany:20, customersDailyCompany:100, purchasesDailyCompany:10
  });

  function normalizePlanLimit(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
  }

  function normalizeCustomLimits(value) {
    const source = value && typeof value === 'object' ? value : {};
    const daily = source.daily && typeof source.daily === 'object' ? source.daily : {};
    const fixed = source.fixed && typeof source.fixed === 'object' ? source.fixed : {};
    return {
      daily: {
        invoices: normalizePlanLimit(daily.invoices),
        customers: normalizePlanLimit(daily.customers),
        expenses: normalizePlanLimit(daily.expenses),
        suppliers: normalizePlanLimit(daily.suppliers)
      },
      fixed: {
        employees: normalizePlanLimit(fixed.employees),
        warehouses: normalizePlanLimit(fixed.warehouses),
        branches: normalizePlanLimit(fixed.branches),
        products: normalizePlanLimit(fixed.products)
      }
    };
  }

  function currentPlan() {
    const session = getSession() || {};
    const access = getCompanyAccess();
    const plan = String(access.plan || session.plan || 'pro').toLowerCase();
    return ['plus','pro','custom'].includes(plan) ? plan : 'pro';
  }

  function currentCustomLimits() {
    const session = getSession() || {};
    return normalizeCustomLimits(getCompanyAccess()?.customLimits || session.customLimits);
  }

  function dateKey(value) {
    const date = new Date(value || 0);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function isTodayRecord(record) {
    return dateKey(record?.createdAt || record?.date || record?.timestamp || record?.updatedAt) === dateKey(Date.now());
  }
  function countBranch(array, branch) {
    return normalizeArrayValue(array, []).filter(item => sameBranch(item, branch)).length;
  }

  function quotaViolation(canonical, oldRaw, newRaw) {
    // سندات القبض والصرف بدون أي سقف في جميع الخطط والنسخ.
    // العرض قد يستخدم Paging، لكن الحفظ والمزامنة والتصدير لا يضع حدًا لعدد السندات.
    if (canonical === 'cashtop_vouchers') return '';
    const plan = currentPlan();
    if (plan === 'pro') return '';

    const branch = branchIdFromSession();
    const oldVal = safeJson(oldRaw, canonical === 'cashtop_funds_db' ? {} : []);
    const newVal = safeJson(newRaw, canonical === 'cashtop_funds_db' ? {} : []);
    const grewPast = (oldCount, newCount, limit, label, planLabel) => {
      if (limit == null) return '';
      return newCount > limit && newCount > oldCount
        ? `وصلت خطة ${planLabel} إلى حد ${label} (${limit}).`
        : '';
    };

    if (plan === 'plus') {
      if (canonical === 'cashtop_products') return grewPast(countBranchProducts(oldVal, branch), countBranchProducts(newVal, branch), PLUS_LIMITS.products, 'المنتجات لكل فرع', 'Plus');
      if (canonical === 'cashtop_suppliers') return grewPast(countBranch(oldVal, branch), countBranch(newVal, branch), PLUS_LIMITS.suppliers, 'الموردين لكل فرع', 'Plus');
      if (canonical === 'cashtop_branches') return grewPast(normalizeArrayValue(oldVal, []).length, normalizeArrayValue(newVal, []).length, PLUS_LIMITS.branches, 'الفروع', 'Plus');
      if (canonical === 'cashtop_stores') return grewPast(countBranch(oldVal, branch), countBranch(newVal, branch), PLUS_LIMITS.storesPerBranch, 'المخازن لكل فرع', 'Plus');
      if (canonical === 'cashtop_employees') {
        const oldCounts = employeeCounts(oldVal), newCounts = employeeCounts(newVal);
        for (const [bid,count] of Object.entries(newCounts)) {
          if (count > PLUS_LIMITS.employeesPerBranch && count > Number(oldCounts[bid] || 0)) {
            return `وصلت خطة Plus إلى حد الموظفين للفرع (${PLUS_LIMITS.employeesPerBranch}).`;
          }
        }
      }
      if (canonical === 'cashtop_invoices') return grewPast(todayInvoiceCount(oldVal, branch), todayInvoiceCount(newVal, branch), PLUS_LIMITS.invoicesDailyPerBranch, 'فواتير البيع اليومية للفرع', 'Plus');
      if (canonical === 'cashtop_expenses') return grewPast(todayCount(oldVal), todayCount(newVal), PLUS_LIMITS.expensesDailyCompany, 'المصروفات اليومية للشركة', 'Plus');
      if (canonical === 'cashtop_customers') return grewPast(todayCount(oldVal), todayCount(newVal), PLUS_LIMITS.customersDailyCompany, 'العملاء الجدد يومياً للشركة', 'Plus');
      if (canonical === 'cashtop_purchases') return grewPast(todayCount(oldVal), todayCount(newVal), PLUS_LIMITS.purchasesDailyCompany, 'فواتير المشتريات اليومية للشركة', 'Plus');
      return '';
    }

    const limits = currentCustomLimits();
    const fixedCount = value => normalizeArrayValue(value, []).length;

    if (canonical === 'cashtop_products') return grewPast(fixedCount(oldVal), fixedCount(newVal), limits.fixed.products, 'المنتجات', 'المخصصة');
    if (canonical === 'cashtop_branches') return grewPast(fixedCount(oldVal), fixedCount(newVal), limits.fixed.branches, 'الفروع', 'المخصصة');
    if (canonical === 'cashtop_stores') return grewPast(fixedCount(oldVal), fixedCount(newVal), limits.fixed.warehouses, 'المخازن', 'المخصصة');
    if (canonical === 'cashtop_employees') return grewPast(fixedCount(oldVal), fixedCount(newVal), limits.fixed.employees, 'الموظفين', 'المخصصة');

    if (canonical === 'cashtop_invoices') return grewPast(todayInvoiceCount(oldVal), todayInvoiceCount(newVal), limits.daily.invoices, 'الفواتير اليومية', 'المخصصة');
    if (canonical === 'cashtop_customers') return grewPast(todayCount(oldVal), todayCount(newVal), limits.daily.customers, 'العملاء الجدد يومياً', 'المخصصة');
    if (canonical === 'cashtop_expenses') return grewPast(todayCount(oldVal), todayCount(newVal), limits.daily.expenses, 'المصاريف اليومية', 'المخصصة');
    if (canonical === 'cashtop_suppliers') return grewPast(todayCount(oldVal), todayCount(newVal), limits.daily.suppliers, 'الموردين الجدد يومياً', 'المخصصة');

    return '';
  }
  function countBranchProducts(products, branch) { return normalizeArrayValue(products, []).filter(p => productVisibleInBranch(p, branch)).length; }
  function employeeCounts(items) { const out={}; normalizeArrayValue(items, []).forEach(item => { const bid=String(item.branchId||'MAIN'); out[bid]=(out[bid]||0)+1; }); return out; }
  function todayCount(items) { return normalizeArrayValue(items, []).filter(isTodayRecord).length; }
  function todayInvoiceCount(items, branch = null) {
    return normalizeArrayValue(items, []).filter(item =>
      item?.status !== 'draft' && isTodayRecord(item) && (branch == null || sameBranch(item, branch))
    ).length;
  }

  /*
   * Revision 43: every record list is exposed newest-first at the storage API
   * boundary. This makes legacy pages, desktop tables and mobile cards agree
   * without duplicating sorting logic in every screen. The stored dataset stays
   * tenant-scoped; sorting only affects the projected value returned to a page.
   */
  function parseRecordDateValue(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 1e11 ? value : 0;
    }
    const text = String(value).trim();
    if (!text) return 0;
    if (/^\d{12,}$/.test(text)) return Number(text);
    const ar = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T،,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (ar) {
      const [, d, m, y, hh='0', mm='0', ss='0'] = ar;
      const time = new Date(Number(y), Number(m)-1, Number(d), Number(hh), Number(mm), Number(ss)).getTime();
      return Number.isFinite(time) ? time : 0;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function recordNewestEpoch(record) {
    if (!record || typeof record !== 'object') return 0;
    const fields = [
      'createdAt','created_at','createdDate','created_date','timestamp','timeStamp',
      'updatedAt','updated_at','date','invoiceDate','purchaseDate','paymentDate',
      'movementDate','transactionDate','orderDate','addedAt','savedAt'
    ];
    for (const field of fields) {
      const value = parseRecordDateValue(record[field]);
      if (value) return value;
    }
    for (const field of ['id','invoiceId','reference','number','code']) {
      const match = String(record[field] ?? '').match(/(\d{12,})/);
      if (match) return Number(match[1]) || 0;
    }
    return 0;
  }

  function sortNewestFirstRecords(input) {
    const list = normalizeArrayValue(input, []);
    return list.map((record, index) => ({ record, index, epoch: recordNewestEpoch(record) }))
      .sort((a, b) => (b.epoch - a.epoch) || (b.index - a.index))
      .map(item => item.record);
  }

  const PRODUCT_IMAGE_FIELDS = ['image','imageUrl','photo','imageStoragePath','imagePendingId','imagePath','productImage'];
  const PRODUCT_IMAGE_HISTORY_KEYS = new Set(['cashtop_invoices', 'cashtop_purchases']);

  // R106 — business datasets are reconciled record-by-record. A remote snapshot
  // is never allowed to make existing local records disappear just because the
  // remote array is shorter. Explicit deletions are carried as record tombstones.
  const LOSSLESS_RECORD_DATASETS = new Set([
    'cashtop_products','cashtop_product_categories','cashtop_materials','cashtop_material_purchases',
    'cashtop_customers','cashtop_customer_groups','cashtop_suppliers','cashtop_supplier_movements',
    'cashtop_invoices','cashtop_sales_reversals','cashtop_sales_returns',
    'cashtop_purchases','cashtop_purchase_reversals','cashtop_purchase_returns',
    'cashtop_expenses','cashtop_expense_types','cashtop_vouchers','cashtop_units','cashtop_stores',
    'cashtop_transfer_history','cashtop_branches','cashtop_branch_transfer_history','cashtop_employees',
    'cashtop_workers','cashtop_sales_agents','cashtop_agent_movements','cashtop_sales_offers',
    'cashtop_manufacturing_recipes','cashtop_manufacturing_orders','cashtop_wastage','cashtop_salary_payments',
    'cashtop_journal','cashtop_journal_reversal_archive','cashtop_financial_groups','cashtop_opening_balances'
  ]);
  const LOSSLESS_OBJECT_DATASETS = new Set(['cashtop_funds_db']);

  function losslessRecordIdentity(record, index = 0) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return `anon:${index}:${JSON.stringify(record)}`;
    for (const field of ['id','_id','uuid','invoiceId','refId','refNumber','reference','number','code','key','barcode']) {
      const value = record[field];
      if (value !== undefined && value !== null && String(value).trim()) return `${field}:${String(value).trim()}`;
    }
    if (record.accountId != null && (record.sourceId != null || record.refId != null)) {
      return `fund:${String(record.accountId)}:${String(record.sourceType || record.refType || '')}:${String(record.sourceId || record.refId || '')}:${String(record.type || '')}`;
    }
    if (record.accountId != null && (record.date || record.timestamp) && record.amount != null) {
      return `fundlog:${String(record.accountId)}:${String(record.date || record.timestamp)}:${String(record.type || '')}:${String(record.amount)}`;
    }
    return `anon:${index}:${JSON.stringify(record)}`;
  }

  function losslessRecordFreshness(record) {
    if (!record || typeof record !== 'object') return 0;
    for (const field of ['updatedAt','modifiedAt','savedAt','createdAt','timestamp']) {
      const value = record[field];
      if (value == null || value === '') continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 100000000000) return numeric;
      const parsed = new Date(value).getTime();
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  function mergeLosslessRecordArrays(localValue, remoteValue, tombstones = {}) {
    const local = normalizeArrayValue(localValue, []);
    const remote = normalizeArrayValue(remoteValue, []);
    const merged = new Map();
    local.forEach((record, index) => merged.set(losslessRecordIdentity(record, index), deepClone(record)));
    remote.forEach((record, index) => {
      const id = losslessRecordIdentity(record, index);
      const previous = merged.get(id);
      if (previous && previous && typeof previous === 'object' && typeof record === 'object' && !Array.isArray(previous) && !Array.isArray(record)) {
        // Preserve fields from both devices. When records carry their own save/update
        // timestamp, the newer record wins field conflicts; otherwise the incoming
        // cloud record wins as before.
        const localEpoch = losslessRecordFreshness(previous);
        const remoteEpoch = losslessRecordFreshness(record);
        merged.set(id, localEpoch > remoteEpoch
          ? { ...deepClone(record), ...previous }
          : { ...previous, ...deepClone(record) });
      } else {
        merged.set(id, deepClone(record));
      }
    });
    Object.entries(tombstones || {}).forEach(([id, stamp]) => {
      if (!id || !stamp) return;
      merged.delete(id);
    });
    return [...merged.values()];
  }

  function mergeLosslessObjectDataset(key, localValue, remoteValue) {
    if (key !== 'cashtop_funds_db') return remoteValue;
    const local = localValue && typeof localValue === 'object' && !Array.isArray(localValue) ? localValue : {};
    const remote = remoteValue && typeof remoteValue === 'object' && !Array.isArray(remoteValue) ? remoteValue : {};
    return {
      ...local,
      ...remote,
      accounts: mergeLosslessRecordArrays(local.accounts || [], remote.accounts || [], {}),
      accountLogs: mergeLosslessRecordArrays(local.accountLogs || [], remote.accountLogs || [], {})
    };
  }

  function mergeRecordTombstones(previous = {}, change = {}) {
    const next = { ...(previous && typeof previous === 'object' ? previous : {}) };
    const now = Date.now();
    (change.deletedIds || []).forEach(id => { if (id) next[String(id)] = now; });
    (change.touchedIds || []).forEach(id => { if (id) delete next[String(id)]; });
    const entries = Object.entries(next).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0)).slice(0, 5000);
    return Object.fromEntries(entries);
  }

  function stripProductImageFieldsFromObject(value) {
    if (!value || typeof value !== 'object') return value;
    const next = { ...value };
    PRODUCT_IMAGE_FIELDS.forEach(field => delete next[field]);
    return next;
  }

  function stripProductImageFieldsFromRows(input) {
    return normalizeArrayValue(input, []).map(stripProductImageFieldsFromObject);
  }

  function stripProductImageFieldsRaw(rawValue) {
    return JSON.stringify(stripProductImageFieldsFromRows(safeJson(rawValue, [])));
  }

  function stripInvoiceItemImageFieldsFromRows(input) {
    return normalizeArrayValue(input, []).map(record => {
      if (!record || typeof record !== 'object') return record;
      const next = { ...record };
      ['items', 'products', 'invoiceItems'].forEach(field => {
        if (Array.isArray(next[field])) next[field] = next[field].map(stripProductImageFieldsFromObject);
      });
      return next;
    });
  }

  function stripInvoiceItemImageFieldsRaw(rawValue) {
    return JSON.stringify(stripInvoiceItemImageFieldsFromRows(safeJson(rawValue, [])));
  }

  function transformManagedRead(canonical, rawValue) {
    if (rawValue == null) return rawValue;
    if (canonical === 'cashtop_products') {
      const projected = safeJson(projectProducts(safeJson(rawValue, [])), []);
      return JSON.stringify(sortNewestFirstRecords(projected));
    }
    if (BRANCH_SCOPED_ARRAY_KEYS.has(canonical)) {
      let projected = safeJson(projectBranchArray(safeJson(rawValue, [])), []);
      if (PRODUCT_IMAGE_HISTORY_KEYS.has(canonical)) projected = stripInvoiceItemImageFieldsFromRows(projected);
      return JSON.stringify(sortNewestFirstRecords(projected));
    }
    if (BRANCH_SCOPED_OBJECT_KEYS.has(canonical)) return projectFunds(rawValue);
    const parsed = safeJson(rawValue, null);
    if (Array.isArray(parsed)) return JSON.stringify(sortNewestFirstRecords(parsed));
    return rawValue;
  }

  function transformManagedWrite(canonical, oldRaw, value) {
    if (canonical === 'cashtop_products') return mergeProducts(safeJson(oldRaw, []), safeJson(value, []));
    if (BRANCH_SCOPED_ARRAY_KEYS.has(canonical)) {
      const merged = mergeBranchArray(safeJson(oldRaw, []), safeJson(value, []));
      return PRODUCT_IMAGE_HISTORY_KEYS.has(canonical) ? stripInvoiceItemImageFieldsRaw(merged) : merged;
    }
    if (BRANCH_SCOPED_OBJECT_KEYS.has(canonical)) return mergeFunds(oldRaw, value);
    return String(value);
  }

  function getRawCompanyDataset(key) {
    return rawGet(namespaceKey(canonicalKey(key)));
  }

  // كتابة مجموعة الشركة الكاملة دون إسقاطها على فرع الجلسة الحالية.
  // تستخدمها العمليات العابرة للفروع (مثل النقل من مخزن في فرع إلى مخزن في فرع آخر).
  // كتابة مباشرة لمجموعة مدارة مع تجاوز merge الخاص بالمجموعات ذات
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

  function setRawCompanyDataset(key, value, options = {}) {
    const canonical = canonicalKey(key);
    if (!isManagedKey(canonical)) throw new Error('مجموعة البيانات غير مدارة');
    assertFinancialGroupWritable(canonical);
    const ns = namespaceKey(canonical);
    const oldValue = rawGet(ns);
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (oldValue === stringValue) return { changed: false, operationId: null };
    if (options.bypassQuota !== true) {
      const violation = quotaViolation(canonical, oldValue, stringValue);
      if (violation) {
        showToast(violation, 'error', 5200);
        const error = new Error(violation); error.code = 'CASHTOP_PLAN_LIMIT'; throw error;
      }
    }
    rawSet(ns, stringValue);
    const previousMeta = safeJson(rawGet(metaKey(canonical)), {}) || {};
    rawSet(metaKey(canonical), JSON.stringify({
      ...previousMeta,
      updatedAt: Date.now(),
      revision: Number(previousMeta.revision || 0) + 1,
      deviceId: getDeviceId(),
      page: FILE,
      fullDatasetWrite: true
    }));
    if (options.audit !== false) appendAudit(canonical, oldValue, stringValue, options.action);
    const operationId = options.enqueue === false ? null : enqueueSyncOperation(canonical);
    emitDataChange(canonical, oldValue, stringValue, 'local-full', operationId);
    return { changed: true, operationId };
  }


  async function removeLegacyProductImagesV105() {
    const changedKeys = [];
    const sanitizers = new Map([
      ['cashtop_products', stripProductImageFieldsRaw],
      ['cashtop_invoices', stripInvoiceItemImageFieldsRaw],
      ['cashtop_purchases', stripInvoiceItemImageFieldsRaw]
    ]);
    for (const [key, sanitizer] of sanitizers) {
      const raw = getRawCompanyDataset(key);
      if (raw == null) continue;
      const clean = sanitizer(raw);
      if (clean === raw) continue;
      setRawCompanyDataset(key, clean, {
        action: 'r105-remove-product-images',
        bypassQuota: true,
        audit: false
      });
      changedKeys.push(key);
    }
    if (changedKeys.length) {
      await commitCriticalData(changedKeys).catch(() => ({ ok:false }));
      await preservePendingSyncState().catch(() => false);
      window.dispatchEvent(new CustomEvent('cashtop:product-images-removed', { detail:{ keys:changedKeys } }));
    }
    return { changedKeys };
  }


  function ensureFinancialGroups() {
    const ns = baseNamespaceKey(FINANCIAL_GROUPS_KEY);
    const existing = safeJson(rawGet(ns), null);
    if (Array.isArray(existing) && existing.length) return normalizeFinancialGroups(existing);
    const groups = normalizeFinancialGroups([]);
    // Keep the original R75 datasets as FG_LEGACY without moving a byte. On a
    // brand-new laptop this is only a seeded fallback: do NOT queue it before
    // Turso hydrates the real financial-group index, or a fresh device could
    // overwrite an existing company's group history with one empty placeholder.
    rawSet(ns, JSON.stringify(groups));
    rawSet(baseMetaKey(FINANCIAL_GROUPS_KEY), JSON.stringify({ updatedAt:0, revision:0, seeded:true, source:'financial-groups-fallback' }));
    return groups;
  }

  function financialGroupDefaultValue(key) {
    const canonical = canonicalKey(key);
    if (canonical === OPENING_BALANCES_KEY) return [];
    if (Object.prototype.hasOwnProperty.call(NON_ARRAY_DEFAULTS, canonical)) return JSON.parse(JSON.stringify(NON_ARRAY_DEFAULTS[canonical]));
    return [];
  }

  function parseFinancialGroupDataset(key, groupId, fallback = null) {
    const raw = rawGet(financialGroupNamespaceKey(key, groupId));
    if (raw == null) return fallback === null ? financialGroupDefaultValue(key) : fallback;
    return safeJson(raw, fallback === null ? financialGroupDefaultValue(key) : fallback);
  }

  function writeFinancialGroupDatasetRaw(key, groupId, value, options = {}) {
    const canonical = canonicalKey(key);
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    rawSet(financialGroupNamespaceKey(canonical, groupId), raw);
    const previous = safeJson(rawGet(financialGroupMetaKey(canonical, groupId)), {}) || {};
    rawSet(financialGroupMetaKey(canonical, groupId), JSON.stringify({
      updatedAt: Number(options.updatedAt || Date.now()),
      revision: Number(previous.revision || 0) + 1,
      deviceId: getDeviceId(),
      page: FILE,
      financialGroupId: groupId,
      seeded: false,
      openingSeed: options.openingSeed === true
    }));
    return raw;
  }

  function supplierFinancialBalance(supplier) {
    let balance = 0;
    normalizeArrayValue(supplier?.movements, []).forEach(movement => {
      const amount = Number(movement?.amount || 0);
      if (movement?.type === 'payment' || movement?.type === 'return') balance -= amount;
      else if (movement?.type === 'refundCash' || Number(movement?.balanceEffect) === 0) return;
      else balance += amount;
    });
    return balance;
  }

  function productOpeningQuantity(product) {
    let total = Number(product?.stockPieces ?? product?.stock ?? product?.qty ?? 0) || 0;
    if (Array.isArray(product?.variants)) {
      total = product.variants.reduce((sum, variant) => sum + (Number(variant?.qty ?? variant?.stockPieces ?? variant?.stock ?? 0) || 0), 0) || total;
    }
    return total;
  }

  function zeroProductStock(product) {
    const next = JSON.parse(JSON.stringify(product || {}));
    ['stockPieces', 'stock', 'qty', 'quantity'].forEach(field => { if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = 0; });
    if (Array.isArray(next.variants)) next.variants = next.variants.map(variant => ({ ...variant, qty: 0, stockPieces: 0, stock: 0 }));
    if (next.branchStock && typeof next.branchStock === 'object') Object.keys(next.branchStock).forEach(key => { next.branchStock[key] = 0; });
    if (next.storeStock && typeof next.storeStock === 'object') Object.keys(next.storeStock).forEach(key => { next.storeStock[key] = 0; });
    return next;
  }

  function zeroMaterialStock(material) {
    const next = JSON.parse(JSON.stringify(material || {}));
    ['stockPieces', 'stock', 'qty', 'quantity', 'balance'].forEach(field => { if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = 0; });
    return next;
  }

  function calculateFinancialGroupClosing(groupId = currentFinancialGroupId()) {
    const invoices = normalizeArrayValue(parseFinancialGroupDataset('cashtop_invoices', groupId, []), []);
    const expenses = normalizeArrayValue(parseFinancialGroupDataset('cashtop_expenses', groupId, []), []);
    const purchases = normalizeArrayValue(parseFinancialGroupDataset('cashtop_purchases', groupId, []), []);
    const sales = invoices.filter(invoice => invoice && invoice.status !== 'draft' && invoice.deleted !== true)
      .reduce((sum, invoice) => sum + Number(invoice.total || invoice.grandTotal || 0), 0);
    const expenseTotal = expenses.filter(item => item && item.deleted !== true)
      .reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0);
    const purchaseTotal = purchases.filter(item => item && item.deleted !== true)
      .reduce((sum, item) => sum + Number(item.total || item.grandTotal || 0), 0);
    return {
      sales: Number(sales.toFixed(4)),
      expenses: Number(expenseTotal.toFixed(4)),
      purchases: Number(purchaseTotal.toFixed(4)),
      netProfit: Number((sales - expenseTotal).toFixed(4)),
      invoicesCount: invoices.filter(invoice => invoice && invoice.status !== 'draft' && invoice.deleted !== true).length,
      purchasesCount: purchases.filter(item => item && item.deleted !== true).length,
      expensesCount: expenses.filter(item => item && item.deleted !== true).length,
      closedAt: new Date().toISOString()
    };
  }

  function buildFinancialGroupOpening(previousGroupId, carryBalances = true) {
    const now = new Date().toISOString();
    const openingRecords = [];
    const products = normalizeArrayValue(parseFinancialGroupDataset('cashtop_products', previousGroupId, []), []);
    const materials = normalizeArrayValue(parseFinancialGroupDataset('cashtop_materials', previousGroupId, []), []);
    const customers = normalizeArrayValue(parseFinancialGroupDataset('cashtop_customers', previousGroupId, []), []);
    const suppliers = normalizeArrayValue(parseFinancialGroupDataset('cashtop_suppliers', previousGroupId, []), []);
    const funds = parseFinancialGroupDataset('cashtop_funds_db', previousGroupId, { accounts: [], accountLogs: [] }) || { accounts: [], accountLogs: [] };
    const workers = normalizeArrayValue(parseFinancialGroupDataset('cashtop_workers', previousGroupId, []), []);
    const agents = normalizeArrayValue(parseFinancialGroupDataset('cashtop_sales_agents', previousGroupId, []), []);

    const nextProducts = products.map(product => {
      const quantity = carryBalances ? productOpeningQuantity(product) : 0;
      if (carryBalances && Math.abs(quantity) > 1e-9) openingRecords.push({ id:`OPEN_PRODUCT_${product.id || Math.random().toString(36).slice(2)}`, type:'inventory', entityType:'product', entityId:product.id || '', name:product.name || '', quantity, amount:0, date:now, note:'رصيد مخزون افتتاحي مرحّل من المجموعة السابقة' });
      return carryBalances ? JSON.parse(JSON.stringify(product)) : zeroProductStock(product);
    });
    const nextMaterials = materials.map(material => {
      const quantity = carryBalances ? Number(material?.stockPieces ?? material?.stock ?? material?.qty ?? material?.quantity ?? 0) || 0 : 0;
      if (carryBalances && Math.abs(quantity) > 1e-9) openingRecords.push({ id:`OPEN_MATERIAL_${material.id || Math.random().toString(36).slice(2)}`, type:'inventory', entityType:'material', entityId:material.id || '', name:material.name || '', quantity, amount:0, date:now, note:'رصيد صنف خام افتتاحي مرحّل' });
      return carryBalances ? JSON.parse(JSON.stringify(material)) : zeroMaterialStock(material);
    });
    const nextCustomers = customers.map(customer => {
      const next = JSON.parse(JSON.stringify(customer || {}));
      const balance = carryBalances ? Number(customer?.balance || 0) : 0;
      next.balance = balance;
      next.debtInvoices = [];
      if (Math.abs(balance) > 0.0001) {
        // A positive balance is a receivable and can be represented as the first
        // debt movement. A negative balance is a customer credit; keep it on the
        // customer/opening ledger without fabricating a positive debt invoice.
        if (balance > 0) {
          next.debtInvoices.push({ id:`OPEN_CUST_${customer.id || Math.random().toString(36).slice(2)}`, type:'opening-balance', amount:balance, signedAmount:balance, remaining:balance, date:now.slice(0,10), reference:'OPENING', notes:'رصيد افتتاحي مرحّل من المجموعة السابقة', source:'financial-group-opening', createdAt:now, updatedAt:now });
        }
        openingRecords.push({ id:`OPEN_CUSTOMER_${customer.id || Math.random().toString(36).slice(2)}`, type:balance >= 0 ? 'receivable' : 'customer-credit', entityType:'customer', entityId:customer.id || '', name:customer.name || '', amount:balance, date:now, note:'رصيد عميل افتتاحي مرحّل من المجموعة السابقة' });
      }
      next.updatedAt = now;
      return next;
    });
    const nextSuppliers = suppliers.map(supplier => {
      const next = JSON.parse(JSON.stringify(supplier || {}));
      const balance = carryBalances ? supplierFinancialBalance(supplier) : 0;
      next.movements = [];
      if (Math.abs(balance) > 0.0001) {
        next.movements.push({ id:`OPEN_SUP_${supplier.id || Math.random().toString(36).slice(2)}`, type:balance >= 0 ? 'debt' : 'payment', amount:Math.abs(balance), note:'رصيد افتتاحي مرحّل من المجموعة السابقة', date:now.slice(0,10), refType:'financial-group-opening', refId:'OPENING', createdAt:now });
        openingRecords.push({ id:`OPEN_SUPPLIER_${supplier.id || Math.random().toString(36).slice(2)}`, type:'payable', entityType:'supplier', entityId:supplier.id || '', name:supplier.name || '', amount:balance, date:now, note:'ذمة مورد افتتاحية مرحّلة' });
      }
      next.updatedAt = now;
      return next;
    });
    const nextFunds = {
      ...JSON.parse(JSON.stringify(funds || {})),
      accounts: normalizeArrayValue(funds?.accounts, []).map(account => {
        const next = JSON.parse(JSON.stringify(account || {}));
        const balance = carryBalances ? Number(account?.balance || 0) : 0;
        const hadHistory = account?.hasFinancialHistory === true || normalizeArrayValue(funds?.accountLogs, []).some(log => String(log?.accountId) === String(account?.id) && (Math.abs(Number(log?.amount || log?.baseAmount || 0)) > 0.0000001 || log?.sourceType || log?.refType));
        next.balance = balance;
        if (hadHistory) next.hasFinancialHistory = true;
        if (Math.abs(balance) > 0.0001) openingRecords.push({ id:`OPEN_FUND_${account.id || Math.random().toString(36).slice(2)}`, type:'cash', entityType:'fund', entityId:account.id || '', name:account.name || '', amount:balance, currencyId:account.currencyId || '', date:now, note:'رصيد صندوق/بنك افتتاحي مرحّل' });
        return next;
      }),
      accountLogs: []
    };
    nextFunds.accounts.forEach(account => {
      const balance = Number(account.balance || 0);
      if (Math.abs(balance) <= 0.0001) return;
      nextFunds.accountLogs.push({ id:`OPEN_LOG_${account.id}_${Date.now()}`, accountId:account.id, date:now, type:balance >= 0 ? 'إيداع' : 'سحب', amount:Math.abs(balance), baseAmount:Math.abs(balance), currencyId:account.currencyId || '', notes:'رصيد افتتاحي للمجموعة المالية الجديدة', refType:'financial-group-opening', refId:'OPENING' });
    });

    return { openingRecords, nextProducts, nextMaterials, nextCustomers, nextSuppliers, nextFunds, nextWorkers: JSON.parse(JSON.stringify(workers)), nextAgents: JSON.parse(JSON.stringify(agents)) };
  }

  async function createFinancialGroup(options = {}) {
    if (!can('financialGroups.create')) throw new Error('لا تملك صلاحية إغلاق وفتح المجموعات المالية.');
    const groups = getFinancialGroups();
    const current = getCurrentFinancialGroup();
    if (!current || current.status !== 'active') throw new Error('لا يمكن إنشاء مجموعة جديدة أثناء استعراض مجموعة مغلقة. انتقل إلى المجموعة المفتوحة أولاً.');
    const name = String(options.name || '').trim();
    if (!name) throw new Error('أدخل اسم المجموعة الجديدة.');
    if (navigator.onLine === false) throw new Error('إغلاق المجموعة المالية يحتاج اتصالاً بالإنترنت لضمان ترحيل آخر الأرصدة من جميع الأجهزة.');

    // Closing is rare; correctness wins here. Flush pending writes, then refresh
    // only the financial datasets once so the opening balances use the newest cloud state.
    if (getSyncQueue().length && window.CashtopTurso?.syncAll) {
      await window.CashtopTurso.syncAll({ manual:false, forceRetry:true }).catch(() => null);
    }
    if (getSyncQueue().length) throw new Error('توجد عمليات غير متزامنة. انتظر اكتمال المزامنة ثم أعد المحاولة.');
    if (window.CashtopTurso?.pullDatasetKeys) {
      await window.CashtopTurso.pullDatasetKeys([...FINANCIAL_GROUP_SCOPED_KEYS].filter(key => key !== OPENING_BALANCES_KEY), { concurrency:6, silentProgress:true }).catch(error => { throw error; });
    }
    if (typeof window.Cashtop?.rebuildJournal === 'function') {
      try { window.Cashtop.rebuildJournal(); } catch (_) {}
    }

    const previousId = current.id;
    const closing = calculateFinancialGroupClosing(previousId);
    const carryBalances = options.carryBalances !== false;
    const opening = buildFinancialGroupOpening(previousId, carryBalances);
    const id = `FG_${Date.now()}_${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    const session = getSession() || {};
    const capitalClosing = Number(current.capitalOpening || 0) + Number(closing.netProfit || 0);
    opening.openingRecords.push({ id:`OPEN_EQUITY_${id}`, type:'equity', entityType:'equity', entityId:'RETAINED_EARNINGS', name:'رأس المال / الأرباح والخسائر المرحلة', amount:carryBalances ? capitalClosing : 0, date:new Date().toISOString(), note:'ترحيل صافي ربح/خسارة المجموعة السابقة ككتلة واحدة إلى رأس المال' });

    const nextGroups = groups.map(group => group.id === previousId ? {
      ...group, status:'closed', closedAt:new Date().toISOString(), closingSummary:closing,
      capitalClosing, nextGroupId:id
    } : group);
    nextGroups.push({
      id, name, status:'active', legacy:false, previousGroupId:previousId, nextGroupId:'',
      createdAt:new Date().toISOString(), openedAt:new Date().toISOString(), closedAt:'',
      capitalOpening: carryBalances ? capitalClosing : 0, capitalClosing:0,
      openingSummary:{
        funds: opening.nextFunds.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
        customerReceivables: opening.nextCustomers.reduce((sum, customer) => sum + Math.max(0, Number(customer.balance || 0)), 0),
        supplierPayables: opening.nextSuppliers.reduce((sum, supplier) => sum + Math.max(0, supplierFinancialBalance(supplier)), 0),
        inventoryRecords: opening.openingRecords.filter(record => record.type === 'inventory').length,
        capital: carryBalances ? capitalClosing : 0
      },
      closingSummary:null,
      settingsSource: String(options.importSettings || 'last') === 'none' ? 'none' : 'previous',
      createdBy: session.displayName || session.username || 'مستخدم'
    });

    // Prepare every scoped slot before switching. Empty transaction datasets stay
    // local-only until they actually receive data, saving cloud writes/storage.
    for (const key of FINANCIAL_GROUP_SCOPED_KEYS) {
      if (key === 'cashtop_products') writeFinancialGroupDatasetRaw(key, id, opening.nextProducts, { openingSeed:true });
      else if (key === 'cashtop_materials') writeFinancialGroupDatasetRaw(key, id, opening.nextMaterials, { openingSeed:true });
      else if (key === 'cashtop_customers') writeFinancialGroupDatasetRaw(key, id, opening.nextCustomers, { openingSeed:true });
      else if (key === 'cashtop_suppliers') writeFinancialGroupDatasetRaw(key, id, opening.nextSuppliers, { openingSeed:true });
      else if (key === 'cashtop_funds_db') writeFinancialGroupDatasetRaw(key, id, opening.nextFunds, { openingSeed:true });
      else if (key === 'cashtop_workers') writeFinancialGroupDatasetRaw(key, id, opening.nextWorkers, { openingSeed:true });
      else if (key === 'cashtop_sales_agents') writeFinancialGroupDatasetRaw(key, id, opening.nextAgents, { openingSeed:true });
      else if (key === OPENING_BALANCES_KEY) writeFinancialGroupDatasetRaw(key, id, opening.openingRecords, { openingSeed:true });
      else writeFinancialGroupDatasetRaw(key, id, financialGroupDefaultValue(key), { openingSeed:true });
    }

    localStorage.setItem(FINANCIAL_GROUPS_KEY, JSON.stringify(nextGroups));
    try { sessionStorage.setItem(financialGroupSelectionKey(), id); } catch (_) {}

    // Queue only datasets that carry meaningful opening/master data. Empty period
    // datasets are created lazily, which keeps the close/open operation economical.
    [
      'cashtop_products','cashtop_materials','cashtop_customers','cashtop_suppliers',
      'cashtop_funds_db','cashtop_workers','cashtop_sales_agents',OPENING_BALANCES_KEY
    ].forEach(key => {
      const raw = rawGet(namespaceKey(key));
      const parsed = safeJson(raw, null);
      const meaningful = Array.isArray(parsed) ? parsed.length > 0 : parsed && typeof parsed === 'object' ? Object.keys(parsed).length > 0 : Boolean(raw);
      if (meaningful) enqueueSyncOperation(key, { forceReplace:true });
    });
    try { sessionStorage.setItem(financialGroupToastKey(), JSON.stringify({ name, status:'active' })); } catch (_) {}
    window.dispatchEvent(new CustomEvent('cashtop:financial-group-changed', { detail:{ id, previousId, name, status:'active', created:true } }));
    // Important: turso-sync is intentionally page-scoped to the group selected at
    // page boot. We leave the new group's queued opening records intact and let
    // the destination page (loaded with the new group id) flush them. This prevents
    // any opening data from being written to the just-closed group's cloud rows.
    return nextGroups.find(group => group.id === id);
  }

  async function selectFinancialGroup(groupId, options = {}) {
    if (!can('financialGroups.switch')) throw new Error('لا تملك صلاحية الانتقال بين المجموعات المالية.');
    const groups = getFinancialGroups();
    const target = groups.find(group => String(group.id) === String(groupId));
    if (!target) throw new Error('المجموعة المالية المطلوبة غير موجودة.');
    if (target.status === 'closed' && !can('financialGroups.viewClosed')) throw new Error('لا تملك صلاحية استعراض المجموعات المالية المغلقة.');
    const currentId = currentFinancialGroupId();
    if (currentId !== target.id && getSyncQueue().length) {
      if (navigator.onLine === false) throw new Error('هناك عمليات لم تُزامن بعد. اتصل بالإنترنت قبل الانتقال إلى مجموعة أخرى.');
      await window.CashtopTurso?.syncAll?.({ manual:false, forceRetry:true })?.catch?.(() => null);
      if (getSyncQueue().length) throw new Error('انتظر اكتمال المزامنة قبل الانتقال إلى مجموعة أخرى.');
    }
    try { sessionStorage.setItem(financialGroupSelectionKey(), target.id); } catch (_) {}
    try { sessionStorage.setItem(financialGroupToastKey(), JSON.stringify({ name:target.name, status:target.status })); } catch (_) {}
    window.dispatchEvent(new CustomEvent('cashtop:financial-group-changed', { detail:{ id:target.id, name:target.name, status:target.status } }));
    if (options.navigate !== false) location.href = options.target || 'لوحة التحكم.html';
    return target;
  }

  function consumeFinancialGroupToast() {
    try {
      const key = financialGroupToastKey();
      const payload = safeJson(sessionStorage.getItem(key), null);
      if (!payload) return;
      sessionStorage.removeItem(key);
      const message = payload.status === 'closed'
        ? `تم فتح المجموعة [${payload.name}] بنجاح.`
        : `تم الدخول إلى المجموعة [${payload.name}] — جاهزة للعمل.`;
      showToast(message, 'success', 3600);
    } catch (_) {}
  }

  function readOnlyPermissionAllowed(requirement) {
    const list = Array.isArray(requirement) ? requirement : [requirement];
    return list.some(permission => /(?:\.view$|\.export$|\.print$|\.image$|reports\.send$|financialGroups\.(?:switch|viewClosed|view)$)/.test(String(permission || '')));
  }

  function applyFinancialGroupReadOnlyUi(root = document) {
    const group = getCurrentFinancialGroup();
    document.getElementById('ctFinancialGroupReadOnlyBanner')?.remove?.();
    if (!group || group.status !== 'closed') return;
    root.querySelectorAll?.('[data-ct-permission], [data-ct-permission-any]').forEach(element => {
      const requirement = readPermissionRequirement(element);
      if (readOnlyPermissionAllowed(requirement)) return;
      if ('disabled' in element) element.disabled = true;
      element.classList.add('ct-group-readonly-disabled');
      element.title = 'المجموعة مغلقة للقراءة فقط';
    });
  }

  /* ============================================================
   * Performance + atomic data layer
   * ============================================================ */
  const pendingVirtualRenders = new WeakMap();

  function debounce(fn, wait = 300) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      const ctx = this;
      timer = setTimeout(() => fn.apply(ctx, args), Math.max(0, Number(wait) || 0));
    };
  }

  function runWhenIdle(callback, timeout = 700) {
    if (typeof requestIdleCallback === 'function') return requestIdleCallback(callback, { timeout });
    return setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 0);
  }

  function cancelWhenIdle(id) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
    else clearTimeout(id);
  }

  let recordsStreamLoaderTimer = 0;
  let recordsStreamLoaderHideTimer = 0;
  function setRecordsStreamLoading(active, label = 'جاري تحميل السجلات...') {
    let node = document.getElementById('ctRecordsStreamLoader');
    if (active) {
      clearTimeout(recordsStreamLoaderHideTimer);
      if (!node) {
        node = document.createElement('div');
        node.id = 'ctRecordsStreamLoader';
        node.className = 'ct-records-stream-loader';
        node.innerHTML = '<span class="ct-records-spinner" aria-hidden="true"></span><span class="ct-records-loader-label"></span>';
        document.body?.appendChild(node);
      }
      const text = node.querySelector('.ct-records-loader-label');
      if (text) text.textContent = label;
      clearTimeout(recordsStreamLoaderTimer);
      recordsStreamLoaderTimer = setTimeout(() => node?.classList.add('active'), 35);
      return;
    }
    clearTimeout(recordsStreamLoaderTimer);
    recordsStreamLoaderHideTimer = setTimeout(() => node?.classList.remove('active'), 45);
  }

  function runVirtualPaint(task, label = 'جاري تحميل السجلات...') {
    setRecordsStreamLoading(true, label);
    requestAnimationFrame(() => {
      try { task(); }
      finally { requestAnimationFrame(() => setRecordsStreamLoading(false)); }
    });
  }

  /**
   * Lazy table renderer: only the first chunk is inserted initially. More rows
   * are appended when the user approaches the sentinel. This is intentionally
   * shared by products, invoices and any other large record table.
   */
  function renderVirtualRows(tbody, records, rowFactory, options = {}) {
    if (!tbody || typeof rowFactory !== 'function') return { rendered: 0, total: 0 };
    const previous = pendingVirtualRenders.get(tbody);
    if (previous?.observer) previous.observer.disconnect();
    if (previous?.idleId) cancelWhenIdle(previous.idleId);
    if (previous?.scrollCleanup) previous.scrollCleanup();

    const list = Array.isArray(records) ? records : [];
    const chunkSize = Math.max(25, Number(options.chunkSize || 100));
    const eagerLimit = Math.max(chunkSize, Number(options.eagerLimit || 180));
    const colspan = Math.max(1, Number(options.colspan || tbody.closest('table')?.querySelectorAll('thead th').length || 1));
    const token = { cancelled: false, observer: null, idleId: null, scrollCleanup: null };
    pendingVirtualRenders.set(tbody, token);
    tbody.innerHTML = '';

    if (!list.length) {
      if (options.emptyHtml) tbody.innerHTML = options.emptyHtml;
      return { rendered: 0, total: 0 };
    }

    /* For genuinely large tables keep only a moving DOM window. Rows above and
       below the visible area are replaced by lightweight spacer rows, then are
       recreated when the user scrolls back. This prevents long-running POS
       sessions and multi-year logs from exhausting mobile RAM. */
    const windowThreshold = Math.max(180, Number(options.windowThreshold || 260));
    if (typeof IntersectionObserver === 'function' && list.length > windowThreshold) {
      const rowHeight = Math.max(32, Number(options.rowHeight || 48));
      const windowSize = Math.max(64, Math.min(112, Number(options.windowSize || 96)));
      const shiftSize = Math.max(40, Math.min(windowSize - 40, Number(options.shiftSize || Math.floor(windowSize / 2))));
      let start = 0;
      let end = Math.min(list.length, windowSize);
      let topSentinel = null;
      let bottomSentinel = null;
      let shifting = false;

      const spacer = (height, cls) => {
        const tr = document.createElement('tr');
        tr.className = `ct-virtual-spacer ${cls}`;
        const td = document.createElement('td');
        td.colSpan = colspan;
        td.style.cssText = `height:${Math.max(0, height)}px;padding:0!important;border:0!important;line-height:0!important;`;
        tr.appendChild(td);
        return tr;
      };
      const sentinel = cls => {
        const tr = document.createElement('tr');
        tr.className = `ct-virtual-window-sentinel ${cls}`;
        tr.innerHTML = `<td colspan="${colspan}" style="height:1px;padding:0!important;border:0!important;line-height:0!important"></td>`;
        return tr;
      };
      const observeEdges = () => {
        token.observer?.disconnect();
        if (topSentinel) token.observer?.observe(topSentinel);
        if (bottomSentinel) token.observer?.observe(bottomSentinel);
      };
      const renderWindow = () => {
        if (token.cancelled) return;
        const fragment = document.createDocumentFragment();
        if (start > 0) {
          fragment.appendChild(spacer(start * rowHeight, 'ct-virtual-spacer-top'));
          topSentinel = sentinel('ct-virtual-window-top');
          fragment.appendChild(topSentinel);
        } else topSentinel = null;
        for (let index = start; index < end; index += 1) {
          const row = rowFactory(list[index], index);
          if (!row) continue;
          try { row.style.contentVisibility = 'auto'; row.style.containIntrinsicSize = `${rowHeight}px`; } catch (_) {}
          fragment.appendChild(row);
        }
        if (end < list.length) {
          bottomSentinel = sentinel('ct-virtual-window-bottom');
          fragment.appendChild(bottomSentinel);
          fragment.appendChild(spacer((list.length - end) * rowHeight, 'ct-virtual-spacer-bottom'));
        } else bottomSentinel = null;
        tbody.replaceChildren(fragment);
        options.onProgress?.({ rendered: end - start, total: list.length, start, end, windowed: true });
        requestAnimationFrame(observeEdges);
      };
      token.observer = new IntersectionObserver(entries => {
        if (shifting || token.cancelled) return;
        const topHit = entries.some(entry => entry.isIntersecting && entry.target === topSentinel);
        const bottomHit = entries.some(entry => entry.isIntersecting && entry.target === bottomSentinel);
        if (!topHit && !bottomHit) return;
        shifting = true;
        if (bottomHit && end < list.length) {
          const nextStart = Math.min(Math.max(0, list.length - windowSize), start + shiftSize);
          start = nextStart;
          end = Math.min(list.length, start + windowSize);
        } else if (topHit && start > 0) {
          start = Math.max(0, start - shiftSize);
          end = Math.min(list.length, start + windowSize);
        }
        runVirtualPaint(() => {
          renderWindow();
          shifting = false;
        });
      }, { root: null, rootMargin: '900px 0px' });

      // Direct scrollbar jumps can skip the edge sentinels. Recenter the DOM
      // window from the actual viewport offset so even jumping to year 10 of a
      // huge log renders only the nearby rows instead of a blank spacer.
      let scrollRoot = window;
      let scrollRaf = 0;
      const findScrollRoot = () => {
        let node = tbody.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
          try {
            const style = getComputedStyle(node);
            if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 8) return node;
          } catch (_) {}
          node = node.parentElement;
        }
        return window;
      };
      const recenterFromViewport = () => {
        scrollRaf = 0;
        if (token.cancelled || !tbody.isConnected) return;
        const bodyRect = tbody.getBoundingClientRect();
        const viewportTop = scrollRoot === window ? 0 : scrollRoot.getBoundingClientRect().top;
        const visibleOffset = Math.max(0, viewportTop - bodyRect.top);
        const targetIndex = Math.max(0, Math.min(list.length - 1, Math.floor(visibleOffset / rowHeight)));
        const desiredStart = Math.max(0, Math.min(Math.max(0, list.length - windowSize), targetIndex - Math.floor(windowSize * .25)));
        if (Math.abs(desiredStart - start) < Math.max(20, Math.floor(shiftSize / 3))) return;
        start = desiredStart;
        end = Math.min(list.length, start + windowSize);
        runVirtualPaint(renderWindow);
      };
      const onScroll = () => {
        if (!scrollRaf) scrollRaf = requestAnimationFrame(recenterFromViewport);
      };
      const attachScroll = () => {
        scrollRoot = findScrollRoot();
        window.addEventListener('scroll', onScroll, { passive: true });
        if (scrollRoot !== window) scrollRoot.addEventListener('scroll', onScroll, { passive: true });
        token.scrollCleanup = () => {
          token.cancelled = true;
          if (scrollRaf) cancelAnimationFrame(scrollRaf);
          window.removeEventListener('scroll', onScroll);
          if (scrollRoot !== window) scrollRoot.removeEventListener('scroll', onScroll);
        };
      };
      renderWindow();
      requestAnimationFrame(attachScroll);
      return { rendered: end - start, total: list.length, windowed: true };
    }

    let cursor = 0;
    let sentinel = null;
    const appendChunk = () => {
      if (token.cancelled || cursor >= list.length) return;
      const fragment = document.createDocumentFragment();
      const end = Math.min(list.length, cursor + chunkSize);
      for (; cursor < end; cursor += 1) {
        const row = rowFactory(list[cursor], cursor);
        if (row) {
          try { row.style.contentVisibility = 'auto'; row.style.containIntrinsicSize = '44px'; } catch (_) {}
          fragment.appendChild(row);
        }
      }
      if (sentinel?.isConnected) sentinel.remove();
      tbody.appendChild(fragment);
      if (cursor < list.length) {
        sentinel = document.createElement('tr');
        sentinel.className = 'ct-lazy-table-sentinel';
        sentinel.innerHTML = `<td colspan="${colspan}" style="height:1px;padding:0;border:0"></td>`;
        tbody.appendChild(sentinel);
        if (token.observer) token.observer.observe(sentinel);
      } else if (token.observer) {
        token.observer.disconnect();
      }
      options.onProgress?.({ rendered: cursor, total: list.length });
    };

    if (typeof IntersectionObserver === 'function' && list.length > eagerLimit) {
      token.observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          token.observer.disconnect();
          setRecordsStreamLoading(true);
          token.idleId = runWhenIdle(() => {
            appendChunk();
            if (sentinel && cursor < list.length) token.observer.observe(sentinel);
            requestAnimationFrame(() => setRecordsStreamLoading(false));
          }, 250);
        }
      }, { rootMargin: '700px 0px' });
    }

    appendChunk();
    if (list.length <= eagerLimit) {
      while (cursor < list.length) appendChunk();
    } else if (!token.observer) {
      const pump = () => {
        if (cursor >= list.length || token.cancelled) return;
        appendChunk();
        token.idleId = runWhenIdle(pump, 500);
      };
      token.idleId = runWhenIdle(pump, 500);
    }
    return { rendered: cursor, total: list.length };
  }

  /**
   * Windowed grid renderer for POS/product cards. Only rows near the scroll
   * viewport exist in DOM, so thousands of products do not create thousands of
   * cards/listeners/images at once. The complete record array stays in memory
   * for compatibility with existing business logic, but the DOM stays small.
   */
  const pendingVirtualGrids = new WeakMap();

  function renderVirtualGrid(container, records, cardFactory, options = {}) {
    if (!container || typeof cardFactory !== 'function') return { rendered:0, total:0 };
    const previous = pendingVirtualGrids.get(container);
    previous?.cleanup?.();

    const list = Array.isArray(records) ? records : [];
    const minItemWidth = Math.max(70, Number(options.minItemWidth || 110));
    const gap = Math.max(0, Number(options.gap || 10));
    const estimatedRowHeight = Math.max(70, Number(options.rowHeight || 150));
    const overscanRows = Math.max(1, Number(options.overscanRows || 3));
    const maxDomItems = Math.max(48, Math.min(120, Number(options.maxDomItems || 96)));
    const token = { cancelled:false, cleanup:null };
    pendingVirtualGrids.set(container, token);
    container.replaceChildren();

    if (!list.length) {
      if (options.emptyHtml) container.innerHTML = options.emptyHtml;
      return { rendered:0, total:0, windowed:true };
    }

    let raf = 0;
    let lastSignature = '';
    let resizeObserver = null;

    const columns = () => {
      const style = getComputedStyle(container);
      const width = Math.max(1, container.clientWidth - (parseFloat(style.paddingLeft)||0) - (parseFloat(style.paddingRight)||0));
      if (options.columns) return Math.max(1, Number(options.columns));
      return Math.max(1, Math.floor((width + gap) / (minItemWidth + gap)));
    };

    const spacer = (height, cls) => {
      const node = document.createElement('div');
      node.className = `ct-virtual-grid-spacer ${cls}`;
      node.style.cssText = `grid-column:1/-1;height:${Math.max(0,height)}px;min-height:${Math.max(0,height)}px;pointer-events:none;`;
      return node;
    };

    const render = () => {
      raf = 0;
      if (token.cancelled || !container.isConnected) return;
      const cols = columns();
      const viewportHeight = Math.max(container.clientHeight || 0, 320);
      const visibleRows = Math.max(2, Math.ceil(viewportHeight / estimatedRowHeight));
      const desiredRows = Math.max(2, Math.min(Math.ceil(maxDomItems / cols), visibleRows + overscanRows * 2));
      const totalRows = Math.ceil(list.length / cols);
      const scrollTop = Math.max(0, container.scrollTop || 0);
      const firstVisibleRow = Math.floor(scrollTop / estimatedRowHeight);
      let startRow = Math.max(0, firstVisibleRow - overscanRows);
      let endRow = Math.min(totalRows, startRow + desiredRows);
      if (endRow - startRow < desiredRows) startRow = Math.max(0, endRow - desiredRows);
      const start = Math.min(list.length, startRow * cols);
      const end = Math.min(list.length, endRow * cols);
      const signature = `${cols}:${start}:${end}:${list.length}`;
      if (signature === lastSignature) return;
      lastSignature = signature;

      const fragment = document.createDocumentFragment();
      if (startRow > 0) fragment.appendChild(spacer(startRow * estimatedRowHeight, 'ct-virtual-grid-top'));
      for (let index=start; index<end; index+=1) {
        const card = cardFactory(list[index], index);
        if (!card) continue;
        try {
          card.style.contentVisibility = 'auto';
          card.style.containIntrinsicSize = `${estimatedRowHeight-gap}px`;
        } catch (_) {}
        fragment.appendChild(card);
      }
      const bottomRows = Math.max(0, totalRows - endRow);
      if (bottomRows) fragment.appendChild(spacer(bottomRows * estimatedRowHeight, 'ct-virtual-grid-bottom'));
      container.replaceChildren(fragment);
      options.onProgress?.({ rendered:end-start, total:list.length, start, end, columns:cols, windowed:true });
    };

    let gridHasRendered = false;
    const renderWithState = () => { render(); gridHasRendered = true; };
    const schedule = () => {
      if (raf) return;
      if (gridHasRendered) setRecordsStreamLoading(true, 'جاري تحميل المنتجات...');
      raf = requestAnimationFrame(() => {
        render();
        gridHasRendered = true;
        requestAnimationFrame(() => setRecordsStreamLoading(false));
      });
    };
    container.addEventListener('scroll', schedule, { passive:true });
    window.addEventListener('resize', schedule, { passive:true });
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(container);
    }
    token.cleanup = () => {
      token.cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      container.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resizeObserver?.disconnect?.();
    };
    renderWithState();
    return { rendered:Math.min(list.length,maxDomItems), total:list.length, windowed:true };
  }


  let sharedWorker = null;
  let workerSequence = 0;
  const workerPending = new Map();
  function getSharedWorker() {
    if (sharedWorker || typeof Worker !== 'function') return sharedWorker;
    try {
      sharedWorker = new Worker('cashtop-worker.js?v=2');
      sharedWorker.onmessage = event => {
        const { id, result, error } = event.data || {};
        const pending = workerPending.get(id);
        if (!pending) return;
        workerPending.delete(id);
        if (error) pending.reject(new Error(error)); else pending.resolve(result);
      };
      sharedWorker.onerror = error => console.warn('[CASH TOP 2] worker:', error);
    } catch (_) { sharedWorker = null; }
    return sharedWorker;
  }

  function runWorkerTask(type, payload, fallback) {
    const worker = getSharedWorker();
    if (!worker) return Promise.resolve().then(() => typeof fallback === 'function' ? fallback() : null);
    return new Promise((resolve, reject) => {
      const id = `W_${Date.now()}_${++workerSequence}`;
      workerPending.set(id, { resolve, reject });
      try { worker.postMessage({ id, type, payload }); }
      catch (error) { workerPending.delete(id); Promise.resolve().then(() => typeof fallback === 'function' ? fallback() : null).then(resolve, reject); }
    });
  }

  async function queryRecords(datasetKey, options = {}) {
    const canonical = canonicalKey(datasetKey);
    const parsed = safeJson(localStorage.getItem(canonical), []);
    let records = Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
    const query = String(options.query || '').trim();
    const fields = Array.isArray(options.fields) ? options.fields : [];
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.max(1, Math.min(1000, Number(options.limit || 100)));

    if (query && fields.length) {
      const filterFallback = () => {
        const q = query.toLocaleLowerCase('ar');
        return records.filter(record => fields.some(field => String(record?.[field] ?? '').toLocaleLowerCase('ar').includes(q)));
      };
      records = records.length >= 800
        ? await runWorkerTask('filter-records', { records, query, fields }, filterFallback)
        : filterFallback();
    }

    if (typeof options.predicate === 'function') records = records.filter(options.predicate);
    if (options.sortBy) {
      const field = String(options.sortBy);
      const direction = String(options.sortDir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
      if (field === 'date' && direction === -1 && records.length >= 800) {
        records = await runWorkerTask('sort-date-desc', { records, field }, () => records.slice().sort((a, b) => new Date(b?.[field] || 0) - new Date(a?.[field] || 0)));
      } else {
        records = records.slice().sort((a, b) => {
          const av = a?.[field]; const bv = b?.[field];
          if (typeof av === 'number' || typeof bv === 'number') return (Number(av || 0) - Number(bv || 0)) * direction;
          return String(av ?? '').localeCompare(String(bv ?? ''), 'ar', { numeric: true }) * direction;
        });
      }
    }

    const total = records.length;
    return { items: records.slice(offset, offset + limit), total, offset, limit, hasMore: offset + limit < total };
  }

  function atomicTransactionPrefix() {
    return `cashtop_tx::${encodeURIComponent(companyIdFromSession())}::`;
  }

  const GENERIC_JOURNAL_REVERSAL_TYPES = new Map([
    ['cashtop_sales_returns', new Set(['sales-return'])],
    ['cashtop_purchase_returns', new Set(['purchase-return'])],
    ['cashtop_expenses', new Set(['expense'])],
    ['cashtop_vouchers', new Set(['voucher'])]
  ]);

  function managedRecordId(record) {
    if (!record || typeof record !== 'object') return '';
    return String(record.id ?? record.refNumber ?? record.reference ?? '').trim();
  }

  function genericDeletionReversalArchiveEntry(entries) {
    const candidates = (entries || []).filter(entry => GENERIC_JOURNAL_REVERSAL_TYPES.has(entry.key));
    if (!candidates.length) return null;
    // نضمن أن دفتر الأستاذ الحالي يمثل البيانات قبل الحذف، حتى لو كان آخر تحديث
    // للواجهة لم يُمهل محرك المحاسبة لإعادة البناء بعد.
    try { window.Cashtop?.rebuildJournal?.(); } catch (_) {}
    const journal = normalizeArrayValue(safeJson(rawGet(namespaceKey('cashtop_journal')), []), []);
    if (!journal.length) return null;
    const archiveKey = 'cashtop_journal_reversal_archive';
    const archiveNs = namespaceKey(archiveKey);
    const oldArchiveRaw = rawGet(archiveNs);
    const archive = normalizeArrayValue(safeJson(oldArchiveRaw, []), []);
    const archiveRevisionKey = row => {
      const revision = String(row?.sourceRevision || row?.originalRecord?.updatedAt || row?.originalRecord?.date || row?.deletedAt || 'legacy');
      return `${row?.sourceDataset || ''}::${row?.sourceId || ''}::${revision}`;
    };
    const existing = new Set(archive.map(archiveRevisionKey));
    let changed = false;

    candidates.forEach(entry => {
      const allowedTypes = GENERIC_JOURNAL_REVERSAL_TYPES.get(entry.key);
      const oldRows = normalizeArrayValue(safeJson(entry.oldValue, []), []);
      const newRows = normalizeArrayValue(safeJson(entry.newValue, []), []);
      const newById = new Map(newRows.map(record => [managedRecordId(record), record]).filter(([id]) => id));
      oldRows.forEach(record => {
        const sourceId = managedRecordId(record);
        if (!sourceId) return;
        const nextRecord = newById.get(sourceId) || null;
        const wasDeleted = !nextRecord;
        // مرتجع المبيعات يحتاج قيد عكس عند التعديل كذلك، وليس عند الحذف فقط.
        // نقارن النسخة المحفوظة القديمة بالجديدة قبل الكتابة كي يبقى سجل التدقيق
        // عبارة عن: القيد القديم + عكسه + القيد المعدل الجديد.
        const wasEdited = entry.key === 'cashtop_sales_returns' && !!nextRecord
          && JSON.stringify(record) !== JSON.stringify(nextRecord);
        if (!wasDeleted && !wasEdited) return;
        const sourceRevision = String(record?.updatedAt || record?.date || record?.createdAt || 'legacy');
        const dedupeKey = `${entry.key}::${sourceId}::${sourceRevision}`;
        if (existing.has(dedupeKey)) return;
        const lines = journal.filter(line => String(line?.sourceId || '') === sourceId && line?.archivedOriginal !== true && allowedTypes.has(String(line?.sourceType || '')));
        if (!lines.length) return;
        const deletedAt = new Date().toISOString();
        archive.push({
          id: `AUTO_REV_${sourceId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          branchId: recordBranchId(record),
          sourceDataset: entry.key,
          sourceId,
          sourceRevision,
          reversalReason: wasEdited ? 'edit' : 'delete',
          deletedAt,
          originalRecord: deepClone(record),
          originalLines: deepClone(lines)
        });
        existing.add(dedupeKey);
        changed = true;
      });
    });

    if (!changed) return null;
    // حد عملي يمنع تضخم التخزين المحلي، مع الإبقاء على أحدث قيود الحذف.
    if (archive.length > 4000) archive.splice(0, archive.length - 4000);
    const newValue = JSON.stringify(archive);
    const violation = quotaViolation(archiveKey, oldArchiveRaw, newValue);
    if (violation) { const error = new Error(violation); error.code = 'CASHTOP_PLAN_LIMIT'; throw error; }
    return {
      key: archiveKey,
      ns: archiveNs,
      oldValue: oldArchiveRaw,
      newValue,
      metaNs: metaKey(archiveKey),
      oldMeta: rawGet(metaKey(archiveKey))
    };
  }

  function atomicSetItems(changes, options = {}) {
    const source = changes && typeof changes === 'object' ? changes : {};
    const entries = [];
    Object.entries(source).forEach(([key, value]) => {
      if (!isManagedKey(key)) return;
      const canonical = canonicalKey(key);
      assertFinancialGroupWritable(canonical);
      const ns = namespaceKey(canonical);
      const oldValue = rawGet(ns);
      const inputValue = typeof value === 'string' ? value : JSON.stringify(value);
      const newValue = transformManagedWrite(canonical, oldValue, inputValue);
      if (oldValue === newValue) return;
      const violation = quotaViolation(canonical, oldValue, newValue);
      if (violation) { const error = new Error(violation); error.code = 'CASHTOP_PLAN_LIMIT'; throw error; }
      entries.push({
        key: canonical, ns, oldValue, newValue,
        metaNs: metaKey(canonical), oldMeta: rawGet(metaKey(canonical))
      });
    });
    const genericReversalEntry = genericDeletionReversalArchiveEntry(entries);
    if (genericReversalEntry && !entries.some(entry => entry.key === genericReversalEntry.key)) entries.push(genericReversalEntry);
    if (!entries.length) return { changed: false, transactionId: null, keys: [] };

    const transactionId = crypto.randomUUID ? crypto.randomUUID() : `TX_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const txKey = `${atomicTransactionPrefix()}${transactionId}`;
    const queueBefore = rawGet(syncQueueKey());
    const now = Date.now();
    const journal = {
      id: transactionId,
      state: 'prepared',
      label: String(options.label || 'atomic-update'),
      createdAt: now,
      entries: entries.map(entry => ({ key: entry.key, ns: entry.ns, metaNs: entry.metaNs, oldValue: entry.oldValue, newValue: entry.newValue, oldMeta: entry.oldMeta }))
    };
    rawSet(txKey, JSON.stringify(journal));

    try {
      entries.forEach((entry, index) => {
        rawSet(entry.ns, entry.newValue);
        const previousMeta = safeJson(entry.oldMeta, {}) || {};
        const managedChange = describeManagedChange(entry.oldValue, entry.newValue);
        rawSet(entry.metaNs, JSON.stringify({
          ...previousMeta,
          updatedAt: now + index,
          revision: Number(previousMeta.revision || 0) + 1,
          deviceId: getDeviceId(),
          page: FILE,
          transactionId,
          transactionLabel: journal.label,
          recordTombstones: LOSSLESS_RECORD_DATASETS.has(entry.key)
            ? mergeRecordTombstones(previousMeta.recordTombstones, managedChange)
            : previousMeta.recordTombstones
        }));
      });
      rawSet(txKey, JSON.stringify({ ...journal, state: 'data-written', writtenAt: Date.now() }));
      const operationIds = {};
      // احفظ دلتا كل مجموعة داخل الطابور. هذا يمنع جهاز الموظف من استبدال
      // مجموعة كاملة عند وجود تعديل متزامن من المدير أو موظف آخر.
      entries.forEach(entry => {
        operationIds[entry.key] = enqueueSyncOperation(entry.key, {
          ...describeManagedChange(entry.oldValue, entry.newValue),
          deletedDataset: false
        });
      });
      rawSet(txKey, JSON.stringify({ ...journal, state: 'committed', committedAt: Date.now() }));
      entries.forEach(entry => {
        try { if (options.audit !== false) appendAudit(entry.key, entry.oldValue, entry.newValue, options.action); } catch (_) {}
      });
      rawRemove(txKey);
      entries.forEach(entry => emitDataChange(entry.key, entry.oldValue, entry.newValue, 'local-transaction', operationIds[entry.key]));
      const deletedKeys = entries.filter(entry => {
        const change = describeManagedChange(entry.oldValue, entry.newValue);
        return (change.deletedIds || []).length > 0 ||
          (change.deletedFields || []).length > 0 ||
          Object.values(change.nestedArrayChanges || {}).some(delta => (delta?.deletedIds || []).length > 0);
      }).map(entry => entry.key);
      if (deletedKeys.length) {
        // الحذف لا ينتظر دورة debounce عادية: ابدأ الرفع فوراً مع بقاء
        // الطابور الدائم كشبكة أمان للعمل Offline أو عند انقطاع الاتصال.
        window.dispatchEvent(new CustomEvent('cashtop:sync-now', {
          detail: { reason: 'delete-transaction', keys: deletedKeys, transactionId }
        }));
      }
      window.dispatchEvent(new CustomEvent('cashtop:transaction-committed', { detail: { transactionId, keys: entries.map(entry => entry.key), label: journal.label } }));
      return { changed: true, transactionId, keys: entries.map(entry => entry.key) };
    } catch (error) {
      entries.forEach(entry => {
        if (entry.oldValue == null) rawRemove(entry.ns); else rawSet(entry.ns, entry.oldValue);
        if (entry.oldMeta == null) rawRemove(entry.metaNs); else rawSet(entry.metaNs, entry.oldMeta);
      });
      if (queueBefore == null) rawRemove(syncQueueKey()); else rawSet(syncQueueKey(), queueBefore);
      rawRemove(txKey);
      throw error;
    }
  }

  function recoverAtomicTransactions() {
    const prefix = atomicTransactionPrefix();
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = RAW.key.call(localStorage, i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach(txKey => {
      const tx = safeJson(rawGet(txKey), null);
      if (!tx || !Array.isArray(tx.entries)) { rawRemove(txKey); return; }
      try {
        /* Roll forward: after a crash, completing every dataset is safer than
           leaving invoice/stock/account data partially applied. */
        tx.entries.forEach((entry, index) => {
          if (!entry?.ns || !entry?.key) return;
          rawSet(entry.ns, entry.newValue);
          const previousMeta = safeJson(entry.oldMeta, {}) || {};
          rawSet(entry.metaNs || metaKey(entry.key), JSON.stringify({
            updatedAt: Date.now() + index,
            revision: Number(previousMeta.revision || 0) + 1,
            deviceId: getDeviceId(), page: FILE,
            transactionId: tx.id || '', recovered: true
          }));
          enqueueSyncOperation(entry.key);
        });
      } catch (error) {
        console.error('[CASH TOP 2] atomic transaction recovery:', error);
        return;
      }
      rawRemove(txKey);
    });
  }

  function installGlobalPerformanceGuards() {
    /* Browser-level lazy painting for every record table, including pages that
       still use their legacy render functions. */
    const style = document.createElement('style');
    style.id = 'ctPerformanceGuards';
    style.textContent = '[hidden]{display:none!important}tbody tr{content-visibility:auto;contain-intrinsic-size:auto 44px}.product-item-card,.category-card{content-visibility:auto;contain-intrinsic-size:auto 150px;contain:layout paint style}.ct-lazy-table-sentinel,.ct-virtual-spacer,.ct-virtual-window-sentinel{content-visibility:visible!important;contain:none!important}html{scroll-behavior:auto}body{overscroll-behavior-y:contain}.ct-sidebar,.ct-topbar,.ct-bottom-nav,.modal-box,.modal-content,.ct-select-popover{transform:translate3d(0,0,0);backface-visibility:hidden;will-change:transform,opacity;contain:layout style}button,a,input,select,textarea{touch-action:manipulation}@media(prefers-reduced-motion:no-preference){.modal-box,.modal-content,.ct-select-popover,.product-item-card,.category-card{transition-property:transform,opacity,box-shadow,border-color!important;transition-duration:100ms!important}}';
    document.head.appendChild(style);

    // Normalize legacy field captions without rewriting every page template. The
    // class is applied only when a group has a direct label and a real control.
    const markFloatingLabels = (scope = document) => {
      const candidates = [
        ...(scope?.matches?.('.form-group,.ct-form-group,.invoice-report-field') ? [scope] : []),
        ...(scope?.querySelectorAll?.('.form-group,.ct-form-group,.invoice-report-field') || [])
      ];
      candidates.forEach(group => {
        const label = [...group.children].find(child => child.tagName === 'LABEL');
        if (!label) return;
        const control = group.querySelector(':scope > input,:scope > select,:scope > textarea,:scope > .form-control,:scope > .ct-input,:scope > .autocomplete,:scope > .input-with-btn');
        if (control) group.classList.add('ct-floating-label');
      });
    };
    markFloatingLabels(document);
    if (!document.documentElement.dataset.ctFloatingObserver) {
      document.documentElement.dataset.ctFloatingObserver = '1';
      const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
        if (node?.nodeType === 1) markFloatingLabels(node);
      })));
      observer.observe(document.body, { childList:true, subtree:true });
    }

    /* Convert common inline search handlers to a 300ms debounced listener. */
    document.querySelectorAll('input[type="text"],input[type="search"],input:not([type])').forEach(input => {
      const attr = input.getAttribute('oninput') || '';
      const match = attr.trim().match(/^([A-Za-z_$][\w$]*)\(\)\s*;?$/);
      if (!match) return;
      const searchSignature = [input.id, input.name, input.className, input.getAttribute('placeholder')].join(' ');
      if (!/filter|search/i.test(match[1]) && !/search|بحث|ابحث/i.test(searchSignature)) return;
      const fnName = match[1];
      const fn = window[fnName];
      if (typeof fn !== 'function') return;
      input.removeAttribute('oninput');
      input.addEventListener('input', debounce(() => window[fnName]?.(), 120));
      input.dataset.ctDebounced = 'true';
    });

    // Prime likely next pages from Service Worker Cache Storage before the click.
    // This remains cache-first even while online and only warms same-origin HTML.
    if (document.documentElement.dataset.ctNavWarmup !== '1') {
      document.documentElement.dataset.ctNavWarmup = '1';
      const warmed = new Set();
      const warmAnchor = anchor => {
        if (!anchor?.href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
        let url;
        try { url = new URL(anchor.href, location.href); } catch (_) { return; }
        if (url.origin !== location.origin || !/\.html$/i.test(url.pathname) || url.href === location.href || warmed.has(url.href)) return;
        warmed.add(url.href);
        fetch(url.href, { method:'GET', credentials:'same-origin', cache:'force-cache', priority:'low' }).catch(() => null);
      };
      document.addEventListener('pointerover', event => warmAnchor(event.target?.closest?.('a[href]')), { passive:true });
      document.addEventListener('focusin', event => warmAnchor(event.target?.closest?.('a[href]')), { passive:true });
      document.addEventListener('touchstart', event => warmAnchor(event.target?.closest?.('a[href]')), { passive:true, capture:true });
      const idle = window.requestIdleCallback || (fn => setTimeout(fn, 250));
      idle(() => [...document.querySelectorAll('.ct-sidebar a[href], nav a[href]')].slice(0, 10).forEach(warmAnchor));
    }
  }

  function financialGroupWriteError() {
    const group = getCurrentFinancialGroup();
    return `المجموعة [${group?.name || 'المحددة'}] مغلقة للقراءة فقط. انتقل إلى المجموعة المفتوحة لإضافة أو تعديل البيانات.`;
  }
  function assertFinancialGroupWritable(key) {
    const canonical = canonicalKey(key);
    if (!FINANCIAL_GROUP_SCOPED_KEYS.has(canonical) || !isFinancialGroupReadOnly()) return true;
    const message = financialGroupWriteError();
    showToast(message, 'error', 5200);
    const error = new Error(message);
    error.code = 'CASHTOP_FINANCIAL_GROUP_READ_ONLY';
    throw error;
  }

  function patchStorage() {
    if (window.__CASHTOP_STORAGE_PATCHED__) return;
    window.__CASHTOP_STORAGE_PATCHED__ = true;

    Storage.prototype.getItem = function (key) {
      if (this !== localStorage || !isManagedKey(key)) return RAW.get.call(this, key);
      const canonical = canonicalKey(key);
      return transformManagedRead(canonical, migrateLegacyValue(canonical));
    };

    Storage.prototype.setItem = function (key, value) {
      if (this !== localStorage || !isManagedKey(key)) return RAW.set.call(this, key, value);
      const canonical = canonicalKey(key);
      assertFinancialGroupWritable(canonical);
      const ns = namespaceKey(canonical);
      const oldValue = rawGet(ns);
      const stringValue = transformManagedWrite(canonical, oldValue, value);
      if (oldValue === stringValue) return;
      const violation = quotaViolation(canonical, oldValue, stringValue);
      if (violation) {
        showToast(violation, 'error', 5200);
        const error = new Error(violation); error.code = 'CASHTOP_PLAN_LIMIT'; throw error;
      }
      const genericReversalEntry = genericDeletionReversalArchiveEntry([{ key: canonical, ns, oldValue, newValue: stringValue }]);
      const managedChange = describeManagedChange(oldValue, stringValue);
      rawSet(ns, stringValue);
      if (genericReversalEntry) rawSet(genericReversalEntry.ns, genericReversalEntry.newValue);
      const previousMeta = safeJson(rawGet(metaKey(canonical)), {}) || {};
      rawSet(metaKey(canonical), JSON.stringify({
        ...previousMeta,
        updatedAt: Date.now(), revision: Number(previousMeta.revision || 0) + 1,
        deviceId: getDeviceId(), page: FILE,
        recordTombstones: LOSSLESS_RECORD_DATASETS.has(canonical)
          ? mergeRecordTombstones(previousMeta.recordTombstones, managedChange)
          : previousMeta.recordTombstones
      }));
      appendAudit(canonical, oldValue, stringValue);
      const operationId = enqueueSyncOperation(canonical, { ...managedChange, deletedDataset: false });
      emitDataChange(canonical, oldValue, stringValue, 'local', operationId);
      if (genericReversalEntry) {
        const archiveMeta = safeJson(genericReversalEntry.oldMeta, {}) || {};
        rawSet(genericReversalEntry.metaNs, JSON.stringify({ updatedAt: Date.now(), revision: Number(archiveMeta.revision || 0) + 1, deviceId: getDeviceId(), page: FILE, transactionLabel: 'auto-delete-reversal' }));
        try { appendAudit(genericReversalEntry.key, genericReversalEntry.oldValue, genericReversalEntry.newValue, 'auto-delete-reversal'); } catch (_) {}
        const archiveOp = enqueueSyncOperation(genericReversalEntry.key, { ...describeManagedChange(genericReversalEntry.oldValue, genericReversalEntry.newValue), deletedDataset: false });
        emitDataChange(genericReversalEntry.key, genericReversalEntry.oldValue, genericReversalEntry.newValue, 'local', archiveOp);
      }
    };

    Storage.prototype.removeItem = function (key) {
      if (this !== localStorage || !isManagedKey(key)) return RAW.remove.call(this, key);
      const canonical = canonicalKey(key);
      assertFinancialGroupWritable(canonical);
      const ns = namespaceKey(canonical);
      const oldValue = rawGet(ns);
      if (canonical === 'cashtop_products' || BRANCH_SCOPED_ARRAY_KEYS.has(canonical) || BRANCH_SCOPED_OBJECT_KEYS.has(canonical)) {
        this.setItem(canonical, canonical === 'cashtop_funds_db' ? JSON.stringify({accounts:[],accountLogs:[]}) : '[]');
        return;
      }
      rawRemove(ns); rawRemove(metaKey(canonical));
      appendAudit(canonical, oldValue, null, 'delete');
      const operationId = enqueueSyncOperation(canonical, { ...describeManagedChange(oldValue, null), deletedDataset: true });
      emitDataChange(canonical, oldValue, null, 'local', operationId);
    };
  }

  function seedCompanyStorage() {
    DATA_KEYS.forEach(key => {
      const canonical = canonicalKey(key);
      const ns = namespaceKey(canonical);
      if (rawGet(ns) === null) {
        const value = Object.prototype.hasOwnProperty.call(NON_ARRAY_DEFAULTS, canonical)
          ? NON_ARRAY_DEFAULTS[canonical]
          : [];
        rawSet(ns, JSON.stringify(value));
        rawSet(metaKey(canonical), JSON.stringify({ updatedAt: 0, revision: 0, seeded: true }));
      }
    });
  }

  const DEFAULT_MAIN_BRANCH_NAME = 'الفرع الرئيسي';
  const DEFAULT_CASH_ACCOUNT_NAME = 'صندوق الكاش';

  function ensureSystemDefaults() {
    // الفرع الرئيسي سجل شركة واحد ثابت. نحافظ على نفس الفرع الرئيسي القديم إن وجد
    // ونضعه أول القائمة حتى يبقى MAIN متوافقاً مع كل الصفحات القديمة والجديدة.
    let branches = normalizeArrayValue(safeJson(localStorage.getItem('cashtop_branches'), []), []);
    let main = branches.find(item => item && item.isMain === true) || branches[0] || null;
    let branchesChanged = false;
    if (!main) {
      main = {
        id: 'BR-01', name: DEFAULT_MAIN_BRANCH_NAME, address: '',
        manager: '', managerUsername: '', managerPassword: '', managerActive: false,
        status: 'نشط', allowTransfer: false, isMain: true, isDefault: true, locked: true
      };
      branches = [main];
      branchesChanged = true;
    } else {
      const originalIndex = branches.indexOf(main);
      if (originalIndex > 0) {
        branches.splice(originalIndex, 1);
        branches.unshift(main);
        branchesChanged = true;
      }
      branches.forEach((branch, index) => {
        const shouldBeMain = index === 0;
        if (Boolean(branch.isMain) !== shouldBeMain) { branch.isMain = shouldBeMain; branchesChanged = true; }
      });
      if (main.name !== DEFAULT_MAIN_BRANCH_NAME) { main.name = DEFAULT_MAIN_BRANCH_NAME; branchesChanged = true; }
      if (main.status !== 'نشط') { main.status = 'نشط'; branchesChanged = true; }
      if (main.isDefault !== true) { main.isDefault = true; branchesChanged = true; }
      if (main.locked !== true) { main.locked = true; branchesChanged = true; }
    }
    if (branchesChanged) {
      const branchMeta = safeJson(rawGet(metaKey('cashtop_branches')), {}) || {};
      if (branchMeta.seeded === true || Number(branchMeta.updatedAt || 0) <= 0) {
        // On a brand-new laptop this is only a local placeholder. Do NOT queue it
        // before Turso gets a chance to hydrate the real branch dataset; otherwise
        // a fresh device could overwrite existing cloud branches with BR-01.
        rawSet(namespaceKey('cashtop_branches'), JSON.stringify(branches));
        rawSet(metaKey('cashtop_branches'), JSON.stringify({ updatedAt: 0, revision: 0, seeded: true }));
      } else {
        localStorage.setItem('cashtop_branches', JSON.stringify(branches));
      }
    }

    // بيانات المجموعة المغلقة تاريخية وغير قابلة للتغيير حتى بواسطة
    // تهيئة النظام التلقائية. إنشاء/تصحيح الصندوق الافتراضي يتم فقط في المجموعة المفتوحة.
    if (!isFinancialGroupReadOnly()) {
      // كل فرع يملك قاعدة صناديق مستقلة. لذلك نضمن صندوق كاش ثابتاً للفرع الحالي.
      const funds = safeJson(localStorage.getItem('cashtop_funds_db'), {}) || {};
      funds.accounts = normalizeArrayValue(funds.accounts || [], []);
      funds.accountLogs = normalizeArrayValue(funds.accountLogs || [], []);
      let defaultCash = funds.accounts.find(account => account?.isDefaultCash === true)
        || funds.accounts.find(account => ['صندوق الكاش', 'صندوق الكاش الرئيسي'].includes(String(account?.name || '').trim()));
      let fundsChanged = false;
      if (!defaultCash) {
        defaultCash = {
          id: 1000000001, name: DEFAULT_CASH_ACCOUNT_NAME, type: 'كاش', balance: 0,
          notes: 'الصندوق الافتراضي للنظام', isDefaultCash: true, locked: true
        };
        // تجنب أي تعارض نادر مع رقم قديم.
        while (funds.accounts.some(account => String(account?.id) === String(defaultCash.id))) defaultCash.id += 1;
        funds.accounts.unshift(defaultCash);
        fundsChanged = true;
      } else {
        if (defaultCash.name !== DEFAULT_CASH_ACCOUNT_NAME) { defaultCash.name = DEFAULT_CASH_ACCOUNT_NAME; fundsChanged = true; }
        if (defaultCash.type !== 'كاش') { defaultCash.type = 'كاش'; fundsChanged = true; }
        if (defaultCash.isDefaultCash !== true) { defaultCash.isDefaultCash = true; fundsChanged = true; }
        if (defaultCash.locked !== true) { defaultCash.locked = true; fundsChanged = true; }
      }
      if (fundsChanged) {
        const fundsMeta = safeJson(rawGet(metaKey('cashtop_funds_db')), {}) || {};
        if (fundsMeta.seeded === true || Number(fundsMeta.updatedAt || 0) <= 0) {
          // Same rule for the default cash box: keep it as a seeded local fallback
          // until remote bootstrap finishes. The first real cash mutation will turn
          // it into a normal queued dataset automatically.
          rawSet(namespaceKey('cashtop_funds_db'), JSON.stringify(funds));
          rawSet(metaKey('cashtop_funds_db'), JSON.stringify({ updatedAt: 0, revision: 0, seeded: true }));
        } else {
          localStorage.setItem('cashtop_funds_db', JSON.stringify(funds));
        }
      }

    }

    // اجعل جلسة مدير الشركة تشير صراحةً إلى الفرع الرئيسي كي لا يظهر "فرع غير معروف".
    const session = getSession();
    if (session && isCompanyAdminRole(session.role)) {
      const next = { ...session, branchId: 'MAIN', dataBranchId: 'MAIN', branchRecordId: main.id, branchName: DEFAULT_MAIN_BRANCH_NAME };
      if (JSON.stringify(next) !== JSON.stringify(session)) persistSession(next);
    }
  }


  const DATA_RESET_VERSION = 'original-zero-embedded-v1';

  function resetCompanyDataOnce() {
    const companyId = companyIdFromSession();
    const marker = `ct_data_reset::${encodeURIComponent(companyId)}::${DATA_RESET_VERSION}`;
    if (rawGet(marker) === 'done') return;

    const canonicalKeys = Array.from(new Set(DATA_KEYS.map(canonicalKey)));
    canonicalKeys.forEach(key => {
      rawRemove(namespaceKey(key, companyId));
      rawRemove(metaKey(key, companyId));
      rawRemove(key);
      Object.keys(ALIASES).filter(alias => ALIASES[alias] === key).forEach(rawRemove);
    });

    // Clear old company namespaces from earlier builds for this company only.
    const encoded = encodeURIComponent(companyId);
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = RAW.key.call(localStorage, i);
      if (key && (key.startsWith(`cashtop_data::${encoded}::`) || key.startsWith(`cashtop_meta::${encoded}::`))) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(rawRemove);
    rawSet(marker, 'done');
  }

  function normalizeAdminRecords(value, signatureKeys = []) {
    let parsed = value;
    for (let i = 0; i < 3 && typeof parsed === 'string'; i += 1) {
      const decoded = safeJson(parsed, null);
      if (decoded === null) break;
      parsed = decoded;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        Object.prototype.hasOwnProperty.call(parsed, 'value') &&
        (parsed.valueEncoding || Object.prototype.hasOwnProperty.call(parsed, 'deleted') || Object.prototype.hasOwnProperty.call(parsed, 'updatedAt'))) {
      if (parsed.deleted === true) return [];
      return normalizeAdminRecords(parsed.value, signatureKeys);
    }
    if (Array.isArray(parsed)) return parsed.filter(item => item && typeof item === 'object');
    if (parsed && typeof parsed === 'object') {
      if (signatureKeys.some(key => Object.prototype.hasOwnProperty.call(parsed, key))) return [parsed];
      return Object.entries(parsed).map(([key, item]) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        return item.id == null && !/^\d+$/.test(key) ? { ...item, id: key } : item;
      }).filter(Boolean);
    }
    return [];
  }

  function bootstrapCompanyAccess() {
    const session = getSession() || {};
    const role = String(session.role || '').toLowerCase();
    if (!['admin', 'owner', 'company-admin'].includes(role)) return;

    const current = safeJson(localStorage.getItem('cashtop_company_access'), {}) || {};
    const licenses = normalizeAdminRecords(rawGet('cashtop_admin_licenses'), ['key', 'tenantId', 'companyId', 'companyName', 'plan', 'status']);
    const users = normalizeAdminRecords(rawGet('cashtop_admin_users'), ['username', 'companyKey', 'tenantId', 'companyId', 'role']);
    const companyKey = String(session.companyKey || current.companyKey || '').trim().toUpperCase();
    const license = licenses.find(item => String(item.key || '').trim().toUpperCase() === companyKey) || {};
    const localUser = users.find(item =>
      String(item.companyKey || '').trim().toUpperCase() === companyKey &&
      String(item.username || '').toLowerCase() === String(session.username || '').toLowerCase()
    ) || {};

    const manager = {
      ...(current.manager || {}),
      id: session.uid || localUser.id || current.manager?.id || `ADMIN_${Date.now()}`,
      username: session.username || localUser.username || current.manager?.username || 'admin',
      displayName: session.displayName || localUser.displayName || current.manager?.displayName || 'مدير الشركة',
      role: 'admin',
      active: localUser.active !== false && current.manager?.active !== false
    };
    // لا نستبدل كلمة مرور سحابية موجودة بقيمة فارغة.
    if (localUser.password) manager.password = localUser.password;

    const comparableCurrent = { ...current };
    delete comparableCurrent.updatedAt;
    const comparableNext = {
      ...comparableCurrent,
      companyKey: companyKey || current.companyKey || '',
      tenantId: session.tenantId || session.companyId || license.tenantId || license.companyId || current.tenantId || current.companyId || '',
      companyId: session.tenantId || session.companyId || license.tenantId || license.companyId || current.tenantId || current.companyId || '',
      companyName: session.companyName || license.companyName || current.companyName || '',
      status: license.status || current.status || 'active',
      plan: license.plan || session.plan || current.plan || 'pro',
      customLimits: license.customLimits || session.customLimits || current.customLimits || null,
      startAt: license.startAt || current.startAt || '',
      endAt: license.endAt || session.licenseEnd || current.endAt || '',
      manager
    };
    if (JSON.stringify(comparableCurrent) !== JSON.stringify(comparableNext)) {
      localStorage.setItem('cashtop_company_access', JSON.stringify({ ...comparableNext, updatedAt: Date.now() }));
    }
  }

  function branchRecordIsActive(branch) {
    if (!branch || typeof branch !== 'object') return false;
    if (branch.isMain === true) return true;
    if (branch.disabled === true || branch.active === false) return false;
    return !['inactive','disabled','blocked','مجمد','معطل','موقوف'].includes(String(branch.status || '').trim().toLowerCase());
  }

  function resolveSessionBranch(branches, branchRef) {
    const list = normalizeArrayValue(branches, []);
    const main = list.find(item => item?.isMain === true) || list.find(item => String(item?.id || '').toUpperCase() === 'MAIN') || list[0] || null;
    const ref = String(branchRef ?? '').trim();
    if (!ref || ref.toUpperCase() === 'MAIN') return main || { id:'MAIN', name:DEFAULT_MAIN_BRANCH_NAME, status:'نشط', isMain:true };
    return list.find(item => String(item?.id) === ref) || list.find(item => String(item?.name || '').trim() === ref) || null;
  }

  function validateSessionLocal(session) {
    if (!session) return { ok: false, reason: 'missing' };
    const companyId = String(session.tenantId || session.companyId || session.companyKey || 'unassigned');
    const access = safeJson(rawGet(namespaceKey('cashtop_company_access', companyId)), {}) || {};
    const accessTenantId = String(access.tenantId || access.companyId || companyId);
    const sessionKey = String(session.companyKey || '').trim().toUpperCase();
    const accessKey = String(access.companyKey || '').trim().toUpperCase();
    if (Object.keys(access).length && accessTenantId !== companyId) return { ok: false, reason: 'tenant-mismatch' };
    if (sessionKey && accessKey && sessionKey !== accessKey) return { ok: false, reason: 'tenant-mismatch' };
    session.tenantId = companyId;
    session.companyId = companyId;
    if (access.status && access.status !== 'active') return { ok: false, reason: 'stopped' };
    if (access.deleted === true) return { ok: false, reason: 'deleted' };
    const accessEnd = access.endAt ? new Date(access.endAt).getTime() : 0;
    if (accessEnd && Number.isFinite(accessEnd) && trustedNowMs(session) >= accessEnd) return { ok: false, reason: 'expired' };
    if (session.status && session.status !== 'active') return { ok: false, reason: 'stopped' };
    const end = session.licenseEnd ? new Date(session.licenseEnd).getTime() : null;
    if (end && Number.isFinite(end) && trustedNowMs(session) >= end) return { ok: false, reason: 'expired' };

    session.companyName = access.companyName || session.companyName;
    session.status = access.status || session.status || 'active';
    session.licenseStart = access.startAt || session.licenseStart || '';
    session.licenseEnd = access.endAt || session.licenseEnd || '';
    session.plan = access.plan || session.plan || 'pro';
    session.customLimits = access.customLimits || session.customLimits || null;
    session.entitlementVersion = access.authVersion || access.updatedAt || session.entitlementVersion || 0;

    const role = String(session.role || '').toLowerCase();
    if (role === 'representative' || String(session.uid || '').startsWith('AG_')) {
      const agents = normalizeArrayValue(rawGet(namespaceKey('cashtop_sales_agents', companyId)), []);
      const agent = agents.find(item => String(item.id) === String(session.uid)) ||
        agents.find(item => String(item.username || '').toLowerCase() === String(session.username || '').toLowerCase());
      if (!agent || !branchRecordIsActive(agent) || agent.cashierAccess === false) return { ok: false, reason: 'user-disabled' };
      const branches = normalizeArrayValue(rawGet(namespaceKey('cashtop_branches', companyId)), []);
      const agentBranch = resolveSessionBranch(branches, agent.branchRecordId || agent.branchId || 'MAIN');
      const agentOnMain = !agent.branchId || String(agent.branchId).toUpperCase() === 'MAIN' || agentBranch?.isMain === true;
      if (!agentBranch || (!agentOnMain && !branchRecordIsActive(agentBranch))) return { ok: false, reason: 'user-disabled' };
      const defaults = {
        'pos.access': true, 'sales.create': true, 'sales.print': true, 'sales.image': true,
        'sales.discount': true, 'sales.credit': true, 'sales.hold': true, 'sales.clearCart': true
      };
      session.displayName = `${agent.name || agent.username || 'مندوب'} (مندوب)`;
      session.permissions = normalizePermissions({ ...defaults, ...(agent.permissions || {}) });
      session.branchRecordId = agentBranch.id || null;
      session.branchId = agentOnMain ? 'MAIN' : agentBranch.id;
      session.dataBranchId = session.branchId;
      session.branchName = agentBranch.name || agent.branchName || DEFAULT_MAIN_BRANCH_NAME;
      session.authVersion = agent.authVersion || agent.updatedAt || 0;
    } else if (role === 'employee' || String(session.uid || '').startsWith('EMP_')) {
      const employees = normalizeArrayValue(rawGet(namespaceKey('cashtop_employees', companyId)), []);
      const employee = employees.find(item => String(item.id) === String(session.uid)) ||
        employees.find(item => String(item.username || '').toLowerCase() === String(session.username || '').toLowerCase());
      if (!employee || !branchRecordIsActive(employee)) return { ok: false, reason: 'user-disabled' };
      session.displayName = employee.name || session.displayName;
      session.permissions = normalizePermissions(employee.permissions || {});
      const branches = normalizeArrayValue(rawGet(namespaceKey('cashtop_branches', companyId)), []);
      const employeeBranch = resolveSessionBranch(branches, employee.branchRecordId || employee.branchId || employee.dataBranchId || 'MAIN');
      const employeeOnMain = !employee.branchId || String(employee.branchId).toUpperCase() === 'MAIN' || employeeBranch?.isMain === true;
      if (!employeeBranch || (!employeeOnMain && !branchRecordIsActive(employeeBranch))) return { ok: false, reason: 'user-disabled' };
      session.branchRecordId = employeeBranch.id || null;
      session.branchId = employeeOnMain ? 'MAIN' : employeeBranch.id;
      session.dataBranchId = session.branchId;
      session.branchName = employeeBranch.name || employee.branchName || DEFAULT_MAIN_BRANCH_NAME;
      session.authVersion = employee.authVersion || employee.updatedAt || 0;
    } else if (['branch-admin', 'branch_manager', 'manager'].includes(role)) {
      const branches = normalizeArrayValue(rawGet(namespaceKey('cashtop_branches', companyId)), []);
      const lookup = session.branchRecordId || session.branchId;
      const branch = resolveSessionBranch(branches, lookup) ||
        branches.find(item => String(item.managerUsername || '').toLowerCase() === String(session.username || '').toLowerCase());
      if (!branch || (!branch.isMain && !branchRecordIsActive(branch)) || branch.managerActive === false || !branch.managerUsername) return { ok: false, reason: 'user-disabled' };
      session.branchRecordId = branch.id;
      session.branchId = branch.isMain === true ? 'MAIN' : branch.id;
      session.dataBranchId = session.branchId;
      session.branchName = branch.name || session.branchName;
      session.displayName = branch.manager || session.displayName;
      session.permissions = normalizePermissions(branch.managerPermissions || {});
      // توافق مع الإصدارات القديمة: مفتاح السماح بالنقل لمدير الفرع يفعّل صلاحية النقل الدقيقة.
      if (branch.allowTransfer === true) session.permissions['inventory.transfer'] = true;
      session.authVersion = branch.managerAuthVersion || branch.updatedAt || 0;
    } else if (isCompanyAdminRole(role)) {
      if (access.manager && (access.manager.active === false || (session.username && access.manager.username && String(access.manager.username).toLowerCase() !== String(session.username).toLowerCase()))) {
        return { ok: false, reason: 'user-disabled' };
      }
      session.branchId = 'MAIN'; session.dataBranchId = 'MAIN';
      session.permissions = session.permissions || {};
    }
    persistSession(session);
    return { ok: true, session };
  }

  function redirectToLogin(reason) {
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    const target = `صفحة تسجيل الدخول.html${params.toString() ? `?${params}` : ''}`;
    if (!location.pathname.endsWith(encodeURI('صفحة تسجيل الدخول.html'))) location.replace(target);
  }

  let logoutInProgress = false;
  async function logout(reason) {
    if (logoutInProgress) return;
    logoutInProgress = true;
    const logoutReason = reason || 'logout';
    const forcedLicenseLogout = ['expired','stopped','deleted','user-disabled','auth-required','device-limit','tenant-mismatch'].includes(String(logoutReason));
    // العمليات المعلقة تخص الشركة لا جلسة التبويب؛ نحفظ نسخة IndexedDB قبل
    // تسجيل الخروج حتى تبقى جاهزة للمزامنة عند الدخول مجدداً أو عودة الإنترنت.
    try { await backupSyncQueue(getSyncQueue()); } catch (_) {}
    try {
      if (window.CashtopTurso && typeof window.CashtopTurso.signOut === 'function') {
        await window.CashtopTurso.signOut();
      }
    } catch (_) { /* local session is still cleared */ }
    const companyId = companyIdFromSession();
    try {
      sessionStorage.removeItem(`ct_turso_state::${encodeURIComponent(companyId)}`);
      sessionStorage.removeItem(TAB_SESSION_KEY);
      // مفاتيح التصفح المؤقتة لا يجوز أن تبقي جلسة مصادقة حية بعد إيقاف المفتاح.
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const key = sessionStorage.key(i);
        if (key && /^(?:cashtop_tab_session_v2|ct_auth_|ct_turso_auth|ct_license_)/.test(key)) sessionStorage.removeItem(key);
      }
    } catch (_) {}
    try { rawRemove(PERSISTENT_SESSION_KEY); } catch (_) {}
    if (forcedLicenseLogout) {
      try { rawRemove('cashtop_remembered_key'); } catch (_) {}
    }
    // R126: لا نتحول لصفحة الدخول قبل أن تُحذف نسخة الجلسة المتينة من IndexedDB.
    // في الإصدارات السابقة كان التحويل السريع يسمح لصفحة الدخول أن تستعيد جلسة قديمة
    // من IndexedDB بعد أن تم حذف مرآتها فقط من localStorage.
    try { await flushDurableLocalWrites(); } catch (_) {}
    try { await deleteDurableLocalKey(PERSISTENT_SESSION_KEY); } catch (_) {}
    if (forcedLicenseLogout) {
      try { await deleteDurableLocalKey('cashtop_remembered_key'); } catch (_) {}
    }
    try {
      Storage.prototype.removeItem.call(localStorage, PERSISTENT_SESSION_KEY);
      if (forcedLicenseLogout) Storage.prototype.removeItem.call(localStorage, 'cashtop_remembered_key');
    } catch (_) {}
    try {
      if (String(window.name || '').startsWith(WINDOW_SESSION_PREFIX)) window.name = '';
    } catch (_) {}
    if (forcedLicenseLogout) {
      try { channel?.postMessage?.({ type:'license-invalidated', reason:logoutReason, companyId, at:Date.now() }); } catch (_) {}
    }
    redirectToLogin(logoutReason);
  }

  function ensureAuthenticated() {
    if (!IS_APP_PAGE) return true;
    const result = validateSessionLocal(getSession());
    if (!result.ok) {
      redirectToLogin(result.reason);
      return false;
    }
    return true;
  }

  function isStandaloneDisplayMode() {
    return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  }

  function normalizeViewportMeta() {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';
  }

  function syncInstalledViewportMetrics() {
    const viewport = window.visualViewport;
    const height = Math.max(320, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0));
    if (height) document.documentElement.style.setProperty('--ct-visual-viewport-height', `${height}px`);
  }

  async function keepPortraitOrientation() {
    if (!isStandaloneDisplayMode() || !screen.orientation || typeof screen.orientation.lock !== 'function') return false;
    try {
      await screen.orientation.lock('portrait');
      return true;
    } catch (_) {
      return false;
    }
  }

  function installViewportGuards() {
    normalizeViewportMeta();
    const refresh = () => {
      syncInstalledViewportMetrics();
      requestAnimationFrame(syncInstalledViewportMetrics);
      setTimeout(syncInstalledViewportMetrics, 80);
      setTimeout(syncInstalledViewportMetrics, 320);
    };
    refresh();
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('pageshow', refresh, { passive: true });
    window.addEventListener('orientationchange', () => { refresh(); keepPortraitOrientation(); }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); keepPortraitOrientation(); } }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', refresh, { passive: true });
    }
    keepPortraitOrientation();
  }

  function addCoreAssets() {
    document.documentElement.classList.add('ct-app-page', 'ct-shell-ready');
    installViewportGuards();
    if (!document.querySelector('link[href="cashtop-core.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'cashtop-core.css';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = 'manifest.webmanifest';
      document.head.appendChild(manifest);
    }
    const theme = document.querySelector('meta[name="theme-color"]') || document.createElement('meta');
    theme.name = 'theme-color';
    theme.content = '#605ca8';
    if (!theme.parentNode) document.head.appendChild(theme);
    let favicon = document.querySelector('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = 'icon-192.png';
    if (FILE === 'cashier.html') document.documentElement.classList.add('ct-cashier-page');
  }

  const PAGE_TITLES = {
    'لوحة التحكم.html': 'لوحة التحكم', 'cashier.html': 'نقطة البيع والكاشير',
    'products.html': 'المنتجات والمخزون', 'categories.html': 'إدارة التصنيفات', 'materials.html': 'الأصناف الخام', 'invoices.html': 'فواتير المبيعات',
    'المشتريات.html': 'فواتير المشتريات', 'مرجع المبيعات.html': 'مرتجع المبيعات', 'مرجع المشتريات.html': 'مرتجع المشتريات',
    'customers.html': 'العملاء', 'customer-groups.html': 'مجموعات العملاء',
    'suppliers.html': 'الموردون', 'accounts.html': 'الحسابات والصناديق', 'financial-groups.html': 'المجموعات المالية',
    'sands.html': 'سندات القبض والصرف', 'journal.html': 'دفتر الأستاذ العام', 'المصاريف.html': 'المصاريف',
    'warehouses.html': 'المخازن', 'branches.html': 'الفروع', 'units.html': 'الوحدات',
    'shortages.html': 'نواقص المخزون', 'barcode-generator.html': 'مولد الباركود',
    'المناديب.html': 'المناديب', 'الموظفين.html': 'الموظفون',
    'العمال والاجور.html': 'العمال والأجور', 'التقارير.html': 'التقارير',
    'setting.html': 'إعدادات النظام', 'printer-settings.html': 'إعدادات الطابعة',
    'sales-offers.html': 'عروض المبيعات',
    'notifications.html': 'الإشعارات',
    'tax-settings.html': 'إعدادات الضريبة',
    'storage-settings.html': 'إدارة التخزين والأرشفة',
    'ادارة التصنيع.html': 'إدارة التصنيع', 'استيراد وتصدير ل كل قسم.html': 'النسخ الاحتياطي والاستعادة'
  };

  function mountShell() {
    const body = document.body;
    if (!body) return;
    // R106 login sync gate uses the full authenticated data/bootstrap runtime
    // but intentionally has no application shell while the initial merge runs.
    if (FILE === 'sync.html') {
      document.documentElement.classList.add('ct-sync-gate-ready');
      return;
    }
    const host = document.getElementById('ctPageHost');
    const shell = document.querySelector('.ct-app-shell');
    if (!host || !shell) {
      console.error('[CASH TOP] الهيكل المدمج غير موجود داخل الصفحة:', FILE);
      return;
    }
    document.documentElement.classList.add('ct-shell-ready');
    hydrateShell();
  }

  function ensureBottomNavigation() {
    document.querySelectorAll('.ct-bottom-nav').forEach(nav => {
      nav.innerHTML = `
        <a href="لوحة التحكم.html"><i class="fa-solid fa-house"></i><span>الرئيسية</span></a>
        <a href="cashier.html"><i class="fa-solid fa-cash-register"></i><span>الكاشير</span></a>
        <a href="products.html"><i class="fa-solid fa-box-open"></i><span>المنتجات</span></a>
        <a href="customers.html"><i class="fa-solid fa-users"></i><span>العملاء</span></a>
        <a href="invoices.html"><i class="fa-solid fa-file-invoice"></i><span>الفواتير</span></a>`;
    });
  }

  function rebuildSidebarMenu() {
    const nav = document.querySelector('.ct-sidebar-nav');
    if (!nav) return;
    const backupLink = (section) => [`استيراد وتصدير ل كل قسم.html?section=${encodeURIComponent(section)}`, 'نسخ واستيراد القسم'];
    const groups = [
      ['fa-house','الرئيسية', [['لوحة التحكم.html','لوحة التحكم']]],
      ['fa-cash-register','المبيعات', [['cashier.html','الكاشير'],['invoices.html','فواتير المبيعات'],['مرجع المبيعات.html','مرتجع المبيعات'],['sales-offers.html','عروض المبيعات'],backupLink('sales')]],
      ['fa-cart-shopping','المشتريات', [['المشتريات.html','فواتير المشتريات'],['مرجع المشتريات.html','مرتجع المشتريات'],['suppliers.html','الموردون'],backupLink('purchases')]],
      ['fa-boxes-stacked','المخزون والفروع', [['products.html','المنتجات'],['categories.html','التصنيفات'],['materials.html','الأصناف'],['warehouses.html','المخازن'],['branches.html','الفروع'],['units.html','الوحدات'],['shortages.html','النواقص'],['barcode-generator.html','الباركود'],backupLink('inventory')]],
      ['fa-industry','التصنيع', [['ادارة التصنيع.html','إدارة التصنيع'],backupLink('manufacturing')]],
      ['fa-handshake','العملاء والعلاقات', [['customers.html','العملاء'],['customer-groups.html','مجموعات العملاء'],['المناديب.html','المناديب'],backupLink('relationships')]],
      ['fa-calculator','المالية والمحاسبة', [['accounts.html','الصناديق والحسابات'],['financial-groups.html','المجموعات المالية'],['sands.html','سندات القبض والصرف'],['journal.html','دفتر الأستاذ'],['المصاريف.html','المصاريف'],backupLink('finance')]],
      ['fa-users-gear','الموارد البشرية', [['الموظفين.html','الموظفون'],['العمال والاجور.html','العمال والأجور'],backupLink('hr')]],
      ['fa-chart-line','التقارير والمتابعة', [['التقارير.html','التقارير'],['notifications.html','الإشعارات'],backupLink('reports')]],
      ['fa-gears','النظام والإعدادات', [['tax-settings.html','إعدادات الضريبة'],['storage-settings.html','التخزين والأرشفة'],['استيراد وتصدير ل كل قسم.html','النسخ الاحتياطي الشامل'],['setting.html','إعدادات النظام'],['printer-settings.html','إعدادات الطابعة'],backupLink('settings')]]
    ];
    nav.innerHTML = groups.map(([icon,title,links], index) => {
      if (index === 0) return links.map(([href,label]) => `<a class="ct-menu-link" href="${href}"><i class="fa-solid ${icon}"></i><span>${label}</span></a>`).join('');
      return `<details class="ct-menu-group"><summary><i class="fa-solid ${icon}"></i><span>${title}</span><i class="fa-solid fa-chevron-down ct-menu-arrow"></i></summary><div class="ct-submenu">${links.map(([href,label])=>`<a href="${href}">${label}</a>`).join('')}</div></details>`;
    }).join('');
    nav.querySelectorAll('.ct-menu-group').forEach(group => group.addEventListener('toggle', () => {
      if (!group.open) return;
      nav.querySelectorAll('.ct-menu-group[open]').forEach(other => { if (other !== group) other.open = false; });
    }));
  }

  function linkedPageInfo(link) {
    try {
      const url = new URL(link.getAttribute('href') || '', location.href);
      return {
        file: decodeURIComponent(url.pathname.split('/').pop() || ''),
        section: url.searchParams.get('section') || ''
      };
    } catch (_) {
      const href = decodeURIComponent((link.getAttribute('href') || '').split('/').pop() || '');
      const [file, query = ''] = href.split('?');
      return { file, section: new URLSearchParams(query).get('section') || '' };
    }
  }

  function normalizeShellLabels() {
    document.querySelectorAll('.ct-sidebar-logout, .ct-logout-top').forEach(button => button.remove());
    rebuildSidebarMenu();
  }

  function restrictSettingsForBasicUser(session) {
    if (FILE !== 'setting.html' || isCompanyAdminRole(session?.role) || can('settings.system', session)) return;
    const host = document.getElementById('ctPageHost');
    if (!host || host.dataset.logoutOnly === 'true') return;
    host.dataset.logoutOnly = 'true';
    host.innerHTML = `<div style="max-width:560px;margin:45px auto;background:#fff;border-top:4px solid #605ca8;border-radius:12px;padding:24px;text-align:center;box-shadow:0 8px 25px rgba(15,23,42,.08)"><i class="fa-solid fa-mobile-screen-button" style="font-size:38px;color:#605ca8"></i><h2 style="font-size:18px;margin:14px 0 6px">التطبيق والحساب</h2><p style="font-size:12px;color:#64748b;line-height:1.8">هذا الحساب لا يملك صلاحية إعدادات الشركة. يمكنك تثبيت التطبيق على الجهاز أو تسجيل الخروج.</p><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px"><button type="button" data-ct-action="install-app" style="border:0;background:#605ca8;color:#fff;border-radius:8px;padding:12px 16px;font:800 12px Cairo;cursor:pointer"><i class="fa-solid fa-download"></i> تثبيت التطبيق</button><button type="button" data-ct-action="logout" style="border:0;background:#dd4b39;color:#fff;border-radius:8px;padding:12px 16px;font:800 12px Cairo;cursor:pointer"><i class="fa-solid fa-right-from-bracket"></i> تسجيل الخروج</button></div></div>`;
  }

  function firstAllowedPage(session = getSession()) {
    return Object.keys(PAGE_PERMISSIONS).find(file => permissionAllowed(PAGE_PERMISSIONS[file], session)) || 'setting.html';
  }

  function enforceCurrentPageAccess(session = getSession()) {
    if (FILE === 'setting.html') return true;
    const required = PAGE_PERMISSIONS[FILE];
    if (!required || permissionAllowed(required, session)) return true;
    const fallback = firstAllowedPage(session);
    if (fallback && fallback !== FILE) {
      location.replace(fallback);
      return false;
    }
    logout('permission-denied');
    return false;
  }

  function permissionAllowed(requirement, session = getSession()) {
    if (Array.isArray(requirement)) return requirement.some(permission => can(permission, session));
    return can(requirement, session);
  }

  function serializePermissionRequirement(requirement) {
    return Array.isArray(requirement) ? requirement.join(',') : String(requirement || '');
  }

  function readPermissionRequirement(element) {
    if (!element) return null;
    const any = element.dataset?.ctPermissionAny;
    if (any) return any.split(',').map(item => item.trim()).filter(Boolean);
    return element.dataset?.ctPermission || null;
  }


  /* ============================================================
   * Revision 53 — resilient modal drafts + instant broadcast popup
   * ============================================================ */
  function modalDraftStorageKey(modal) {
    const id = modal?.id || 'anonymous-modal';
    const session = getSession() || {};
    return `ct_modal_draft::${encodeURIComponent(companyIdFromSession())}::${encodeURIComponent(session.uid || session.username || 'user')}::${encodeURIComponent(FILE)}::${encodeURIComponent(id)}`;
  }

  function modalDraftRoot(node) {
    const element = node instanceof Element ? node : null;
    if (!element) return null;
    return element.closest('.modal-overlay') || element.closest('.ct-modal') || element.closest('.modal');
  }

  function modalIsOpen(modal) {
    if (!modal || !modal.isConnected) return false;
    if (modal.getAttribute('aria-hidden') === 'true') return false;
    if (modal.classList.contains('active') || modal.classList.contains('open') || modal.classList.contains('show')) return true;
    if (modal.style?.display && modal.style.display !== 'none') return true;
    try { return modal.getClientRects().length > 0 && getComputedStyle(modal).visibility !== 'hidden'; } catch (_) { return false; }
  }

  function modalControls(modal) {
    return [...(modal?.querySelectorAll?.('input,select,textarea') || [])].filter(control => {
      const type = String(control.type || '').toLowerCase();
      return !['file','password','submit','button','reset','image'].includes(type) && control.dataset.ctNoDraft !== 'true';
    });
  }

  function modalControlKey(control, index) {
    return control.id ? `id:${control.id}` : control.name ? `name:${control.name}` : `idx:${index}`;
  }

  function captureModalDraft(modal) {
    if (!modal || modal.dataset.ctNoDraft === 'true' || modal.dataset.ctDraftCancelled === 'true' || !modalIsOpen(modal)) return;
    const values = {};
    modalControls(modal).forEach((control, index) => {
      const key = modalControlKey(control, index);
      if (control.type === 'checkbox' || control.type === 'radio') values[key] = { checked: control.checked, value: control.value };
      else values[key] = { value: control.value };
    });
    rawSet(modalDraftStorageKey(modal), JSON.stringify({ savedAt: Date.now(), values }));
  }

  function restoreModalDraft(modal) {
    if (!modal || modal.dataset.ctNoDraft === 'true') return false;
    const draft = safeJson(rawGet(modalDraftStorageKey(modal)), null);
    if (!draft?.values) return false;
    let changed = false;
    modalControls(modal).forEach((control, index) => {
      const item = draft.values[modalControlKey(control, index)];
      if (!item) return;
      if (control.type === 'checkbox' || control.type === 'radio') control.checked = Boolean(item.checked);
      else if (item.value != null) control.value = item.value;
      changed = true;
      try { control.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    });
    return changed;
  }

  function clearModalDraft(modal) {
    if (!modal) return;
    rawRemove(modalDraftStorageKey(modal));
  }

  function markModalDraftSaveAttempt(modal) {
    if (!modal) return;
    modal.dataset.ctDraftSavePending = 'true';
    // Local saves in CASH TOP close immediately. If validation failed and the
    // dialog stayed open, cancel the pending-save marker so an accidental close
    // still preserves the draft as requested.
    setTimeout(() => {
      if (modalIsOpen(modal)) modal.dataset.ctDraftSavePending = 'false';
    }, 600);
  }

  function installModalDraftPersistence() {
    if (document.documentElement.dataset.ctModalDrafts === 'true') return;
    document.documentElement.dataset.ctModalDrafts = 'true';
    const selector = '.modal-overlay,.ct-modal,.modal';
    const save = debounce(modal => captureModalDraft(modal), 90);
    document.addEventListener('input', event => {
      const modal = modalDraftRoot(event.target);
      if (modal && modalIsOpen(modal)) save(modal);
    }, true);
    document.addEventListener('change', event => {
      const modal = modalDraftRoot(event.target);
      if (modal && modalIsOpen(modal)) save(modal);
    }, true);
    document.addEventListener('submit', event => {
      const modal = modalDraftRoot(event.target);
      if (modal) markModalDraftSaveAttempt(modal);
    }, true);
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('button,[role="button"],a');
      const modal = modalDraftRoot(button);
      if (!button || !modal) return;
      const text = String(button.textContent || '').trim();
      if (button.classList.contains('btn-cancel') || button.classList.contains('btn-action-cancel') || /^إلغاء(?:\s|$)/.test(text)) {
        clearModalDraft(modal);
        modal.dataset.ctDraftCancelled = 'true';
        return;
      }
      if (/حفظ|تأكيد|تنفيذ|إصدار|اعتماد/.test(text)) markModalDraftSaveAttempt(modal);
      else captureModalDraft(modal); // X/close buttons: persist synchronously before legacy close handlers run.
    }, true);
    document.addEventListener('pointerdown', event => {
      const modal = modalDraftRoot(event.target);
      if (modal && event.target === modal) captureModalDraft(modal);
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll(selector).forEach(item => {
        const modal = modalDraftRoot(item);
        if (modal && modalIsOpen(modal)) captureModalDraft(modal);
      });
    }, true);

    const observer = new MutationObserver(mutations => {
      const modals = new Set();
      mutations.forEach(mutation => {
        const target = mutation.target instanceof Element ? mutation.target : null;
        const modal = modalDraftRoot(target);
        if (modal) modals.add(modal);
      });
      modals.forEach(modal => {
        const open = modalIsOpen(modal);
        const was = modal.dataset.ctDraftWasOpen === 'true';
        if (open && !was) {
          modal.dataset.ctDraftWasOpen = 'true';
          modal.dataset.ctDraftCancelled = 'false';
          setTimeout(() => restoreModalDraft(modal), 0);
          setTimeout(() => restoreModalDraft(modal), 120);
          setTimeout(() => restoreModalDraft(modal), 400);
        } else if (!open && was) {
          modal.dataset.ctDraftWasOpen = 'false';
          if (modal.dataset.ctDraftSavePending === 'true' || modal.dataset.ctDraftCancelled === 'true') clearModalDraft(modal);
          modal.dataset.ctDraftSavePending = 'false';
        }
      });
    });
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
  }

  function isManagerSession(session = getSession()) {
    const role = String(session?.role || '').toLowerCase();
    return ['admin','owner','superadmin','manager','branch-admin','branch_manager'].includes(role);
  }

  function migrateNotificationDefaultsV54() {
    const markerKey = `ct_notification_defaults_v54::${companyIdFromSession()}`;
    if (rawGet(markerKey) === '1') return;
    const system = safeJson(localStorage.getItem('cashtop_settings'), {}) || {};
    const notif = safeJson(localStorage.getItem('cashtop_notification_settings'), {}) || {};
    if (system.notificationsEnabled === undefined) system.notificationsEnabled = false;
    if (system.dailyProfitNotificationEnabled === undefined) system.dailyProfitNotificationEnabled = true;
    notif.enabled = system.notificationsEnabled === true;
    if (notif.dailySummaryEnabled === undefined) notif.dailySummaryEnabled = system.dailyProfitNotificationEnabled !== false;
    localStorage.setItem('cashtop_settings', JSON.stringify(system));
    localStorage.setItem('cashtop_notification_settings', JSON.stringify(notif));
    rawSet(markerKey, '1');
  }

  function getNotificationSettings() {
    const system = safeJson(localStorage.getItem('cashtop_settings'), {}) || {};
    return Object.assign({ lowStockThreshold: 5, debtOverdueDays: 30, inactiveCustomerDays: 45, expiryWarningDays: 30, enabled: false, dailySummaryEnabled: true },
      safeJson(localStorage.getItem('cashtop_notification_settings'), {}) || {},
      system.notificationsEnabled !== undefined ? { enabled: system.notificationsEnabled === true } : {},
      system.dailyProfitNotificationEnabled !== undefined ? { dailySummaryEnabled: system.dailyProfitNotificationEnabled !== false } : {});
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return { ok:false, reason:'unsupported' };
    try {
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') return { ok:false, reason:permission };
      return { ok:true, permission };
    } catch (error) { return { ok:false, reason:error?.message || 'error' }; }
  }


  function notificationBrandIcon() {
    const settings = safeJson(localStorage.getItem('cashtop_settings'), {}) || {};
    return String(settings.logo || '').trim() || 'app-icon.png';
  }

  async function showSystemNotification(title, options = {}) {
    const cfg = getNotificationSettings();
    if (cfg.enabled !== true || !isManagerSession()) return false;
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const payload = {
      title: String(title || 'كاش توب'),
      body: String(options.body || ''),
      icon: options.icon || notificationBrandIcon(),
      badge: options.badge || options.icon || notificationBrandIcon(),
      image: options.image || '',
      tag: options.tag || `ct-${Date.now()}`,
      renotify: options.renotify === true,
      url: options.url || 'notifications.html',
      data: { ...(options.data || {}), url: options.url || options.data?.url || 'notifications.html' }
    };
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration?.showNotification) { await registration.showNotification(payload.title, payload); return true; }
    } catch (_) {}
    try { new Notification(payload.title, payload); return true; } catch (_) { return false; }
  }

  function invoiceDisplayTotal(invoice) {
    return Number(invoice?.finalTotal ?? invoice?.grandTotal ?? invoice?.total ?? invoice?.netTotal ?? invoice?.subtotal ?? 0) || 0;
  }

  function invoiceProfit(invoice) {
    const direct = Number(invoice?.netProfit ?? invoice?.totalProfit ?? invoice?.profit);
    if (Number.isFinite(direct)) return direct;
    return normalizeArrayValue(invoice?.items, []).reduce((sum,item)=>{
      const qty=Number(item?.quantityPieces ?? item?.quantity ?? item?.qty ?? 0)||0;
      const price=Number(item?.unitPrice ?? item?.price ?? 0)||0;
      const cost=Number(item?.costPerPiece ?? item?.cost ?? 0)||0;
      return sum + ((price-cost)*qty);
    },0);
  }

  function todaySalesSummary() {
    const dayKey = new Date().toISOString().slice(0,10);
    const invoices = normalizeArrayValue(localStorage.getItem('cashtop_invoices'), []).filter(inv => inv && inv.status !== 'draft' && String(inv.date || inv.createdAt || '').slice(0,10) === dayKey);
    const sales = invoices.reduce((s,inv)=>s+invoiceDisplayTotal(inv),0);
    const profit = invoices.reduce((s,inv)=>s+invoiceProfit(inv),0);
    const currencyCfg = window.CashtopMulti?.getCurrencyConfig?.() || { base:{symbol:'₪',code:'ILS'} };
    const symbol = currencyCfg.base?.symbol || currencyCfg.base?.code || '₪';
    return { dayKey, count: invoices.length, sales, profit, symbol };
  }

  async function showTodayProfitNotification(force = false) {
    const cfg = getNotificationSettings();
    if (cfg.enabled !== true || !isManagerSession()) return false;
    const s = todaySalesSummary();
    const key = `ct_daily_profit_notified::${companyIdFromSession()}::${s.dayKey}`;
    if (!force && rawGet(key) === '1') return false;
    const ok = await showSystemNotification('مبيعات اليوم والأرباح', {
      body: `المبيعات: ${s.sales.toFixed(2)} ${s.symbol} — الأرباح: ${s.profit.toFixed(2)} ${s.symbol} — عدد الفواتير: ${s.count}`,
      tag: `daily-profit-${companyIdFromSession()}-${s.dayKey}`,
      url: 'التقارير.html',
      data: { type:'daily-profit', day:s.dayKey }
    });
    if (ok) rawSet(key,'1');
    return ok;
  }

  function syncNotificationSummaryToServiceWorker() {
    if (!navigator.serviceWorker?.ready || !isManagerSession()) return;
    const cfg=getNotificationSettings(), summary=todaySalesSummary();
    navigator.serviceWorker.ready.then(reg=>{
      reg.active?.postMessage?.({type:'CASHTOP_NOTIFICATION_META', payload:{
        enabled:cfg.enabled===true, dailySummaryEnabled:cfg.dailySummaryEnabled!==false,
        role:'manager', summary, companyId:companyIdFromSession(), icon:notificationBrandIcon(), updatedAt:Date.now()
      }});
      if (cfg.enabled===true && reg.periodicSync?.register) reg.periodicSync.register('cashtop-daily-summary',{minInterval:60*60*1000}).catch(()=>null);
    }).catch(()=>null);
  }

  function installManagerNotificationSystem() {
    if (document.documentElement.dataset.ctManagerNotificationsInstalled === 'true') return;
    document.documentElement.dataset.ctManagerNotificationsInstalled = 'true';
    if (!isManagerSession()) return;

    // إشعارات المدير الذكية تبقى مفعلة، لكن إشعار "فاتورة جديدة"
    // أُلغي عمداً. إنشاء/مزامنة فاتورة لا يرسل تنبيهاً للمدير.
    let smartSeen = new Set(normalizeArrayValue(rawGet(`ct_smart_notification_seen::${companyIdFromSession()}`), []).map(String));
    const persistSmartSeen = () => rawSet(
      `ct_smart_notification_seen::${companyIdFromSession()}`,
      JSON.stringify([...smartSeen].slice(-300))
    );

    const scanSmart = () => {
      if (getNotificationSettings().enabled !== true) {
        updateNotificationBadge();
        return;
      }
      const current = getSmartNotifications();
      const activeIds = new Set(current.map(item => String(item.id)));
      smartSeen = new Set([...smartSeen].filter(id => activeIds.has(String(id))));
      current.forEach(item => {
        if (smartSeen.has(String(item.id))) return;
        smartSeen.add(String(item.id));
        showSystemNotification(item.title, {
          body: item.message,
          tag: `smart-${item.id}`,
          url: item.href || 'notifications.html',
          data: { type: item.type, id: item.id }
        });
      });
      persistSmartSeen();
      updateNotificationBadge();
    };

    const dailyTick = () => {
      const now = new Date();
      const cfg = getNotificationSettings();
      if (cfg.enabled === true && cfg.dailySummaryEnabled !== false && now.getHours() === 23) {
        showTodayProfitNotification(false);
      }
      // Keep the optional Periodic Background Sync summary local to the service
      // worker. This does not contact Turso and is not a new-invoice alert.
      syncNotificationSummaryToServiceWorker();
      updateNotificationBadge();
    };

    const onData = event => {
      const key = event?.detail?.key || '';
      if ([
        'cashtop_products','cashtop_customers','cashtop_invoices',
        'cashtop_employees','cashtop_workers','cashtop_salary_payments',
        'cashtop_notification_settings','cashtop_settings'
      ].includes(key)) scanSmart();
      if (['cashtop_invoices','cashtop_settings','cashtop_notification_settings'].includes(key)) {
        syncNotificationSummaryToServiceWorker();
      }
    };

    window.addEventListener('cashtop:data-changed', onData);
    window.addEventListener('cashtop:remote-applied', onData);
    window.addEventListener('cashtop:external-change', onData);
    setTimeout(() => { scanSmart(); syncNotificationSummaryToServiceWorker(); }, 700);
    setInterval(dailyTick, 60 * 1000);
  }

  function assignPermissionRequirement(element, requirement) {
    if (!element || !requirement) return;
    if (Array.isArray(requirement)) {
      element.dataset.ctPermissionAny = serializePermissionRequirement(requirement);
      delete element.dataset.ctPermission;
    } else {
      element.dataset.ctPermission = requirement;
      delete element.dataset.ctPermissionAny;
    }
  }

  function applyActionPermissions(root = document) {
    const map = ACTION_PERMISSION_MAP[FILE] || {};
    const candidates = [
      ...(root.matches?.('[onclick], [onsubmit], [onchange]') ? [root] : []),
      ...(root.querySelectorAll?.('[onclick], [onsubmit], [onchange]') || [])
    ];
    candidates.forEach(element => {
      const source = ['onclick', 'onsubmit', 'onchange']
        .map(attribute => element.getAttribute(attribute) || '')
        .join(' ');
      if (!source) return;
      for (const [handler, requirement] of Object.entries(map)) {
        if (source.includes(`${handler}(`)) {
          assignPermissionRequirement(element, requirement);
          break;
        }
      }
    });
    (ACTION_SELECTOR_RULES[FILE] || []).forEach(([selector, requirement]) => {
      try {
        const selected = [
          ...(root.matches?.(selector) ? [root] : []),
          ...(root.querySelectorAll?.(selector) || [])
        ];
        selected.forEach(element => assignPermissionRequirement(element, requirement));
      } catch (error) {
        console.warn('[CASH TOP] Invalid permission selector:', selector, error);
      }
    });
  }

  function guardRestrictedAction(event) {
    const target = event.target instanceof Element ? event.target : null;
    const restricted = target?.closest?.('[data-ct-permission], [data-ct-permission-any]');
    if (!restricted) return;
    const requirement = readPermissionRequirement(restricted);
    if (isFinancialGroupReadOnly() && !readOnlyPermissionAllowed(requirement)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showToast(financialGroupWriteError(), 'error', 4800);
      return;
    }
    if (permissionAllowed(requirement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast('لا تملك الصلاحية المطلوبة لتنفيذ هذا الإجراء.', 'error');
  }

  function applyPermissionVisibility(root = document) {
    const session = getSession() || {};
    root.querySelectorAll?.('.ct-sidebar a[href], .ct-bottom-nav a[href]').forEach(link => {
      const { file } = linkedPageInfo(link);
      const required = PAGE_PERMISSIONS[file];
      const managerOnly = new Set(['العمال والاجور.html']);
      const blockedForEmployee = session.role === 'employee' && managerOnly.has(file);
      link.hidden = blockedForEmployee || (file === 'setting.html' ? false : Boolean(required && !permissionAllowed(required, session)));
    });
    root.querySelectorAll?.('[data-ct-permission], [data-ct-permission-any]').forEach(element => {
      const requirement = readPermissionRequirement(element);
      const allowed = permissionAllowed(requirement, session);
      element.hidden = !allowed;
      if ('disabled' in element) element.disabled = !allowed || (isFinancialGroupReadOnly() && !readOnlyPermissionAllowed(requirement));
    });
    document.querySelectorAll('.ct-menu-group').forEach(group => {
      const visibleLinks = [...group.querySelectorAll('a[href]')].some(link => !link.hidden);
      group.hidden = !visibleLinks;
    });
  }

  function isFundActive(account) {
    return Boolean(account) && account.disabled !== true && account.active !== false && String(account.status || '').toLowerCase() !== 'inactive';
  }

  function activeFundAccounts(fundsOrAccounts) {
    const accounts = Array.isArray(fundsOrAccounts)
      ? fundsOrAccounts
      : normalizeArrayValue(fundsOrAccounts?.accounts, []);
    return accounts.filter(isFundActive);
  }

  function getDefaultFundAccount(fundsOrAccounts) {
    const accounts = activeFundAccounts(fundsOrAccounts);
    return accounts.find(account => account?.isDropdownDefault === true)
      || accounts.find(account => account?.isDefaultCash === true)
      || accounts[0]
      || null;
  }

  function sortFundAccountsForDropdown(fundsOrAccounts) {
    const accounts = activeFundAccounts(fundsOrAccounts).slice();
    const preferred = getDefaultFundAccount(accounts);
    if (!preferred) return accounts;
    return accounts.sort((a, b) => {
      const aDefault = String(a?.id) === String(preferred.id) ? 0 : 1;
      const bDefault = String(b?.id) === String(preferred.id) ? 0 : 1;
      return aDefault - bDefault;
    });
  }

  function getSystemSettings() {
    return safeJson(localStorage.getItem('cashtop_settings'), {}) || {};
  }

  function getProfitRate() {
    const settings = getSystemSettings();
    const raw = settings.profitRate;
    if (raw === undefined || raw === null || String(raw).trim() === '') return 25;
    const rate = Number(raw);
    return Number.isFinite(rate) ? Math.max(0, rate) : 25;
  }

  function getInventoryAccountingMethod() {
    const method = String(getSystemSettings().inventoryAccountingMethod || 'default').trim().toLowerCase();
    return ['fifo', 'lifo'].includes(method) ? method : 'default';
  }

  function salePriceFromCost(cost, rate = getProfitRate()) {
    const value = Math.max(0, Number(cost || 0));
    const percent = Math.max(0, Number(rate || 0));
    return value * (1 + percent / 100);
  }

  function applySystemBranding() {
    const session = getSession() || {};
    const settings = getSystemSettings();
    const companyName = String(settings.companyName || session.companyName || session.companyKey || APP_NAME).trim();
    const logo = String(settings.logo || '').trim();
    const address = String(settings.address || '').trim();
    const phone = String(settings.phone || '').trim();
    setText('ctCompanyTitle', [companyName, address, phone].filter(Boolean).join(' · ') || 'نظام المحاسبة والمخزون');
    setText('ctSidebarCompany', companyName || APP_NAME);
    document.querySelectorAll('.ct-sidebar-brand img, .ct-topbar-logo').forEach(image => {
      if (logo) image.src = logo;
      image.alt = companyName || APP_NAME;
      image.title = [companyName, address, phone].filter(Boolean).join(' - ');
    });
    document.documentElement.dataset.companyName = companyName;
    window.dispatchEvent(new CustomEvent('cashtop:branding-applied', { detail: { companyName, logo, address, phone } }));
    return { companyName, logo, address, phone };
  }

  function hydrateShell() {
    const session = getSession() || {};
    if (!enforceCurrentPageAccess(session)) return;
    ensureBottomNavigation();
    normalizeShellLabels();
    applyActionPermissions();
    applyPermissionVisibility();
    restrictSettingsForBasicUser(session);
    renderSubscriptionPanel(session);
    renderSyncAndCacheMaintenancePanel();
    const pageTitle = PAGE_TITLES[FILE] || document.title || APP_NAME;
    document.title = `${pageTitle} - ${APP_NAME}`;
    setText('ctPageTitle', pageTitle);
    setText('ctCurrentUser', session.displayName || session.username || 'مستخدم');
    applySystemBranding();

    const current = FILE;
    const currentSection = current === 'استيراد وتصدير ل كل قسم.html' ? (new URLSearchParams(location.search).get('section') || '') : '';
    document.querySelectorAll('.ct-sidebar a[href], .ct-bottom-nav a[href]').forEach(link => {
      const target = linkedPageInfo(link);
      const sectionMatches = current !== 'استيراد وتصدير ل كل قسم.html' || target.section === currentSection;
      if (target.file === current && sectionMatches) {
        link.classList.add('active');
        const details = link.closest('details');
        if (details) details.open = true;
      }
    });

    document.addEventListener('click', handleShellClick);
    document.addEventListener('click', guardRestrictedAction, true);
    document.addEventListener('submit', guardRestrictedAction, true);
    document.addEventListener('change', guardRestrictedAction, true);
    mountHeaderActions();
    upgradeShellIconsToSvg();
    enhanceAllSelects();
    updateNetworkStatus();
    updateNotificationBadge();
    displayLicenseWarning(session);
    // R106: never auto-archive business records during normal navigation.
    let permissionRefreshFrame = 0;
    const pendingMutationRoots = new Set();
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (!record.addedNodes?.length) continue;
        // Process only the subtree that actually changed. Re-scanning the whole
        // document on every modal/table render caused visible UI stalls.
        if (record.target?.nodeType === 1) pendingMutationRoots.add(record.target);
      }
      if (!pendingMutationRoots.size || permissionRefreshFrame) return;
      permissionRefreshFrame = requestAnimationFrame(() => {
        permissionRefreshFrame = 0;
        const roots = [...pendingMutationRoots];
        pendingMutationRoots.clear();
        for (const root of roots) {
          applyActionPermissions(root);
          enhanceAllSelects(root);
          applyPermissionVisibility(root);
        }
      });
    });
    observer.observe(document.getElementById('ctPageHost') || document.body, { childList: true, subtree: true });
  }


  function renderSyncAndCacheMaintenancePanel() {
    if (FILE !== 'setting.html' || document.getElementById('ctSyncCacheMaintenancePanel') || isBasicStaffRole()) return;
    const host = document.getElementById('ctPageHost');
    if (!host || host.dataset.logoutOnly === 'true') return;

    const panel = document.createElement('section');
    panel.id = 'ctSyncCacheMaintenancePanel';
    panel.className = 'ct-sync-cache-maintenance';
    panel.innerHTML = `
      <style>
        .ct-sync-cache-maintenance{background:#fff;border:1px solid #e2e8f0;border-top:4px solid #605ca8;border-radius:10px;padding:16px;margin:0 0 16px;font-family:Cairo;box-shadow:0 5px 16px rgba(15,23,42,.04)}
        .ct-maintenance-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .ct-maintenance-head strong{font-size:15px;color:#1f2937}.ct-maintenance-version{font-size:11px;font-weight:800;background:#eef2ff;color:#4338ca;padding:5px 10px;border-radius:999px}
        .ct-maintenance-description{font-size:11px;line-height:1.9;color:#64748b;margin:9px 0 13px}
        .ct-maintenance-status{display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px 11px;font-size:12px;font-weight:700;color:#334155;margin-bottom:12px}
        .ct-maintenance-status b{color:#605ca8}.ct-maintenance-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .ct-maintenance-btn{border:0;border-radius:8px;padding:11px 13px;font:800 12px Cairo;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;min-height:43px}
        .ct-maintenance-btn:disabled{opacity:.6;cursor:wait}.ct-cache-refresh-btn{background:#605ca8;color:#fff}.ct-queue-reset-btn{background:#fff1f2;color:#be123c;border:1px solid #fecdd3}
        @media(max-width:620px){.ct-maintenance-actions{grid-template-columns:1fr}.ct-sync-cache-maintenance{padding:14px}}
      </style>
      <div class="ct-maintenance-head"><strong><i class="fa-solid fa-cloud-arrow-up"></i> المزامنة وتحديث التطبيق</strong><span class="ct-maintenance-version">R129</span></div>
      <p class="ct-maintenance-description">تحديث الكاش يحفظ العمليات المعلقة في IndexedDB أولاً، ثم ينزّل ملفات الموقع الجديدة ويعيد فتح التطبيق. تصفير الطابور يحذف العمليات القديمة فقط ولا يحذف البيانات المحلية.</p>
      <div class="ct-maintenance-status"><i class="fa-solid fa-list-check"></i><span>العمليات المعلقة حالياً: <b id="ctMaintenanceQueueCount">0</b></span></div>
      <div class="ct-maintenance-actions">
        <button type="button" class="ct-maintenance-btn ct-cache-refresh-btn" id="ctRefreshApplicationCache"><i class="fa-solid fa-arrows-rotate"></i><span>تحديث الكاش والتطبيق</span></button>
        <button type="button" class="ct-maintenance-btn ct-queue-reset-btn" id="ctResetOldSyncQueue"><i class="fa-solid fa-trash-can-arrow-up"></i><span>تصفير طابور المزامنة القديم</span></button>
      </div>`;

    const subscription = document.getElementById('ctSubscriptionPanel');
    const smsCard = host.querySelector('.sms-card');
    if (subscription?.parentNode) subscription.insertAdjacentElement('afterend', panel);
    else if (smsCard?.parentNode) smsCard.insertAdjacentElement('afterend', panel);
    else host.prepend(panel);

    const queueCount = panel.querySelector('#ctMaintenanceQueueCount');
    const renderCount = () => { if (queueCount) queueCount.textContent = String(getSyncQueue().length); };
    renderCount();
    window.addEventListener('cashtop:sync-queue-changed', renderCount);
    window.addEventListener('cashtop:sync-queue-reset', renderCount);

    panel.querySelector('#ctResetOldSyncQueue')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const count = getSyncQueue().length;
      const accepted = confirm(`سيتم حذف ${count} عملية قديمة من طابور هذا الجهاز. البيانات المحلية لن تُحذف، لكن هذه العمليات القديمة لن تُرفع إلى السيرفر. متابعة؟`);
      if (!accepted) return;
      button.disabled = true;
      const oldHtml = button.innerHTML;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>جاري التصفير...</span>';
      try {
        const result = await resetSyncQueueCompletely();
        await window.CashtopTurso?.resetSyncRuntime?.();
        renderCount();
        showToast(`تم تصفير الطابور وحذف ${result.discarded} عملية قديمة. أي تعديل جديد سيُزامن بطابور جديد.`, 'success', 4800);
      } catch (error) {
        showToast(error?.message || 'تعذر تصفير طابور المزامنة.', 'error');
      } finally {
        button.disabled = false;
        button.innerHTML = oldHtml;
      }
    });

    panel.querySelector('#ctRefreshApplicationCache')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const oldHtml = button.innerHTML;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>جاري حفظ الطابور وتحديث الملفات...</span>';
      try {
        const result = await refreshApplicationCache();
        showToast(`تم تحديث ملفات التطبيق، وحُفظت ${result.pendingPreserved} عملية معلقة. جاري إعادة الفتح...`, 'success', 4200);
        setTimeout(() => location.reload(), 850);
      } catch (error) {
        showToast(error?.message || 'تعذر تحديث كاش التطبيق.', 'error', 5200);
        button.disabled = false;
        button.innerHTML = oldHtml;
      }
    });
  }

  function renderSubscriptionPanel(session = getSession()) {
    if (FILE !== 'setting.html' || isBasicStaffRole(session)) { document.getElementById('ctSubscriptionPanel')?.remove(); return; }
    document.getElementById('ctSubscriptionPanel')?.remove();
    const access = getCompanyAccess();
    const plan = currentPlan();
    const companyKey = String(access.companyKey || session?.companyKey || '').trim();
    const host = document.getElementById('ctPageHost');
    if (!host) return;

    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[char]);
    const limitText = value => value == null ? 'غير محدود' : String(value);

    let details = '';
    if (plan === 'plus') {
      details = `
        <div class="ct-plan-grid">
          <span>المنتجات / فرع <b>${PLUS_LIMITS.products}</b></span>
          <span>الموردون / فرع <b>${PLUS_LIMITS.suppliers}</b></span>
          <span>الفروع <b>${PLUS_LIMITS.branches}</b></span>
          <span>المخازن / فرع <b>${PLUS_LIMITS.storesPerBranch}</b></span>
          <span>الموظفون / فرع <b>${PLUS_LIMITS.employeesPerBranch}</b></span>
          <span>الفواتير اليومية / فرع <b>${PLUS_LIMITS.invoicesDailyPerBranch}</b></span>
          <span>العملاء الجدد يومياً <b>${PLUS_LIMITS.customersDailyCompany}</b></span>
          <span>المصاريف اليومية <b>${PLUS_LIMITS.expensesDailyCompany}</b></span>
          <span>فواتير المشتريات اليومية <b>${PLUS_LIMITS.purchasesDailyCompany}</b></span>
        </div>`;
    } else if (plan === 'custom') {
      const limits = currentCustomLimits();
      details = `
        <div class="ct-plan-grid">
          <span>الفواتير يومياً <b>${limitText(limits.daily.invoices)}</b></span>
          <span>العملاء يومياً <b>${limitText(limits.daily.customers)}</b></span>
          <span>المصاريف يومياً <b>${limitText(limits.daily.expenses)}</b></span>
          <span>الموردون يومياً <b>${limitText(limits.daily.suppliers)}</b></span>
          <span>الموظفون <b>${limitText(limits.fixed.employees)}</b></span>
          <span>المخازن <b>${limitText(limits.fixed.warehouses)}</b></span>
          <span>الفروع <b>${limitText(limits.fixed.branches)}</b></span>
          <span>المنتجات <b>${limitText(limits.fixed.products)}</b></span>
        </div>`;
    } else {
      details = '<div class="ct-plan-description">جميع حدود الاستخدام غير محدودة في خطة Pro.</div>';
    }

    const planLabel = plan === 'plus' ? 'Plus' : plan === 'custom' ? 'مخصصة' : 'Pro';
    const panel = document.createElement('section');
    panel.id = 'ctSubscriptionPanel';
    panel.className = 'ct-subscription-panel';
    panel.innerHTML = `
      <style>
        .ct-subscription-panel{background:#fff;border:1px solid #e2e8f0;border-top:4px solid #605ca8;border-radius:9px;padding:15px;margin:0 0 16px;font-family:Cairo}
        .ct-plan-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
        .ct-plan-head strong{font-size:14px}.ct-plan-badge{padding:5px 12px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:800}
        .ct-company-key{margin-top:11px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;display:flex;justify-content:space-between;gap:10px;align-items:center;direction:rtl;font-size:11px}
        .ct-company-key code{direction:ltr;unicode-bidi:plaintext;font-weight:800;color:#312e81;overflow-wrap:anywhere}
        .ct-plan-description{margin-top:10px;color:#64748b;font-size:11px;line-height:1.8}
        .ct-plan-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:11px}
        .ct-plan-grid span{background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:8px 10px;font-size:10px;color:#475569}
        .ct-plan-grid b{color:#111827}
        @media(max-width:600px){.ct-plan-grid{grid-template-columns:1fr}}
      </style>
      <div class="ct-plan-head">
        <strong><i class="fa-solid fa-crown"></i> تفاصيل الخطة</strong>
        <span class="ct-plan-badge">${planLabel}</span>
      </div>
      <div class="ct-company-key"><span>مفتاح الشركة</span><code>${esc(companyKey || '—')}</code></div>
      ${details}`;
    const smsCard = host.querySelector('.sms-card');
    if (smsCard?.parentNode) smsCard.insertAdjacentElement('afterend', panel);
    else host.prepend(panel);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function handleShellClick(event) {
    const actionEl = event.target.closest('[data-ct-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.ctAction;
    if (action === 'open-sidebar') toggleSidebar(true);
    if (action === 'close-sidebar') toggleSidebar(false);
    if (action === 'logout') logout('logout');
    if (action === 'sync') {
      if (!can('sync.run')) return showToast('لا تملك صلاحية تشغيل المزامنة اليدوية.', 'error');
      syncNow();
    }
    if (action === 'install-app') installPwa();
  }

  function toggleSidebar(open) {
    document.getElementById('ctSidebar')?.classList.toggle('open', open);
    document.getElementById('ctSidebarOverlay')?.classList.toggle('open', open);
  }

  function updateNetworkStatus() {
    const status = document.getElementById('ctNetStatus');
    if (!status) return;
    const backendState = window.CashtopTurso?.getState?.() || {};
    const backendRecentlyReachable = backendState.backendReachable === true && Date.now() - Number(backendState.backendReachableAt || 0) < 120000;
    const online = navigator.onLine !== false || backendRecentlyReachable;
    status.classList.toggle('offline', !online);
    const span = status.querySelector('span');
    if (span) span.textContent = online ? 'متصل' : 'غير متصل';
    status.title = online ? 'متصل بالإنترنت' : 'يتم الحفظ محلياً وسيتم التزامن لاحقاً';
    updateSyncBadge();
  }

  function displayLicenseWarning(session) {
    if (!session || !session.licenseEnd) return;
    const remaining = new Date(session.licenseEnd).getTime() - Date.now();
    const days = Math.ceil(remaining / 86400000);
    if (days > 7 || days < 0) return;
    const banner = document.createElement('div');
    banner.className = 'ct-license-banner';
    banner.textContent = 'تنبيه: راجع حالة الاشتراك من الإعدادات.';
    document.body.appendChild(banner);
  }

  function showToast(message, type = 'info', duration = 3200) {
    let wrap = document.querySelector('.ct-core-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ct-core-toast-wrap';
      document.body.appendChild(wrap);
    }
    const toast = document.createElement('div');
    toast.className = `ct-core-toast ${type}`;
    toast.textContent = message;
    wrap.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  function waitForServiceWorkerMessage(requestId, acceptedTypes, timeoutMs = 25000) {
    return new Promise(resolve => {
      let settled = false;
      const types = new Set(Array.isArray(acceptedTypes) ? acceptedTypes : [acceptedTypes]);
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        navigator.serviceWorker?.removeEventListener?.('message', onMessage);
        resolve(value);
      };
      const onMessage = event => {
        const data = event.data || {};
        if (!types.has(data.type)) return;
        // توافق مع عامل الخدمة R58 الذي كان يرسل النتيجة بلا requestId.
        if (data.requestId && data.requestId !== requestId) return;
        finish(data);
      };
      const timer = setTimeout(() => finish({ timeout: true, requestId }), timeoutMs);
      navigator.serviceWorker?.addEventListener?.('message', onMessage);
    });
  }

  async function refreshApplicationCache() {
    const saved = await preservePendingSyncState();
    const secureServiceWorkerContext = location.protocol === 'https:' || location.hostname === 'localhost';
    if (!('serviceWorker' in navigator) || !secureServiceWorkerContext) {
      throw new Error('تحديث كاش التطبيق يحتاج فتح الموقع عبر HTTPS أو localhost.');
    }

    const registration = await navigator.serviceWorker.getRegistration() ||
      await navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' });

    // اطلب من المتصفح فحص نسخة service-worker.js الجديدة من السيرفر مباشرة.
    try { await registration.update(); } catch (_) {}
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // عامل الخدمة الفعال (الجديد إن تم تفعيله، أو الحالي إن لم يتغير الملف)
    // يعيد تنزيل جميع ملفات التطبيق بلا كاش، من دون لمس localStorage/IndexedDB.
    const ready = await navigator.serviceWorker.ready;
    const worker = registration.waiting || registration.active || ready.active || navigator.serviceWorker.controller;
    if (!worker) throw new Error('تعذر الوصول إلى عامل خدمة التطبيق.');

    const requestId = `CACHE_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const responsePromise = waitForServiceWorkerMessage(requestId, 'CASHTOP_CACHE_REFRESHED', 35000);
    worker.postMessage({ type: 'REFRESH_CACHE', requestId });
    const refreshed = await responsePromise;
    if (refreshed?.timeout) throw new Error('انتهت مهلة تحديث الكاش. أعد المحاولة مع اتصال ثابت.');
    if (!refreshed?.complete) throw new Error(`اكتمل تحديث ${Number(refreshed?.updated || 0)} من ${Number(refreshed?.total || 0)} ملف فقط.`);

    // أعد تثبيت الطابور بعد تنزيل الملفات احتياطياً، ثم اجعل أي SW منتظر فعالاً.
    await preservePendingSyncState();
    const latestRegistration = await navigator.serviceWorker.getRegistration();
    latestRegistration?.waiting?.postMessage?.({ type: 'SKIP_WAITING' });
    rawSet('ct_sw_update_checked_at', String(Date.now()));
    return { ...refreshed, pendingPreserved: saved.count };
  }

  async function installPwa() {
    const installSession = getSession();
    if (!can('app.install', installSession) && !isBasicStaffRole(installSession)) {
      showToast('لا تملك صلاحية تثبيت التطبيق.', 'error');
      return { installed: false, denied: true };
    }
    if (appInstalled || window.matchMedia?.('(display-mode: standalone)')?.matches) {
      showToast('التطبيق مثبت بالفعل على هذا الجهاز.', 'success');
      return { installed: true, alreadyInstalled: true };
    }
    if (!deferredInstallPrompt) {
      showToast('نافذة التثبيت غير متاحة الآن. افتح الموقع عبر Chrome ثم اختر «تثبيت التطبيق» من قائمة المتصفح.', 'info', 5200);
      return { installed: false, unavailable: true };
    }
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') showToast('تم بدء تثبيت التطبيق.', 'success');
    else showToast('تم إلغاء تثبيت التطبيق.', 'info');
    return { installed: choice?.outcome === 'accepted', outcome: choice?.outcome || 'dismissed' };
  }

  let cloudSyncRuntimePromise = null;

  function ensureCloudSyncRuntime() {
    if (window.CashtopTurso && typeof window.CashtopTurso.syncAll === 'function') {
      return Promise.resolve(true);
    }
    let cfg = window.CASHTOP_TURSO || {};
    // إعادة تحميل اعتماد ملف التفعيل قبل إنشاء وحدة المزامنة.
    try {
      if (!cfg.enabled && window.CashtopTursoConfig?.refresh) {
        cfg = window.CashtopTursoConfig.refresh() || window.CASHTOP_TURSO || {};
      }
    } catch (_) {}
    if (!cfg.enabled || !cfg.config?.databaseURL) return Promise.resolve(false);
    if (cloudSyncRuntimePromise) return cloudSyncRuntimePromise;

    cloudSyncRuntimePromise = (async () => {
      // عند تشغيل التطبيق محلياً قد يكون turso-rtdb قد تم تحميله قبل أن يصبح
      // ملف التفعيل متاحاً في runtime، فينسحب مبكراً ولا ينشئ الجسر المحلي.
      // نعيد تشغيله مرة واحدة بعد تحديث الإعدادات حتى تعمل المزامنة من file://.
      if (!window.CashtopTursoBridge && cfg.backendMode === 'turso-http-rtdb') {
        await new Promise(resolve => {
          const existing = document.querySelector('script[data-ct-turso-bridge-runtime="v2"]');
          if (existing) {
            const started = Date.now();
            const wait = () => {
              if (window.CashtopTursoBridge) return resolve(true);
              if (Date.now() - started > 5000) return resolve(false);
              setTimeout(wait, 60);
            };
            wait();
            return;
          }
          const script = document.createElement('script');
          script.src = 'turso-rtdb.js?v=101';
          script.async = true;
          script.dataset.ctTursoBridgeRuntime = 'v2';
          script.onload = () => resolve(Boolean(window.CashtopTursoBridge));
          script.onerror = () => resolve(false);
          (document.head || document.documentElement).appendChild(script);
        });
      }

      if (window.CashtopTurso && typeof window.CashtopTurso.syncAll === 'function') return true;
      return await new Promise(resolve => {
        const existing = document.querySelector('script[data-ct-sync-runtime="v2"]');
        if (existing) {
          const started = Date.now();
          const wait = () => {
            if (window.CashtopTurso?.syncAll) return resolve(true);
            if (Date.now() - started > 5000) return resolve(false);
            setTimeout(wait, 80);
          };
          wait();
          return;
        }
        const script = document.createElement('script');
        script.src = 'turso-sync.js?v=127';
        script.async = true;
        script.dataset.ctSyncRuntime = 'v2';
        script.onload = () => resolve(Boolean(window.CashtopTurso?.syncAll));
        script.onerror = () => resolve(false);
        (document.head || document.documentElement).appendChild(script);
      });
    })().finally(() => {
      if (!window.CashtopTurso?.syncAll) cloudSyncRuntimePromise = null;
    });
    return cloudSyncRuntimePromise;
  }

  async function syncNow(options = {}) {
    const manual = options.manual !== false;
    if (manual && !can('sync.run')) {
      showToast('لا تملك صلاحية تشغيل المزامنة اليدوية.', 'error');
      return { processed: 0, denied: true };
    }
    const button = document.getElementById('ctSyncButton');
    const animationStartedAt = performance.now();
    const finishAnimation = (minimumMs = 900) => {
      if (!manual) return;
      const elapsed = performance.now() - animationStartedAt;
      window.setTimeout(() => button?.classList.remove('ct-syncing'), Math.max(0, minimumMs - elapsed));
    };
    if (manual) button?.classList.add('ct-syncing');
    window.dispatchEvent(new CustomEvent('cashtop:sync-request', { detail: { manual } }));
    // navigator.onLine مؤشر تقريبي فقط وقد يكون خاطئاً على بعض الشبكات/VPN.
    // نحاول خادم قاعدة البيانات فعلياً ونقرر النتيجة من استجابة الطلب نفسه.
    try {
      if (!(window.CashtopTurso && typeof window.CashtopTurso.syncAll === 'function')) {
        await ensureCloudSyncRuntime();
      }
      if (window.CashtopTurso && typeof window.CashtopTurso.syncAll === 'function') {
        const result = await window.CashtopTurso.syncAll({ manual, forceCheck: manual === true });
        if (manual) {
          const processed = Number(result?.processed || 0);
          const pulled = Number(result?.pulled || 0);
          const remaining = Number(result?.remaining || 0);
          const failed = Number(result?.failed || 0);
          if (result?.offline || result?.networkDeferred) {
            showToast(result?.message || 'تعذر وصول هذه المحاولة إلى خادم المزامنة. البيانات محفوظة محلياً وستتم إعادة المحاولة تلقائياً.', 'warning');
          } else if (failed > 0 || remaining > 0 || result?.partial) {
            if (processed > 0 || pulled > 0) {
              showToast(`تمت مزامنة العمليات الجاهزة، وبقي ${remaining} قيد الانتظار لإعادة المحاولة تلقائياً.`, 'warning');
            } else {
              showToast(`تعذر مزامنة ${remaining || failed} عملية حالياً. ستبقى محفوظة محلياً وتُعاد المحاولة تلقائياً.`, 'warning');
            }
          } else if (processed > 0 || pulled > 0) {
            showToast('تمت المزامنة', 'success');
          } else {
            showToast('لا توجد عمليات معلقة؛ البيانات متزامنة.', 'success');
          }
        }
        return result;
      }
      if (manual) showToast('البيانات محفوظة محلياً. المزامنة السحابية غير متاحة حالياً وستُعاد المحاولة تلقائياً.', 'info');
      return { processed: 0, unavailable: true };
    } catch (error) {
      console.error(error);
      const rawMessage = String(error?.message || '');
      const networkLike = error?.name === 'TypeError' || /failed to fetch|networkerror|network request failed|load failed|مهلة الاتصال|تعذر الاتصال|خادم المزامنة|قاعدة البيانات/i.test(rawMessage);
      if (manual) showToast(networkLike
        ? (rawMessage || 'تعذر وصول هذه المحاولة إلى خادم المزامنة. البيانات محفوظة محلياً وستتم إعادة المحاولة تلقائياً.')
        : (rawMessage || 'تعذرت المزامنة الآن، وستتم إعادة المحاولة تلقائياً.'), networkLike ? 'warning' : 'error');
      return { processed: 0, error: true, networkDeferred: networkLike };
    } finally {
      updateSyncBadge();
      finishAnimation(1050);
    }
  }

  function getAllCompanyData() {
    const session = getSession() || {};
    const companyId = String(session.tenantId || session.companyId || session.companyKey || '');
    const datasets = {};
    DATA_KEYS.forEach(key => {
      const rawValue = getRawCompanyDataset(key);
      datasets[key] = {
        exists: rawValue !== null,
        value: rawValue,
        valueEncoding: 'local-storage-raw-v1'
      };
    });

    // R108: النسخة الكاملة تشمل كل المجموعات المالية، وليس المجموعة المفتوحة
    // في الشاشة الحالية فقط. هذا يمنع نقص المنتجات/الفواتير عند استعادة نسخة
    // لشركة لديها أكثر من فترة أو مجموعة مالية.
    const financialGroupDatasets = {};
    const groups = getFinancialGroups(companyId);
    // لا نعتمد على سجل المجموعات وحده: نضم المجموعة القديمة دائماً وأي مجموعة
    // موجودة فعلياً في localStorage، حتى لا تسقط بيانات فترة مالية قديمة/يتيمة
    // من النسخة الكاملة إذا تعرّض سجل المجموعات نفسه لنقص سابق.
    const groupIds = new Set([
      LEGACY_FINANCIAL_GROUP_ID,
      currentFinancialGroupId(companyId),
      ...groups.map(group => String(group?.id || '')).filter(Boolean)
    ]);
    const physicalPrefix = `cashtop_data::${encodeURIComponent(companyId)}::fg::`;
    for (let i = 0; i < localStorage.length; i += 1) {
      const physicalKey = localStorage.key(i) || '';
      if (!physicalKey.startsWith(physicalPrefix)) continue;
      const tail = physicalKey.slice(physicalPrefix.length);
      const splitAt = tail.indexOf('::');
      if (splitAt <= 0) continue;
      try { groupIds.add(decodeURIComponent(tail.slice(0, splitAt))); } catch (_) { groupIds.add(tail.slice(0, splitAt)); }
    }
    groupIds.forEach(groupId => {
      const groupData = {};
      FINANCIAL_GROUP_SCOPED_KEYS.forEach(key => {
        if (!DATA_KEYS.includes(key)) return;
        const rawValue = rawGet(namespaceKey(key, companyId, groupId));
        groupData[key] = { exists: rawValue !== null, value: rawValue, valueEncoding: 'local-storage-raw-v1' };
      });
      financialGroupDatasets[String(groupId)] = groupData;
    });
    return {
      format: 'cashtop-backup-v6',
      exportedAt: new Date().toISOString(),
      tenantId: companyId,
      companyId,
      companyKey: session.companyKey || '',
      companyName: session.companyName,
      activeFinancialGroupId: currentFinancialGroupId(companyId),
      financialGroupDatasets,
      datasets
    };
  }

  async function exportBackup() {
    // R127: النسخة الاحتياطية مستقلة تماماً عن الـPager. قبل إنشاء الملف
    // نسحب كامل الـdatasets من السحابة إلى الجهاز، بما فيها السجلات التي لم
    // تظهر في صفحات 1/2/3...، ثم نبني النسخة من كامل المخزن.
    try {
      if (navigator.onLine !== false && window.CashtopTurso?.pullAllWithRetry) {
        await window.CashtopTurso.pullAllWithRetry({ force: true, concurrency: 6, silentProgress: true, reason: 'full-backup' });
      } else if (navigator.onLine !== false && window.CashtopTurso?.pullAll) {
        await window.CashtopTurso.pullAll({ force: true, concurrency: 6 });
      }
    } catch (error) {
      console.warn('[CASH TOP R127] full backup pull:', error);
    }
    const backup = getAllCompanyData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CASH_TOP_${backup.companyName || backup.companyId || 'company'}_${new Date().toISOString().slice(0, 10)}.backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم إنشاء النسخة الاحتياطية من كامل السجلات، وليس من صفحات العرض.', 'success');
  }

  function isBackupImportEnabled() {
    const access = getCompanyAccess();
    return access?.backupImportEnabled === true;
  }

  async function syncImportedData(keys = []) {
    const importedKeys = [...new Set((Array.isArray(keys) ? keys : []).map(canonicalKey).filter(key => DATA_KEYS.includes(key)))];
    importedKeys.forEach(key => {
      if (!getSyncQueue().some(item => item.key === key)) enqueueSyncOperation(key, { forceReplace: true });
    });
    if (!window.CashtopTurso) return { unavailable: true, remaining: getSyncQueue().length };

    window.dispatchEvent(new CustomEvent('cashtop:sync-progress', {
      detail: { active: true, current: 0, total: Math.max(1, importedKeys.length), label: 'جاري رفع التغييرات المستوردة فقط...' }
    }));

    let result = null;
    try {
      // v74: Turso import uses batched exact UPSERTs: no remote pre-read and no
      // verification pull for every dataset.
      if (typeof window.CashtopTurso.importDatasets === 'function') {
        result = await window.CashtopTurso.importDatasets(importedKeys);
      } else if (typeof window.CashtopTurso.syncAll === 'function') {
        result = await window.CashtopTurso.syncAll({ importSync: true, forceRetry: true });
      }
      return result || { remaining: getSyncQueue().length };
    } catch (error) {
      console.warn('[CASH TOP] restore sync:', error);
      return { error: true, remaining: getSyncQueue().length, message: String(error?.message || error) };
    } finally {
      window.dispatchEvent(new CustomEvent('cashtop:sync-progress', {
        detail: {
          active: false, done: true, success: getSyncQueue().length === 0,
          current: Math.max(0, importedKeys.length - getSyncQueue().length),
          total: Math.max(1, importedKeys.length),
          label: getSyncQueue().length ? 'بقيت عمليات معلقة وستُرفع تلقائياً' : 'اكتملت مزامنة النسخة الاحتياطية'
        }
      }));
    }
  }

  function normalizeMergeToken(value) {
    return String(value ?? '')
      .replace(/[٠-٩]/g, digit => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(digit)])
      .replace(/[۰-۹]/g, digit => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)])
      .trim().toLowerCase().replace(/[\s\-_.()+]/g, '');
  }

  function backupRecordCandidates(dataset, record) {
    if (!record || typeof record !== 'object') return [];
    const add = (type, value, out) => { const token = normalizeMergeToken(value); if (token) out.push(`${type}:${token}`); };
    const out = [];
    if (dataset === 'cashtop_products') {
      // إذا وُجد id ثابت فلا ندمج المنتج مع منتج آخر لمجرد تشابه الباركود/SKU.
      // هذا كان سبباً مباشراً في انخفاض عدد المنتجات بعد بعض عمليات الاستعادة.
      const stableId = normalizeMergeToken(record.id);
      if (stableId) return [`id:${stableId}`];
      add('barcode', record.barcode || record.barCode || record.productBarcode, out);
      add('sku', record.sku || record.code || record.productCode, out);
      return [...new Set(out)];
    }
    if (dataset === 'cashtop_customers') {
      add('id', record.id, out);
      add('phone', String(record.phone || record.mobile || '').replace(/\D/g,''), out);
      add('code', record.code || record.customerCode || record.number, out);
      return [...new Set(out)];
    }
    if (dataset === 'cashtop_employees') { add('id',record.id,out); add('username',record.username,out); return [...new Set(out)]; }
    if (dataset === 'cashtop_branches') {
      if (record.isMain === true || String(record.id || '').toUpperCase() === 'MAIN') out.push('branch:main');
      add('id',record.id,out); return [...new Set(out)];
    }
    if (dataset === 'cashtop_funds_db_accounts') { add('id',record.id,out); add('name',record.name,out); return [...new Set(out)]; }
    if (dataset === 'cashtop_funds_db_logs') { add('id',record.id,out); add('ref',`${record.sourceType||record.refType||''}:${record.sourceId||record.refId||''}:${record.accountId||''}`,out); return [...new Set(out)]; }
    ['id','invoiceId','refNumber','reference','code','number','username'].forEach(field => add(field, record[field], out));
    return [...new Set(out)];
  }

  function mergeBackupArray(dataset, currentValue, importedValue) {
    const result = normalizeArrayValue(currentValue, []).map(item => deepClone(item));
    const index = new Map();
    const indexRecord = (record, position) => backupRecordCandidates(dataset, record).forEach(key => { if (!index.has(key)) index.set(key, position); });
    result.forEach(indexRecord);
    normalizeArrayValue(importedValue, []).forEach(imported => {
      const keys = backupRecordCandidates(dataset, imported);
      let position = -1;
      for (const key of keys) { if (index.has(key)) { position = index.get(key); break; } }
      if (position >= 0) {
        const previous = result[position] && typeof result[position] === 'object' ? result[position] : {};
        result[position] = { ...deepClone(previous), ...deepClone(imported) };
        indexRecord(result[position], position);
      } else {
        position = result.length;
        result.push(deepClone(imported));
        indexRecord(result[position], position);
      }
    });
    return result;
  }

  function mergeBackupDataset(canonical, oldRaw, storageValue) {
    const oldValue = safeJson(oldRaw, null);
    const importedValue = safeJson(storageValue, null);
    if (Array.isArray(importedValue)) {
      const merged = mergeBackupArray(canonical, Array.isArray(oldValue) ? oldValue : [], importedValue);
      return JSON.stringify(merged);
    }
    if (canonical === 'cashtop_funds_db' && importedValue && typeof importedValue === 'object') {
      const current = oldValue && typeof oldValue === 'object' ? oldValue : {};
      return JSON.stringify({
        ...deepClone(current), ...deepClone(importedValue),
        accounts: mergeBackupArray('cashtop_funds_db_accounts', current.accounts || [], importedValue.accounts || []),
        accountLogs: mergeBackupArray('cashtop_funds_db_logs', current.accountLogs || [], importedValue.accountLogs || [])
      });
    }
    if (importedValue && typeof importedValue === 'object' && !Array.isArray(importedValue)) {
      const current = oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue) ? oldValue : {};
      return JSON.stringify({ ...deepClone(current), ...deepClone(importedValue) });
    }
    return storageValue;
  }

  function normalizeBackupEnvelope(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const knownFormats = new Set(['cashtop-backup-v1', 'cashtop-backup-v2', 'cashtop-backup-v3', 'cashtop-backup-v4', 'cashtop-backup-v5', 'cashtop-backup-v6']);
    const candidateStores = [payload.datasets, payload.data, payload.storage, payload.localStorage, payload.companyData];
    let source = candidateStores.find(value => value && typeof value === 'object' && !Array.isArray(value));
    if (!source) {
      const topLevel = Object.fromEntries(Object.entries(payload).filter(([key]) => isManagedKey(key)));
      if (Object.keys(topLevel).length) source = topLevel;
    }
    if (!source) return null;
    const datasets = {};
    Object.entries(source).forEach(([key, entry]) => {
      if (!isManagedKey(key)) return;
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && ('value' in entry || 'exists' in entry || entry.valueEncoding)) {
        datasets[key] = entry;
      } else if (typeof entry === 'string') {
        datasets[key] = { exists: true, value: entry, valueEncoding: 'local-storage-raw-v1' };
      } else {
        datasets[key] = entry;
      }
    });
    if (!Object.keys(datasets).length) return null;
    return {
      ...payload,
      format: knownFormats.has(payload.format) ? payload.format : 'cashtop-backup-v1',
      tenantId: payload.tenantId || payload.companyId || payload.meta?.tenantId || payload.meta?.companyId || '',
      companyId: payload.companyId || payload.tenantId || payload.meta?.companyId || payload.meta?.tenantId || '',
      companyKey: payload.companyKey || payload.key || payload.meta?.companyKey || payload.meta?.key || '',
      companyName: payload.companyName || payload.meta?.companyName || '',
      datasets
    };
  }

  function remapImportedCompanyIdentity(value, sourceIdentity = {}, targetIdentity = {}) {
    const sourceTokens = new Set([sourceIdentity.tenantId, sourceIdentity.companyId, sourceIdentity.companyKey]
      .map(value => String(value || '').trim()).filter(Boolean));
    const targetTenant = String(targetIdentity.tenantId || targetIdentity.companyId || '').trim();
    const targetKey = String(targetIdentity.companyKey || '').trim();
    const visit = (node, depth = 0) => {
      if (depth > 30 || node === null || node === undefined) return node;
      if (Array.isArray(node)) return node.map(item => visit(item, depth + 1));
      if (typeof node !== 'object') return node;
      const output = {};
      Object.entries(node).forEach(([field, fieldValue]) => {
        if (field === 'tenantId' || field === 'companyId') {
          const token = String(fieldValue || '').trim();
          output[field] = (!token || sourceTokens.has(token)) && targetTenant ? targetTenant : fieldValue;
          return;
        }
        if (field === 'companyKey') {
          const token = String(fieldValue || '').trim();
          output[field] = (!token || sourceTokens.has(token)) && targetKey ? targetKey : fieldValue;
          return;
        }
        output[field] = visit(fieldValue, depth + 1);
      });
      return output;
    };
    return visit(value);
  }

  function remapImportedStorageValue(canonical, storageValue, backup, session) {
    if (canonical === 'cashtop_company_access' || ['cashtop_sms_template', 'cashtop_invoice_message_template'].includes(canonical)) return storageValue;
    const parsed = safeJson(storageValue, null);
    if (parsed === null || parsed === undefined) return storageValue;
    const remapped = remapImportedCompanyIdentity(parsed, {
      tenantId: backup.tenantId, companyId: backup.companyId, companyKey: backup.companyKey
    }, {
      tenantId: session.tenantId || session.companyId, companyId: session.companyId || session.tenantId, companyKey: session.companyKey
    });
    return JSON.stringify(remapped);
  }

  async function importBackupFile(file) {
    if (!isBackupImportEnabled()) throw new Error('استيراد النسخ مقفل لهذا المفتاح. افتحه من لوحة المشرف أولاً.');
    const text = await file.text();
    const parsedBackup = safeJson(text, null);
    const backup = normalizeBackupEnvelope(parsedBackup);
    if (!backup || !backup.datasets) throw new Error('صيغة النسخة الاحتياطية غير صحيحة أو لا تحتوي بيانات قابلة للاستيراد.');
    const session = getSession() || {};
    const currentCompany = String(session.tenantId || session.companyId || session.companyKey || '');
    const currentCompanyKey = String(session.companyKey || '').trim().toUpperCase();
    const backupTenant = String(backup.tenantId || backup.companyId || backup.companyKey || '');
    const backupCompanyKey = String(backup.companyKey || '').trim().toUpperCase();
    const crossCompanyImport = Boolean(
      (backupTenant && currentCompany && backupTenant !== currentCompany) ||
      (backupCompanyKey && currentCompanyKey && backupCompanyKey !== currentCompanyKey)
    );
    // R95: business data can be restored from any company/key backup, including
    // legacy envelopes. Embedded tenant references are remapped to the current
    // company, while login, subscription and manager identity stay untouched.

    const importedKeys = [];
    const currentAccess = getCompanyAccess();
    const protectedAccessFields = [
      'tenantId', 'companyId', 'companyKey', 'companyName', 'status', 'plan', 'customLimits', 'startAt', 'endAt',
      'durationUnit', 'durationQuantity', 'backupImportEnabled', 'authVersion', 'deleted', 'manager'
    ];

    // Local-first restore. Only datasets whose raw value really changes are
    // queued, so a large backup containing identical sections costs zero writes
    // for those unchanged sections.
    Object.entries(backup.datasets).forEach(([key, entry]) => {
      if (!isManagedKey(key)) return;
      const canonical = canonicalKey(key);
      if (backup.format === 'cashtop-backup-v6' && backup.financialGroupDatasets && FINANCIAL_GROUP_SCOPED_KEYS.has(canonical)) return;
      const exactRaw = entry && typeof entry === 'object' && entry.valueEncoding === 'local-storage-raw-v1';
      const oldRaw = getRawCompanyDataset(canonical);

      // الاستعادة دمج/UPSERT: ما هو موجود محلياً يبقى، والنسخة الجديدة تكتب فوق السجل المطابق فقط.
      // لذلك غياب مجموعة من ملف النسخة لا يعني حذف المجموعة الحالية.
      if (exactRaw && entry.exists === false) return;

      let storageValue = exactRaw
        ? String(entry.value ?? '')
        : (typeof entry === 'string' && ['cashtop_sms_template', 'cashtop_invoice_message_template'].includes(canonical)
          ? entry
          : JSON.stringify(entry));

      if (canonical === 'cashtop_company_access') {
        // نسخة شركة/مفتاح آخر لا تلمس ملف الاشتراك أو تسجيل الدخول الحالي مطلقاً.
        if (crossCompanyImport) return;
        const importedAccess = safeJson(storageValue, {}) || {};
        // عند نقل نسخة من شركة أخرى لا نستورد ملف الترخيص/الدخول الخاص بها نهائياً.
        // في النسخة التابعة لنفس الشركة يمكن الاحتفاظ بالحقول غير الحساسة فقط.
        const mergedAccess = crossCompanyImport ? { ...currentAccess } : { ...importedAccess };
        protectedAccessFields.forEach(field => {
          if (Object.prototype.hasOwnProperty.call(currentAccess, field)) mergedAccess[field] = currentAccess[field];
        });
        mergedAccess.tenantId = session.tenantId || session.companyId || currentAccess.tenantId || currentAccess.companyId || currentCompany || '';
        mergedAccess.companyId = mergedAccess.tenantId;
        mergedAccess.companyKey = session.companyKey || currentAccess.companyKey || '';
        mergedAccess.companyName = currentAccess.companyName || session.companyName || mergedAccess.companyName || '';
        mergedAccess.status = currentAccess.status || session.status || mergedAccess.status || 'active';
        mergedAccess.plan = currentAccess.plan || session.plan || mergedAccess.plan || 'pro';
        mergedAccess.backupImportEnabled = currentAccess.backupImportEnabled === true;
        storageValue = JSON.stringify(mergedAccess);
      } else {
        storageValue = remapImportedStorageValue(canonical, storageValue, backup, session);
        storageValue = mergeBackupDataset(canonical, oldRaw, storageValue);
      }

      if (oldRaw === storageValue) return;
      const result = setRawCompanyDataset(canonical, storageValue, { action: 'backup-import', enqueue: false, audit: false });
      if (!result?.changed) return;
      enqueueSyncOperation(canonical, { forceReplace: true });
      importedKeys.push(canonical);
    });

    if (backup.format === 'cashtop-backup-v6' && backup.financialGroupDatasets && typeof backup.financialGroupDatasets === 'object') {
      const activeGroupAtRestore = currentFinancialGroupId(currentCompany);
      Object.entries(backup.financialGroupDatasets).forEach(([groupId, groupDatasets]) => {
        if (!groupDatasets || typeof groupDatasets !== 'object') return;
        Object.entries(groupDatasets).forEach(([key, entry]) => {
          const canonical = canonicalKey(key);
          if (!FINANCIAL_GROUP_SCOPED_KEYS.has(canonical) || !DATA_KEYS.includes(canonical)) return;
          const exactRaw = entry && typeof entry === 'object' && entry.valueEncoding === 'local-storage-raw-v1';
          if (exactRaw && entry.exists === false) return;
          let storageValue = exactRaw ? String(entry.value ?? '') : JSON.stringify(entry);
          const physicalKey = namespaceKey(canonical, currentCompany, groupId);
          const physicalMetaKey = metaKey(canonical, currentCompany, groupId);
          const oldRaw = rawGet(physicalKey);
          storageValue = remapImportedStorageValue(canonical, storageValue, backup, session);
          storageValue = mergeBackupDataset(canonical, oldRaw, storageValue);
          if (oldRaw === storageValue) return;
          rawSet(physicalKey, storageValue);
          const previousMeta = safeJson(rawGet(physicalMetaKey), {}) || {};
          rawSet(physicalMetaKey, JSON.stringify({
            ...previousMeta, updatedAt: Date.now(), revision: Number(previousMeta.revision || 0) + 1,
            deviceId: getDeviceId(), page: FILE, financialGroupId: groupId, source: 'backup-import-v6', seeded: false
          }));
          // turso-sync الحالي مربوط بالمجموعة التي فُتحت معها الصفحة. نرفع هذه
          // المجموعة الآن، وتبقى بقية المجموعات محفوظة محلياً كاملة حتى فتحها.
          if (String(groupId) === String(activeGroupAtRestore)) {
            enqueueSyncOperation(canonical, { forceReplace: true });
            importedKeys.push(canonical);
          }
        });
      });
    }

    showToast(crossCompanyImport
      ? 'تم نقل بيانات النسخة من الشركة الأخرى إلى الشركة الحالية مع إبقاء المفتاح والخطة وتسجيل الدخول كما هي.'
      : 'تم دمج النسخة محلياً دون تكرار السجلات، ويجري رفع التغييرات الآن.', 'success');
    const syncResult = await syncImportedData(importedKeys);
    if (Number(syncResult?.remaining || getSyncQueue().length) === 0) {
      showToast('تمت مزامنة النسخة الاحتياطية بالكامل مع قاعدة البيانات.', 'success');
    } else if (getSyncQueue().length) {
      showToast(`تم حفظ النسخة محلياً وبقي ${getSyncQueue().length} عملية للمزامنة التلقائية.`, 'warning');
    }
    setTimeout(() => location.reload(), 850);
  }

  function applyRemoteDataset(key, value, meta) {
    const canonical = canonicalKey(key);
    const ns = namespaceKey(canonical);
    const previousRaw = rawGet(ns);
    const previousMeta = safeJson(rawGet(metaKey(canonical)), {}) || {};
    const incomingMeta = meta || { updatedAt: Date.now(), source: 'remote' };
    let storageValue = typeof value === 'string' ? value : JSON.stringify(value);

    // A dataset-level remote delete is too destructive for business records.
    // Keep any existing local rows; item-level deletions are handled by tombstones.
    if (value == null && LOSSLESS_RECORD_DATASETS.has(canonical) && normalizeArrayValue(safeJson(previousRaw, []), []).length) {
      return false;
    }
    if (value == null && LOSSLESS_OBJECT_DATASETS.has(canonical) && previousRaw != null) return false;

    // R106 lossless reconciliation: for record datasets, merge remote + local
    // instead of replacing the whole array. This is the central protection
    // against a shorter/stale device snapshot erasing products or invoices.
    if (value != null && LOSSLESS_RECORD_DATASETS.has(canonical)) {
      const localRows = normalizeArrayValue(safeJson(previousRaw, []), []);
      const remoteRows = normalizeArrayValue(safeJson(storageValue, []), []);
      const tombstones = {
        ...(previousMeta.recordTombstones && typeof previousMeta.recordTombstones === 'object' ? previousMeta.recordTombstones : {}),
        ...(incomingMeta.recordTombstones && typeof incomingMeta.recordTombstones === 'object' ? incomingMeta.recordTombstones : {})
      };
      storageValue = JSON.stringify(mergeLosslessRecordArrays(localRows, remoteRows, tombstones));
    } else if (value != null && LOSSLESS_OBJECT_DATASETS.has(canonical)) {
      const localObject = safeJson(previousRaw, {}) || {};
      const remoteObject = safeJson(storageValue, {}) || {};
      storageValue = JSON.stringify(mergeLosslessObjectDataset(canonical, localObject, remoteObject));
    }

    if (PRODUCT_IMAGE_HISTORY_KEYS.has(canonical) && value != null) storageValue = stripInvoiceItemImageFieldsRaw(storageValue);

    const mergedMeta = {
      ...previousMeta,
      ...incomingMeta,
      recordTombstones: {
        ...(previousMeta.recordTombstones && typeof previousMeta.recordTombstones === 'object' ? previousMeta.recordTombstones : {}),
        ...(incomingMeta.recordTombstones && typeof incomingMeta.recordTombstones === 'object' ? incomingMeta.recordTombstones : {})
      }
    };
    suppressEvents = true;
    try {
      rawSet(ns, storageValue);
      rawSet(metaKey(canonical), JSON.stringify(mergedMeta));
    } finally {
      suppressEvents = false;
    }
    dispatchLogicalStorageEvents(canonical, previousRaw, storageValue);
    window.dispatchEvent(new CustomEvent('cashtop:remote-applied', { detail: { key: canonical, lossless: LOSSLESS_RECORD_DATASETS.has(canonical) || LOSSLESS_OBJECT_DATASETS.has(canonical) } }));
    return true;
  }


  function normalizeDateValue(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function getTaxSettings() {
    const cfg = Object.assign({
      enabled: false, salesRate: 0, purchaseRate: 0,
      salesBearer: 'customer', purchaseBearer: 'business', pricesIncludeTax: false,
      rates: [], defaultSalesTaxId: null, defaultPurchaseTaxId: null
    }, safeJson(localStorage.getItem('cashtop_tax_settings'), {}) || {});
    cfg.rates = Array.isArray(cfg.rates) ? cfg.rates.map((item, index) => ({
      id: String(item?.id ?? `tax_${index}`),
      name: String(item?.name || 'ضريبة').trim() || 'ضريبة',
      rate: Math.max(0, Math.min(100, Number(item?.rate) || 0)),
      active: item?.active !== false
    })).filter(item => item.active) : [];
    if (cfg.defaultSalesTaxId != null) cfg.defaultSalesTaxId = String(cfg.defaultSalesTaxId);
    if (cfg.defaultPurchaseTaxId != null) cfg.defaultPurchaseTaxId = String(cfg.defaultPurchaseTaxId);
    return cfg;
  }

  function getTaxRates() {
    return getTaxSettings().rates.map(item => ({ ...item }));
  }

  function calculateTax(amount, kind = 'sales', taxSelection = 'default') {
    const cfg = getTaxSettings();
    const base = Math.max(0, Number(amount) || 0);
    const bearer = kind === 'purchase' ? cfg.purchaseBearer : cfg.salesBearer;
    const charged = kind === 'sales' ? bearer === 'customer' : bearer === 'business';
    const selection = String(taxSelection ?? 'default');
    let selectedTax = null;
    const explicitTaxSelection = selection.startsWith('tax:');
    if (selection === 'none') {
      return { enabled: false, rate: 0, tax: 0, bearer, charged: false, included: false, total: base, taxId: null, taxName: 'بدون ضريبة' };
    }
    if (selection.startsWith('tax:')) {
      const wantedId = selection.slice(4);
      selectedTax = cfg.rates.find(item => String(item.id) === wantedId) || null;
    } else if (taxSelection && typeof taxSelection === 'object') {
      const wantedId = taxSelection.id ?? taxSelection.taxId;
      selectedTax = cfg.rates.find(item => String(item.id) === String(wantedId)) || null;
      if (!selectedTax && Number.isFinite(Number(taxSelection.rate))) selectedTax = { id: wantedId ?? null, name: taxSelection.name || taxSelection.taxName || 'ضريبة', rate: Number(taxSelection.rate), active: true };
    } else if (selection === 'default') {
      const defaultId = kind === 'purchase' ? cfg.defaultPurchaseTaxId : cfg.defaultSalesTaxId;
      selectedTax = cfg.rates.find(item => String(item.id) === String(defaultId)) || cfg.rates[0] || null;
    }
    const legacyRate = Math.max(0, Number(kind === 'purchase' ? cfg.purchaseRate : cfg.salesRate) || 0);
    const rate = Math.max(0, Number(selectedTax?.rate ?? (explicitTaxSelection ? 0 : legacyRate)) || 0);
    const enabled = Boolean(cfg.enabled && rate > 0);
    if (!enabled) return { enabled: false, rate, tax: 0, bearer, charged: false, included: false, total: base, taxId: selectedTax?.id ?? null, taxName: selectedTax?.name || '' };
    const included = Boolean(cfg.pricesIncludeTax);
    const tax = included ? base * rate / (100 + rate) : base * rate / 100;
    const total = included ? base : base + (charged ? tax : 0);
    return { enabled, rate, tax, bearer, charged, included, total, taxId: selectedTax?.id ?? null, taxName: selectedTax?.name || '' };
  }

  function getSmartNotifications() {
    if (!isManagerSession()) return [];
    const cfg = getNotificationSettings();
    const currencyCfg = window.CashtopMulti?.getCurrencyConfig?.() || { base: { symbol: '₪', code: 'ILS' } };
    const baseCurrencySymbol = currencyCfg.base?.symbol || currencyCfg.base?.code || '₪';
    if (cfg.enabled === false) return [];
    const now = Date.now();
    const day = 86400000;
    const products = normalizeArrayValue(localStorage.getItem('cashtop_products'), []);
    const customers = normalizeArrayValue(localStorage.getItem('cashtop_customers'), []);
    const invoices = normalizeArrayValue(localStorage.getItem('cashtop_invoices'), []);
    const out = [];

    products.forEach(product => {
      const stock = Number(product.stockPieces ?? product.stock ?? 0) || 0;
      const hasLow = Object.prototype.hasOwnProperty.call(product, 'lowStockThreshold') && Number.isFinite(Number(product.lowStockThreshold));
      const hasLegacy = Object.prototype.hasOwnProperty.call(product, 'alertLimit') && Number.isFinite(Number(product.alertLimit));
      // إعداد الإشعارات العام لا يتغلب على الحد المخصص للصنف.
      // البيانات القديمة: إذا كان lowStockThreshold ما زال على الحد العام
      // بينما alertLimit يحتوي قيمة مخصصة، نعتمد القيمة المخصصة القديمة.
      const productThreshold = product.lowStockThresholdExplicit === true && hasLow
        ? Math.max(0, Number(product.lowStockThreshold))
        : (hasLow && hasLegacy && Math.max(0, Number(product.lowStockThreshold)) === Math.max(0, Number(cfg.lowStockThreshold || 0)) && Math.max(0, Number(product.alertLimit)) !== Math.max(0, Number(cfg.lowStockThreshold || 0))
          ? Math.max(0, Number(product.alertLimit))
          : (hasLow ? Math.max(0, Number(product.lowStockThreshold)) : (hasLegacy ? Math.max(0, Number(product.alertLimit)) : null)));
      if (productThreshold === null) return;
      if (stock <= productThreshold) {
        out.push({
          id: `stock_${product.id}`, type: 'stock', severity: stock <= 0 ? 'danger' : 'warning',
          title: stock <= 0 ? 'نفاد مخزون' : 'مخزون منخفض',
          message: `${product.name || 'منتج'}: المتوفر ${stock} ${product.pieceName || 'قطعة'} — الحد الأدنى المخصص للصنف ${productThreshold}`,
          href: 'products.html', date: now
        });
      }

      const expiryWarningDays = Math.max(1, Number(cfg.expiryWarningDays || 30));
      const lots = normalizeArrayValue(product.inventoryLots || [], []);
      lots.forEach(lot => {
        const remaining = Math.max(0, Number(lot.remainingPieces ?? lot.quantityPieces ?? 0));
        const expiryTime = normalizeDateValue(lot.expiryDate);
        if (!remaining || !expiryTime) return;
        const daysLeft = Math.ceil((expiryTime - now) / day);
        if (daysLeft < 0) {
          out.push({
            id: `expired_${product.id}_${lot.id || lot.expiryDate}`, type: 'expiry', severity: 'danger',
            title: 'منتج منتهي الصلاحية',
            message: `${product.name || 'منتج'}: كمية ${remaining} انتهت بتاريخ ${lot.expiryDate}`,
            href: 'notifications.html', date: expiryTime, productId: product.id, lotId: lot.id || ''
          });
        } else if (daysLeft <= expiryWarningDays) {
          out.push({
            id: `expiring_${product.id}_${lot.id || lot.expiryDate}`, type: 'expiry', severity: 'warning',
            title: 'منتج أوشك على انتهاء الصلاحية',
            message: `${product.name || 'منتج'}: كمية ${remaining} تنتهي خلال ${daysLeft} يوم`,
            href: 'notifications.html', date: expiryTime, productId: product.id, lotId: lot.id || ''
          });
        }
      });
    });

    customers.forEach(customer => {
      const balance = Number(customer.balance || 0);
      const customerInvoices = invoices.filter(inv => inv.status !== 'draft' &&
        (String(inv.customerId || '') === String(customer.id || '') || inv.customer === customer.name));
      const lastInvoice = customerInvoices.slice().sort((a, b) => normalizeDateValue(b.date) - normalizeDateValue(a.date))[0];
      const oldestDebt = customerInvoices.filter(inv => Number(inv.debt || 0) > 0)
        .sort((a, b) => normalizeDateValue(a.date) - normalizeDateValue(b.date))[0];
      if (balance > 0 && oldestDebt && now - normalizeDateValue(oldestDebt.date) >= Number(cfg.debtOverdueDays || 30) * day) {
        out.push({
          id: `debt_${customer.id}`, type: 'debt', severity: 'danger', title: 'تأخر في سداد الدين',
          message: `${customer.name}: رصيد مستحق ${balance.toFixed(2)} ${baseCurrencySymbol} منذ أكثر من ${cfg.debtOverdueDays} يوماً`,
          href: 'customers.html', date: normalizeDateValue(oldestDebt.date)
        });
      }
      const lastDate = normalizeDateValue(lastInvoice?.date || customer.lastPurchaseAt || customer.lastPurchaseDate || customer.createdAt);
      if (lastDate && now - lastDate >= Number(cfg.inactiveCustomerDays || 45) * day) {
        out.push({
          id: `inactive_${customer.id}`, type: 'inactive', severity: 'info', title: 'عميل لم يشترِ منذ فترة',
          message: `${customer.name}: لم تُسجل له عملية شراء منذ ${Math.floor((now - lastDate) / day)} يوماً`,
          href: 'customers.html', date: lastDate
        });
      }
    });

    const employees = normalizeArrayValue(localStorage.getItem('cashtop_employees'), []);
    const salaryPayments = normalizeArrayValue(localStorage.getItem('cashtop_salary_payments'), []);
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    employees.filter(employee => employee.status === 'active' && Number(employee.salary || 0) > 0).forEach(employee => {
      const salaryDay = Math.min(31, Math.max(1, Number(employee.salaryDay || 1)));
      const dueDate = new Date(today.getFullYear(), today.getMonth(), salaryDay);
      const startDate = employee.salaryStartDate ? new Date(`${employee.salaryStartDate}T00:00:00`) : null;
      const startedBeforeThisDueDate = !startDate || !Number.isFinite(startDate.getTime()) || startDate <= dueDate;
      const alreadyPaid = salaryPayments.some(payment => String(payment.employeeId) === String(employee.id) && payment.salaryMonth === monthKey && payment.status !== 'reversed');
      if (today >= dueDate && startedBeforeThisDueDate && !alreadyPaid) {
        out.push({
          id: `salary_${employee.id}_${monthKey}`, type: 'salary', severity: 'warning', title: 'راتب موظف مستحق',
          message: `${employee.name || 'موظف'}: راتب ${Number(employee.salary).toFixed(3).replace(/\.?0+$/, '')} ${baseCurrencySymbol} مستحق للصرف`,
          href: 'notifications.html', date: now, employeeId: employee.id, salaryMonth: monthKey,
          amount: Number(employee.salary), accountId: employee.salaryAccountId || ''
        });
      }
    });
    const currentRole = String((getSession() || {}).role || '').toLowerCase();
    if (currentRole !== 'employee') {
      const workers = normalizeArrayValue(localStorage.getItem('cashtop_workers'), []);
      const todayKey = new Date().toISOString().slice(0,10);
      workers.forEach(worker => {
        const type = String(worker.salaryType || '');
        const amount = Math.max(0, Number(worker.salaryAmount || 0));
        if (!amount || !['monthly','weekly','daily'].includes(type)) return;
        let due = false, dueKey = '';
        if (type === 'monthly') {
          const payDay = Math.min(31, Math.max(1, Number(worker.payDay || 1)));
          const currentMonth = todayKey.slice(0,7);
          const lastMonth = String(worker.lastPaidAt || '').slice(0,7);
          due = today.getDate() >= payDay && lastMonth !== currentMonth;
          dueKey = currentMonth;
        } else {
          const target = String(worker.payDateRaw || '');
          due = Boolean(target && target <= todayKey);
          dueKey = target;
        }
        if (!due) return;
        out.push({ id:`worker_salary_${worker.id}_${dueKey}`, type:'workerSalary', severity:'warning', title:'أجر عامل مستحق', message:`${worker.name || 'عامل'}: ${amount.toFixed(3).replace(/\.?0+$/,'')} ${baseCurrencySymbol} مستحق للقبض`, href:'notifications.html', date:now, workerId:worker.id, amount, accountId:worker.vaultId || '' });
      });
    }

    return out.sort((a, b) => (a.severity === 'danger' ? -1 : 0) - (b.severity === 'danger' ? -1 : 0));
  }

  function mountHeaderActions() {
    const actions = document.querySelector('.ct-topbar-actions');
    if (!actions || actions.querySelector('.ct-notification-button')) return;
    const quick = document.createElement('div');
    quick.className = 'ct-quick-actions';
    quick.innerHTML = `
      <a href="customers.html" class="ct-quick-button"><i class="fa-solid fa-user-plus"></i><span>إضافة عميل</span></a>
      <a href="cashier.html" class="ct-quick-button"><i class="fa-solid fa-file-invoice"></i><span>فاتورة</span></a>
      <a href="invoices.html" class="ct-quick-button"><i class="fa-solid fa-file-lines"></i><span>الفواتير</span></a>`;
    actions.insertBefore(quick, actions.firstChild);
    const showManagerBell = isManagerSession();
    const bell = document.createElement('a');
    bell.href = 'notifications.html';
    bell.className = 'ct-icon-button ct-notification-button';
    bell.title = 'الإشعارات';
    bell.innerHTML = '<i class="fa-solid fa-bell"></i><span class="ct-icon-badge" id="ctNotificationBadge">0</span>';
    const sync = document.getElementById('ctSyncButton');
    if (sync && !sync.querySelector('#ctSyncBadge')) {
      const syncBadge = document.createElement('span');
      syncBadge.className = 'ct-sync-badge';
      syncBadge.id = 'ctSyncBadge';
      sync.appendChild(syncBadge);
    }
    // R125: لا نعرض خط تقدم المزامنة في الهيدر. المحرك يعمل بالخلفية فقط.
    const oldSyncProgress = sync?.querySelector?.('#ctSyncProgress');
    if (oldSyncProgress) oldSyncProgress.remove();
    if (showManagerBell) {
      if (sync) sync.insertAdjacentElement('afterend', bell);
      else actions.insertBefore(bell, actions.firstChild);
      updateNotificationBadge();
    }
    updateSyncBadge();
  }

  function updateNotificationBadge() {
    const badge = document.getElementById('ctNotificationBadge');
    if (!badge) return;
    const count = getSmartNotifications().length;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
  }

  function injectSvgSprite() {
    if (document.getElementById('ctSvgSprite')) return;
    const wrap = document.createElement('div');
    wrap.id = 'ctSvgSprite';
    wrap.hidden = true;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
      <symbol id="cti-home" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
      <symbol id="cti-menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
      <symbol id="cti-box" viewBox="0 0 24 24"><path d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" fill="none" stroke="currentColor" stroke-width="1.7"/></symbol>
      <symbol id="cti-users" viewBox="0 0 24 24"><path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6M2 21v-3c0-3 2.5-5 6-5s6 2 6 5v3m2-8c3.2.2 6 2 6 5v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></symbol>
      <symbol id="cti-receipt" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></symbol>
      <symbol id="cti-wallet" viewBox="0 0 24 24"><path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h12M16 11h5v4h-5a2 2 0 0 1 0-4Z" fill="none" stroke="currentColor" stroke-width="1.7"/></symbol>
      <symbol id="cti-settings" viewBox="0 0 24 24"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.2 13.4c.1-.5.1-1 0-1.5l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.3-.8L15.2 4h-4l-.4 2.6c-.5.2-.9.5-1.3.8l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 0 1.5l-2 1.5 2 3.5 2.4-1c.4.3.8.6 1.3.8l.4 2.6h4l.4-2.6c.5-.2.9-.5 1.3-.8l2.4 1 2-3.5-2.1-1.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
      <symbol id="cti-cash" viewBox="0 0 24 24"><path d="M3 7h18v12H3zM7 11h4v4H7zm8 1h3M5 4h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
      <symbol id="cti-chevron" viewBox="0 0 24 24"><path d="m7 9 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
      <symbol id="cti-sync" viewBox="0 0 24 24"><path d="M7.2 18.5h10.3a4 4 0 0 0 .7-7.9A6.2 6.2 0 0 0 6.4 8.4 5.1 5.1 0 0 0 7.2 18.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m9 12 3-3 3 3m-3-3v7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="cti-bell" viewBox="0 0 24 24"><path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
      <symbol id="cti-user" viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM3 22a9 9 0 0 1 18 0" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
      <symbol id="cti-logout" viewBox="0 0 24 24"><path d="M10 4H4v16h6M14 8l4 4-4 4m4-4H8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    </svg>`;
    document.body.appendChild(wrap);
  }

  function upgradeShellIconsToSvg() {
    injectSvgSprite();
    const map = {
      'fa-house':'home','fa-bars':'menu','fa-boxes-stacked':'box','fa-box-open':'box','fa-cubes':'box',
      'fa-file-invoice-dollar':'receipt','fa-file-invoice':'receipt','fa-file-lines':'receipt',
      'fa-users':'users','fa-users-gear':'users','fa-user-plus':'users','fa-wallet':'wallet',
      'fa-sliders':'settings','fa-cash-register':'cash','fa-chevron-down':'chevron',
      'fa-rotate':'sync','fa-bell':'bell','fa-user-shield':'user','fa-right-from-bracket':'logout'
    };
    document.querySelectorAll('.ct-sidebar i, .ct-topbar i, .ct-bottom-nav i').forEach(icon => {
      const cls = [...icon.classList].find(c => map[c]);
      if (!cls) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('ct-svg-icon');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#cti-${map[cls]}`);
      svg.appendChild(use);
      icon.replaceWith(svg);
    });
  }

  function openArchiveDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('cashtop-archive-v1', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'archiveKey' });
          store.createIndex('companyDataset', 'companyDataset', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function archiveRecords(dataset, records) {
    if (!records?.length || !('indexedDB' in window)) return 0;
    const db = await openArchiveDb();
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    const companyId = companyIdFromSession();
    records.forEach((record, index) => {
      const cleanRecord = PRODUCT_IMAGE_HISTORY_KEYS.has(canonicalKey(dataset))
        ? stripInvoiceItemImageFieldsFromRows([record])[0]
        : record;
      const id = cleanRecord?.id || cleanRecord?.refId || `${normalizeDateValue(cleanRecord?.date)}_${index}`;
      store.put({
        archiveKey: `${companyId}::${dataset}::${id}`,
        companyDataset: `${companyId}::${dataset}`,
        companyId, dataset, id, date: normalizeDateValue(cleanRecord?.date || cleanRecord?.createdAt || cleanRecord?.updatedAt),
        record: cleanRecord, archivedAt: Date.now()
      });
    });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
    return records.length;
  }

  async function readArchivedRecords(dataset) {
    if (!('indexedDB' in window)) return [];
    const db = await openArchiveDb();
    const tx = db.transaction('records', 'readonly');
    const index = tx.objectStore('records').index('companyDataset');
    const request = index.getAll(`${companyIdFromSession()}::${dataset}`);
    const rows = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.map(row => row.record);
  }

  async function restoreArchivedBusinessRecordsV106(options = {}) {
    const groups = getFinancialGroups();
    // Older archive rows did not store the financial-group id. Automatic restore
    // is therefore safe only when the company has a single financial group.
    // Multi-group companies keep the archive untouched rather than guessing.
    if (groups.length > 1 && options.force !== true) return { skipped:true, reason:'multiple-financial-groups', restored:0 };
    const marker = `ct_r106_archive_restore::${encodeURIComponent(companyIdFromSession())}::${encodeURIComponent(currentFinancialGroupId())}`;
    if (rawGet(marker) === '1' && options.force !== true) return { skipped:true, restored:0 };

    const keys = ['cashtop_invoices','cashtop_purchases'];
    const changedKeys = [];
    let restored = 0;
    for (const key of keys) {
      const archived = await readArchivedRecords(key).catch(() => []);
      if (!archived.length) continue;
      const currentRaw = getRawCompanyDataset(key);
      const current = normalizeArrayValue(safeJson(currentRaw, []), []);
      const cleanArchived = stripInvoiceItemImageFieldsFromRows(archived);
      const tombstones = safeJson(rawGet(metaKey(key)), {})?.recordTombstones || {};
      const merged = mergeLosslessRecordArrays(current, cleanArchived, tombstones);
      if (merged.length <= current.length) continue;
      const cleanRaw = JSON.stringify(sortNewestFirstRecords(merged));
      const result = setRawCompanyDataset(key, cleanRaw, {
        action:'r106-restore-archived-records', bypassQuota:true, audit:false
      });
      if (result?.changed) {
        restored += merged.length - current.length;
        changedKeys.push(key);
      }
    }
    rawSet(marker, '1');
    if (changedKeys.length) {
      await commitCriticalData(changedKeys).catch(() => ({ ok:false }));
      await preservePendingSyncState().catch(() => false);
      window.dispatchEvent(new CustomEvent('cashtop:r106-recovery', { detail:{ restored, keys:changedKeys } }));
    }
    return { restored, keys:changedKeys };
  }

  async function compactCompletedData(force = false) {
    const indexData = safeJson(localStorage.getItem('cashtop_archive_index'), {}) || {};
    const last = Number(indexData.lastCompactionAt || 0);
    if (!force && Date.now() - last < 6 * 60 * 60 * 1000) return { skipped: true };
    const settings = Object.assign({ invoiceLimit: 1200, historyLimit: 1500, completedAgeDays: 365 },
      safeJson(localStorage.getItem('cashtop_settings'), {})?.storage || {});
    const ageDays = Math.max(7, Number(settings.completedAgeDays || 365));
    const cutoff = Date.now() - ageDays * 86400000;
    const policies = [
      ['cashtop_invoices', Math.max(100, Number(settings.invoiceLimit || 1200)), item => item.status !== 'draft'],
      ['cashtop_purchases', Math.max(100, Number(settings.invoiceLimit || 1200)), () => true],
      ['cashtop_transfer_history', Math.max(100, Number(settings.historyLimit || 1500)), () => true],
      ['cashtop_branch_transfer_history', Math.max(100, Number(settings.historyLimit || 1500)), () => true],
      ['cashtop_manufacturing_orders', Math.max(100, Number(settings.historyLimit || 1500)), item => item.status === 'completed' || !item.status]
    ];
    const archivedCounts = Object.assign({}, indexData.archivedCounts || {});
    const runCounts = {};
    for (const [key, limit, completed] of policies) {
      const list = safeJson(localStorage.getItem(key), []) || [];
      if (!Array.isArray(list) || !list.length) continue;
      const sortedCompleted = list.filter(completed).slice().sort((a, b) => normalizeDateValue(a.date || a.createdAt) - normalizeDateValue(b.date || b.createdAt));
      const candidates = [];
      const selected = new Set();
      sortedCompleted.forEach(item => {
        const time = normalizeDateValue(item.date || item.createdAt || item.updatedAt);
        if (time > 0 && time < cutoff) { candidates.push(item); selected.add(item); }
      });
      const projectedLength = list.length - candidates.length;
      const overflow = Math.max(0, projectedLength - limit);
      if (overflow) {
        sortedCompleted.filter(item => !selected.has(item)).slice(0, overflow).forEach(item => {
          candidates.push(item); selected.add(item);
        });
      }
      if (!candidates.length) continue;
      await archiveRecords(key, candidates);
      const kept = list.filter(item => !selected.has(item));
      localStorage.setItem(key, JSON.stringify(kept));
      archivedCounts[key] = Number(archivedCounts[key] || 0) + candidates.length;
      runCounts[key] = candidates.length;
    }
    const audit = safeJson(localStorage.getItem('cashtop_audit_log'), []) || [];
    if (audit.length > 100) localStorage.setItem('cashtop_audit_log', JSON.stringify(audit.slice(-100)));
    const result = { lastCompactionAt: Date.now(), archivedCounts, lastRunCounts: runCounts };
    localStorage.setItem('cashtop_archive_index', JSON.stringify(result));
    return result;
  }

  let ctActiveSelect = null;
  let ctSelectPopover = null;
  let ctSelectBackdrop = null;

  function closeModernSelect(restoreFocus = false) {
    const select = ctActiveSelect;
    ctSelectPopover?.remove();
    ctSelectBackdrop?.remove();
    // WebView may discard a JS reference while leaving the fixed backdrop in DOM.
    // Remove any orphaned select layer so it can never block the page controls.
    document.querySelectorAll('.ct-select-popover, .ct-select-backdrop').forEach(element => element.remove());
    ctSelectPopover = null;
    ctSelectBackdrop = null;
    ctActiveSelect = null;
    document.querySelectorAll('.ct-select-is-open').forEach(element => element.classList.remove('ct-select-is-open'));
    if (restoreFocus && select && document.contains(select)) {
      try { select.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function closeTransientUi(options = {}) {
    closeModernSelect(false);
    if (options.closeSidebar !== false) toggleSidebar(false);
    document.documentElement.classList.remove('ct-ui-locked');
    document.body?.classList.remove('ct-ui-locked');
  }

  function selectBoundaryPosition(popover, select) {
    if (!popover || !select) return;
    const rect = select.getBoundingClientRect();
    const margin = 8;
    const width = Math.max(160, Math.min(Math.min(420, window.innerWidth - 16), rect.width));
    popover.style.width = `${width}px`;
    const renderedHeight = popover.getBoundingClientRect().height || popover.scrollHeight || 0;
    const measuredHeight = Math.min(Math.max(42, renderedHeight), 420, Math.max(42, window.innerHeight - margin * 2));
    const direction = String(select.dataset.ctDropdownDirection || 'auto').toLowerCase();
    let top = rect.bottom + 6;
    if (direction === 'up') {
      // A forced-up menu stays above its control; if there is not enough room,
      // pin its top to the viewport and let the options area scroll internally.
      top = Math.max(margin, rect.top - measuredHeight - 6);
      popover.style.maxHeight = `${Math.max(80, rect.top - margin - 6)}px`;
    } else if (direction !== 'down' && top + measuredHeight > window.innerHeight - margin && rect.top > measuredHeight + margin) {
      top = rect.top - measuredHeight - 6;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - Math.min(measuredHeight, window.innerHeight - margin * 2) - margin));
    let left = rect.right - width;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function dispatchSelectChange(select) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openModernSelect(select) {
    if (!select || select.disabled || select.dataset.nativeSelect === 'true') return;
    if (ctActiveSelect === select) { closeModernSelect(true); return; }
    closeModernSelect(false);
    ctActiveSelect = select;
    select.classList.add('ct-select-is-open');

    const backdrop = document.createElement('div');
    backdrop.className = 'ct-select-backdrop';
    backdrop.addEventListener('pointerdown', event => { event.preventDefault(); closeModernSelect(true); });

    const popover = document.createElement('div');
    popover.className = 'ct-select-popover';
    popover.setAttribute('role', 'listbox');
    popover.setAttribute('aria-multiselectable', select.multiple ? 'true' : 'false');
    popover.addEventListener('pointerdown', event => event.stopPropagation());

    const optionsHost = document.createElement('div');
    optionsHost.className = 'ct-select-options';
    const sourceSelectOptions = [...select.options];
    const optionCount = sourceSelectOptions.filter(option => !option.hidden).length;
    let searchInput = null;

    if (optionCount > 8) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ct-select-search-wrap';
      searchInput = document.createElement('input');
      searchInput.className = 'ct-select-search';
      searchInput.type = 'search';
      searchInput.placeholder = 'ابحث داخل القائمة...';
      searchInput.autocomplete = 'off';
      searchWrap.appendChild(searchInput);
      popover.appendChild(searchWrap);
    }

    function renderOptions(query = '') {
      const normalized = String(query || '').trim().toLocaleLowerCase('ar');
      optionsHost.innerHTML = '';
      const matched = [];
      sourceSelectOptions.forEach((option, index) => {
        if (option.hidden) return;
        const label = (option.textContent || '').trim();
        if (normalized && !label.toLocaleLowerCase('ar').includes(normalized)) return;
        matched.push({ option, index, label });
      });

      // Never build thousands of option buttons just to open a dropdown. Keep
      // selected values first, then a small searchable window. The original
      // <select> remains complete, so business logic and saved values are not
      // changed at all.
      const softLimit = normalized ? 220 : 140;
      const selectedRows = matched.filter(row => row.option.selected);
      const restRows = matched.filter(row => !row.option.selected);
      const renderRows = [...selectedRows, ...restRows].slice(0, Math.max(softLimit, selectedRows.length));
      let visible = 0;
      let lastGroup = null;

      renderRows.forEach(({ option, index, label }) => {
        const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '';
        if (group && group !== lastGroup) {
          const groupEl = document.createElement('div');
          groupEl.className = 'ct-select-group';
          groupEl.textContent = group;
          optionsHost.appendChild(groupEl);
          lastGroup = group;
        } else if (!group) {
          lastGroup = null;
        }
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `ct-select-option${option.selected ? ' is-selected' : ''}`;
        row.disabled = option.disabled;
        row.dataset.optionIndex = String(index);
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', option.selected ? 'true' : 'false');
        const text = document.createElement('span');
        text.textContent = label || '—';
        const check = document.createElement('span');
        check.className = 'ct-select-check';
        check.textContent = option.selected ? '✓' : '';
        row.append(text, check);
        let longPressTimer = 0;
        let longPressStart = null;
        let longPressFired = false;
        const cancelLongPress = () => {
          if (longPressTimer) clearTimeout(longPressTimer);
          longPressTimer = 0;
          longPressStart = null;
        };
        row.addEventListener('pointerdown', event => {
          if (option.disabled || (event.button !== undefined && event.button !== 0)) return;
          longPressFired = false;
          longPressStart = { id:event.pointerId, x:event.clientX, y:event.clientY };
          longPressTimer = setTimeout(() => {
            longPressTimer = 0;
            if (!longPressStart) return;
            longPressFired = true;
            try { navigator.vibrate?.(18); } catch (_) {}
            select.dispatchEvent(new CustomEvent('cashtop:select-option-longpress', {
              bubbles:true,
              detail:{ select, option, optionIndex:index, value:option.value, label:label || '—' }
            }));
          }, 650);
        });
        row.addEventListener('pointermove', event => {
          if (!longPressStart || event.pointerId !== longPressStart.id) return;
          if (Math.hypot(event.clientX-longPressStart.x,event.clientY-longPressStart.y)>10) cancelLongPress();
        }, {passive:true});
        row.addEventListener('pointerup', cancelLongPress, {passive:true});
        row.addEventListener('pointercancel', cancelLongPress, {passive:true});
        row.addEventListener('click', event => {
          if (longPressFired) { longPressFired = false; event.preventDefault(); event.stopPropagation(); return; }
          if (option.disabled) return;
          if (select.multiple) {
            option.selected = !option.selected;
            dispatchSelectChange(select);
            renderOptions(searchInput?.value || '');
          } else {
            select.selectedIndex = index;
            closeModernSelect(false);
            dispatchSelectChange(select);
            select.focus({ preventScroll: true });
          }
        });
        optionsHost.appendChild(row);
        visible += 1;
      });
      if (!visible) {
        const empty = document.createElement('div');
        empty.className = 'ct-select-empty';
        empty.textContent = 'لا توجد خيارات مطابقة';
        optionsHost.appendChild(empty);
      } else if (matched.length > renderRows.length) {
        const hint = document.createElement('div');
        hint.className = 'ct-select-empty ct-select-more-hint';
        hint.textContent = `يوجد ${matched.length - renderRows.length} خيار إضافي — اكتب في البحث للوصول إليه بسرعة`;
        optionsHost.appendChild(hint);
      }
    }

    renderOptions();
    popover.appendChild(optionsHost);
    if (select.multiple) {
      const footer = document.createElement('div');
      footer.className = 'ct-select-footer';
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'ct-select-done';
      done.textContent = 'تم';
      done.addEventListener('click', () => closeModernSelect(true));
      footer.appendChild(done);
      popover.appendChild(footer);
    }
    let selectSearchTimer = 0;
    searchInput?.addEventListener('input', () => { clearTimeout(selectSearchTimer); selectSearchTimer = setTimeout(() => renderOptions(searchInput.value), 70); });

    document.body.append(backdrop, popover);
    ctSelectBackdrop = backdrop;
    ctSelectPopover = popover;
    selectBoundaryPosition(popover, select);
    requestAnimationFrame(() => searchInput?.focus({ preventScroll: true }));
  }

  function enhanceAllSelects(root = document) {
    const selects = [
      ...(root?.matches?.('select:not([data-ct-enhanced])') ? [root] : []),
      ...(root?.querySelectorAll?.('select:not([data-ct-enhanced])') || [])
    ];
    selects.forEach(select => {
      select.dataset.ctEnhanced = 'true';
      select.style.touchAction = 'pan-y';
      let gesture = null;
      let ignoreClickUntil = 0;
      select.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.pointerType === 'mouse') event.preventDefault();
        gesture = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          startedAt: performance.now(),
          moved: false
        };
      });
      select.addEventListener('pointermove', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 9) gesture.moved = true;
      }, { passive: true });
      select.addEventListener('pointercancel', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        gesture = null;
        ignoreClickUntil = performance.now() + 650;
      });
      select.addEventListener('pointerup', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const current = gesture;
        gesture = null;
        ignoreClickUntil = performance.now() + 650;
        const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
        const intentionalTap = !current.moved && distance <= 9 && (performance.now() - current.startedAt) < 900;
        if (!intentionalTap) return;
        event.preventDefault();
        event.stopPropagation();
        openModernSelect(select);
      });
      select.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (performance.now() < ignoreClickUntil) return;
        openModernSelect(select);
      });
      select.addEventListener('keydown', event => {
        if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          openModernSelect(select);
        } else if (event.key === 'Escape') {
          closeModernSelect(true);
        }
      });
    });
    if (!document.documentElement.dataset.ctSelectEvents) {
      document.documentElement.dataset.ctSelectEvents = 'true';
      let selectPositionFrame = 0;
      const scheduleSelectPosition = () => {
        if (!ctActiveSelect || selectPositionFrame) return;
        selectPositionFrame = requestAnimationFrame(() => {
          selectPositionFrame = 0;
          selectBoundaryPosition(ctSelectPopover, ctActiveSelect);
        });
      };
      window.addEventListener('resize', scheduleSelectPosition, { passive: true });
      window.addEventListener('scroll', scheduleSelectPosition, { capture: true, passive: true });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && ctActiveSelect) closeModernSelect(true);
      });
    }
  }


  /* ============================================================
   * R96 — Dedicated image storage (products + company branding)
   * Images live in the image storage service; only the public URL
   * is persisted in the normal company datasets.
   * ============================================================ */
  const IMAGE_STORAGE_CONFIG = Object.freeze({
    storageZone: 'amanwar1',
    pullHost: 'amanwar1.b-cdn.net',
    accessKey: 'bd094c93-3387-44e5-8ee02b4ff7c3-f22d-4060',
    rootFolder: 'cashtop-images',
    maxSizeKB: 50,
    maxDimension: 500
  });
  const IMAGE_DELETE_QUEUE_KEY = 'cashtop_pending_image_deletes_v1';

  function safeImagePathPart(value, fallback = 'item') {
    const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return (cleaned || fallback).slice(0, 80);
  }

  function imageTenantFolder() {
    const session = getSession?.() || {};
    return safeImagePathPart(session.companyId || session.tenantId || tenantIdFromSession?.() || companyIdFromSession?.() || 'company', 'company');
  }

  function isManagedImageUrl(url) {
    try {
      const parsed = new URL(String(url || ''));
      return parsed.hostname.toLowerCase() === IMAGE_STORAGE_CONFIG.pullHost.toLowerCase() &&
        parsed.pathname.replace(/^\/+/, '').startsWith(`${IMAGE_STORAGE_CONFIG.rootFolder}/`);
    } catch (_) { return false; }
  }

  function managedImagePathFromUrl(url) {
    if (!isManagedImageUrl(url)) return '';
    try { return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, '')); } catch (_) { return ''; }
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('IMAGE_COMPRESS_FAILED')), 'image/jpeg', quality));
  }

  async function loadBitmapForImage(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) {}
    }
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('IMAGE_READ_FAILED'));
      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function compressSquareImage(file, maxSizeKB = IMAGE_STORAGE_CONFIG.maxSizeKB) {
    if (!(file instanceof Blob)) throw new Error('INVALID_IMAGE_FILE');
    const bitmap = await loadBitmapForImage(file);
    const width = Number(bitmap.width || bitmap.naturalWidth || 0);
    const height = Number(bitmap.height || bitmap.naturalHeight || 0);
    if (!width || !height) throw new Error('INVALID_IMAGE_DIMENSIONS');
    const sourceSize = Math.min(width, height);
    const sourceX = Math.max(0, (width - sourceSize) / 2);
    const sourceY = Math.max(0, (height - sourceSize) / 2);
    const limitBytes = Math.max(8, Number(maxSizeKB || 50)) * 1024;
    let target = Math.min(sourceSize, IMAGE_STORAGE_CONFIG.maxDimension);
    let best = null;
    try {
      while (target >= 64) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(target));
        canvas.height = canvas.width;
        const ctx = canvas.getContext('2d', { alpha:false });
        if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
        for (let quality = 0.88; quality >= 0.06; quality -= 0.06) {
          const blob = await canvasBlob(canvas, Math.max(0.1, quality));
          if (!best || blob.size < best.size) best = blob;
          if (blob.size <= limitBytes) return blob;
        }
        target = Math.floor(target * 0.78);
      }
      if (best && best.size <= limitBytes) return best;
      throw new Error('IMAGE_TOO_LARGE_AFTER_COMPRESSION');
    } finally {
      try { bitmap.close?.(); } catch (_) {}
    }
  }

  async function uploadManagedImage(file, options = {}) {
    const folder = safeImagePathPart(options.folder || 'misc', 'misc');
    const entityId = safeImagePathPart(options.entityId || options.name || `img_${Date.now()}`, 'item');
    const blob = await compressSquareImage(file, options.maxSizeKB || IMAGE_STORAGE_CONFIG.maxSizeKB);
    const unique = `${entityId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const path = `${IMAGE_STORAGE_CONFIG.rootFolder}/${imageTenantFolder()}/${folder}/${unique}`;
    const endpoint = `https://storage.bunnycdn.com/${IMAGE_STORAGE_CONFIG.storageZone}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'AccessKey': IMAGE_STORAGE_CONFIG.accessKey, 'Content-Type': 'image/jpeg' },
      body: blob
    });
    if (!response.ok) throw new Error(`IMAGE_UPLOAD_FAILED_${response.status}`);
    const url = `https://${IMAGE_STORAGE_CONFIG.pullHost}/${path.split('/').map(encodeURIComponent).join('/')}`;
    return { url, path, sizeBytes: blob.size, sizeKB: Math.round(blob.size / 102.4) / 10 };
  }

  function readImageDeleteQueue() {
    try {
      const value = safeJson(localStorage.getItem(IMAGE_DELETE_QUEUE_KEY), []);
      return Array.isArray(value) ? value.filter(isManagedImageUrl) : [];
    } catch (_) { return []; }
  }

  function writeImageDeleteQueue(queue) {
    try { localStorage.setItem(IMAGE_DELETE_QUEUE_KEY, JSON.stringify([...new Set(queue)].slice(-300))); } catch (_) {}
  }

  async function deleteManagedImage(url, options = {}) {
    if (!isManagedImageUrl(url)) return { ok:true, managed:false };
    const path = managedImagePathFromUrl(url);
    if (!path) return { ok:true, managed:false };
    try {
      const endpoint = `https://storage.bunnycdn.com/${IMAGE_STORAGE_CONFIG.storageZone}/${path.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetch(endpoint, { method:'DELETE', headers:{ 'AccessKey': IMAGE_STORAGE_CONFIG.accessKey } });
      if (!response.ok && response.status !== 404) throw new Error(`IMAGE_DELETE_FAILED_${response.status}`);
      const queue = readImageDeleteQueue().filter(item => item !== url);
      writeImageDeleteQueue(queue);
      return { ok:true, managed:true };
    } catch (error) {
      if (options.queue !== false) {
        const queue = readImageDeleteQueue();
        if (!queue.includes(url)) queue.push(url);
        writeImageDeleteQueue(queue);
      }
      return { ok:false, managed:true, queued:options.queue !== false, error };
    }
  }

  async function flushManagedImageDeletes() {
    const queue = readImageDeleteQueue();
    if (!queue.length || navigator.onLine === false) return { total:queue.length, removed:0 };
    let removed = 0;
    for (const url of [...queue]) {
      const result = await deleteManagedImage(url, { queue:false });
      if (result.ok) removed += 1;
    }
    return { total:queue.length, removed };
  }


  /* R105 — Product images were removed completely.
     Keep only the small company-branding image API used by setting.html.
     There is no product-image outbox, image hydrator, retry loop or DOM watcher. */
  function purgeLegacyProductImageRuntimeV105() {
    try { rawRemove('ct_image_outbox_fallback_meta_v1'); } catch (_) {}
    try { caches?.delete?.('cashtop-image-outbox-local-v1'); } catch (_) {}
    try {
      if ('indexedDB' in window) indexedDB.deleteDatabase('cashtop-image-outbox-v1');
    } catch (_) {}
  }

  window.CashtopImages = Object.assign(window.CashtopImages || {}, {
    upload: uploadManagedImage,
    compress: compressSquareImage,
    remove: deleteManagedImage,
    flushDeletes: flushManagedImageDeletes,
    isManagedUrl: isManagedImageUrl,
    pathFromUrl: managedImagePathFromUrl,
    maxSizeKB: IMAGE_STORAGE_CONFIG.maxSizeKB
  });
  window.addEventListener('online', () => flushManagedImageDeletes().catch(() => null));
  setTimeout(() => {
    purgeLegacyProductImageRuntimeV105();
    flushManagedImageDeletes().catch(() => null);
  }, 800);


  window.Cashtop = Object.assign(window.Cashtop || {}, {
    FILE,
    DATA_KEYS: [...DATA_KEYS],
    aliases: { ...ALIASES },
    getSession,
    persistSession,
    tenantIdFromSession,
    FINANCIAL_GROUPS_KEY,
    OPENING_BALANCES_KEY,
    LEGACY_FINANCIAL_GROUP_ID,
    FINANCIAL_GROUP_SCOPED_KEYS,
    isFinancialGroupScopedKey,
    getFinancialGroups,
    currentFinancialGroupId,
    getCurrentFinancialGroup,
    isFinancialGroupReadOnly,
    createFinancialGroup,
    selectFinancialGroup,
    calculateFinancialGroupClosing,
    financialGroupNamespaceKey,
    financialGroupMetaKey,
    logout,
    showToast,
    syncNow,
    refreshApplicationCache,
    installPwa,
    can,
    normalizePermissions,
    PERMISSION_GROUPS,
    PAGE_PERMISSIONS,
    ACTION_PERMISSION_MAP,
    applyActionPermissions,
    applyPermissionVisibility,
    toggleSidebar,
    closeTransientUi,
    enhanceAllSelects,
    rawGet,
    rawSet,
    getRawCompanyDataset,
    setRawCompanyDataset, replaceManagedDatasetRaw, deleteManagedRecord,
    ensureSystemDefaults,
    DEFAULT_MAIN_BRANCH_NAME,
    DEFAULT_CASH_ACCOUNT_NAME,
    branchIdFromSession,
    currentPlan,
    PLUS_LIMITS,
    currentCustomLimits,
    isFundActive,
    activeFundAccounts,
    getDefaultFundAccount,
    sortFundAccountsForDropdown,
    namespaceKey,
    metaKey,
    safeJson,
    normalizeArray: normalizeArrayValue,
    getAllCompanyData,
    exportBackup,
    setRecordsStreamLoading,
    importBackupFile,
    isBackupImportEnabled,
    syncImportedData,
    applyRemoteDataset,
    validateSessionLocal,
    getTaxSettings, getTaxRates, calculateTax,
    getNotificationSettings, getSmartNotifications, updateNotificationBadge, requestNotificationPermission, notificationBrandIcon, showTodayProfitNotification,
    archiveRecords, readArchivedRecords, compactCompletedData, trustedNowMs,
    getSyncQueue, enqueueSyncOperation, completeSyncOperation, clearSyncQueue, resetSyncQueueCompletely, preservePendingSyncState, updateSyncBadge, restoreSyncQueueBackup, migrateLegacySyncQueues,
    setSyncProgress, restoreDurableCompanyData, flushDurableLocalWrites, commitCriticalData, readDurableLocalKey,
    getSystemSettings, getProfitRate, getInventoryAccountingMethod, salePriceFromCost, applySystemBranding, recordIdentity, sortNewestFirstRecords,
    debounce, runWhenIdle, renderVirtualRows, renderVirtualGrid, runWorkerTask, queryRecords, atomicSetItems, recoverAtomicTransactions,
    captureModalDraft, restoreModalDraft, clearModalDraft, getAuditPending, getAuditPendingAsync, getAuditPendingCountAsync, completeAuditPending, completeAuditPendingAsync, getRecentAuditCache,
  });

  if (IS_APP_PAGE) {
    addCoreAssets();
    patchStorage();
    const queueResetAppliedR59 = primeRevisionQueueResetR59();
    if (queueResetAppliedR59) {
      syncQueueBackupChain = syncQueueBackupChain.then(() => backupSyncQueue([])).catch(() => false);
      window.dispatchEvent(new CustomEvent('cashtop:sync-queue-reset', { detail: { discarded: 0, resetAt: syncQueueResetAt(), automatic: true, revision: 'r59' } }));
    }
    let bootFinancialGroupId = '';
    if (ensureAuthenticated()) {
      ensureFinancialGroups();
      bootFinancialGroupId = currentFinancialGroupId();
      if (!isFinancialGroupReadOnly()) recoverAtomicTransactions();
      seedCompanyStorage();
      bootstrapCompanyAccess();
      ensureSystemDefaults();
    }

    window.addEventListener('online', () => { updateNetworkStatus(); if (FILE !== 'sync.html') syncNow({ manual: false }); });
    window.addEventListener('pageshow', () => { if (FILE !== 'sync.html' && getSyncQueue().length) syncNow({ manual: false }); }, { passive: true });
    window.addEventListener('cashtop:sync-queue-changed', updateSyncBadge);
    window.addEventListener('cashtop:sync-queue-restored', () => { if (FILE !== 'sync.html') syncNow({ manual: false }); });
    window.addEventListener('cashtop:data-changed', event => { if (event.detail?.key === 'cashtop_settings') applySystemBranding(); });
    window.addEventListener('offline', updateNetworkStatus);
    const flushDurableOfflineState = () => { preservePendingSyncState().catch(() => null); };
    // ثبّت طابور المزامنة والبيانات المتغيرة في IndexedDB قبل تجميد/إغلاق الصفحة.
    // هذا مهم خصوصاً على Android عندما يغلق النظام الـ WebView فجأة.
    window.addEventListener('pagehide', flushDurableOfflineState, { passive: true });
    window.addEventListener('beforeunload', flushDurableOfflineState, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushDurableOfflineState();
    }, { passive: true });
    navigator.serviceWorker?.addEventListener?.('message', event => {
      if (event.data?.type === 'CASHTOP_BACKGROUND_SYNC' && getSyncQueue().length) syncNow({ manual: false });
    });
    durableReadyPromise = restoreDurableCompanyData().catch(() => ({ restored: 0 }));
    window.Cashtop.localReady = durableReadyPromise;
    const syncRestoreReadyPromise = durableReadyPromise
      .then(async result => {
        const recovery = await restoreArchivedBusinessRecordsV106().catch(error => {
          console.warn('[CASH TOP 2] R106 archive recovery deferred:', error);
          return { restored:0 };
        });
        window.dispatchEvent(new CustomEvent('cashtop:local-ready', { detail: { ...(result || { restored:0 }), archiveRestored:Number(recovery?.restored || 0) } }));
        return restoreSyncQueueBackup().catch(() => []);
      })
      .then(() => migrateLegacySyncQueues().catch(() => ({ migrated: 0 })))
      .then(() => {
        updateSyncBadge();
        if (FILE !== 'sync.html' && getSyncQueue().length) syncNow({ manual: false });
        return { ready: true, queueLength: getSyncQueue().length };
      })
      .catch(() => ({ ready: true, queueLength: getSyncQueue().length }));
    window.Cashtop.syncReady = syncRestoreReadyPromise;
    window.addEventListener('cashtop:sync-progress', event => setSyncProgress(event.detail || {}));
    window.addEventListener('cashtop:pull-start', event => setRecordsPulling(true, event.detail || {}));
    window.addEventListener('cashtop:pull-end', event => setRecordsPulling(false, event.detail || {}));
    // رسالة التحويل إلى IndexedDB تظهر مرة واحدة فقط على هذا الجهاز.
    // نضع العلامة أيضاً داخل IndexedDB لأن localStorage قد يكون ممتلئاً لحظة التحويل.
    const storagePressureNoticeLocalKey = 'cashtop_indexeddb_notice_shown_v1';
    const storagePressureNoticeDurableKey = 'cashtop_meta::__global__::__indexeddb_notice_shown_v1__';
    let storagePressureNoticeHandled = false;
    const showStoragePressureNoticeOnce = async () => {
      if (storagePressureNoticeHandled) return;
      storagePressureNoticeHandled = true;
      let alreadyShown = false;
      try { alreadyShown = RAW.get.call(localStorage, storagePressureNoticeLocalKey) === '1'; } catch (_) {}
      if (!alreadyShown) {
        try { alreadyShown = (await readDurableLocalKey(storagePressureNoticeDurableKey)) === '1'; } catch (_) {}
      }
      if (alreadyShown) return;
      try { RAW.set.call(localStorage, storagePressureNoticeLocalKey, '1'); } catch (_) {}
      try { await persistDurableLocalKey(storagePressureNoticeDurableKey, '1'); } catch (_) {}
      showToast('تم تحويل التخزين تلقائياً إلى قاعدة IndexedDB المحلية الكبيرة للحفاظ على البيانات.', 'info', 4200);
    };
    window.addEventListener('cashtop:local-storage-pressure', () => { showStoragePressureNoticeOnce().catch(() => null); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeTransientUi();
    });
    window.addEventListener('pageshow', () => closeTransientUi(), { passive: true });
    document.addEventListener('DOMContentLoaded', () => {
      migrateNotificationDefaultsV54();
      mountShell();
      installModalDraftPersistence();
      installManagerNotificationSystem();
      applyFinancialGroupReadOnlyUi();
      consumeFinancialGroupToast();
      setTimeout(installGlobalPerformanceGuards, 0);
    }, { once: true });

    const refreshSessionAccess = () => {
      const before = getSession() || {};
      const result = validateSessionLocal(before);
      if (!result.ok) { logout(result.reason); return; }
      const after = getSession() || {};
      const accessChanged = JSON.stringify(before.permissions || {}) !== JSON.stringify(after.permissions || {}) ||
        before.authVersion !== after.authVersion || before.plan !== after.plan ||
        JSON.stringify(before.customLimits || null) !== JSON.stringify(after.customLimits || null);
      if (accessChanged) {
        applyPermissionVisibility();
        applyActionPermissions();
        if (!enforceCurrentPageAccess(after)) return;
        if (FILE === 'setting.html') renderSubscriptionPanel(after);
        window.dispatchEvent(new CustomEvent('cashtop:session-updated', { detail: after }));
      }
    };
    setInterval(refreshSessionAccess, 4000);
    window.addEventListener('cashtop:remote-applied', event => {
      if (['cashtop_employees','cashtop_sales_agents','cashtop_branches','cashtop_company_access'].includes(event.detail?.key)) refreshSessionAccess();
      if (event.detail?.key === 'cashtop_settings') applySystemBranding();
      if (event.detail?.key === FINANCIAL_GROUPS_KEY) {
        const effective = currentFinancialGroupId();
        if (bootFinancialGroupId && effective !== bootFinancialGroupId) {
          const group = getCurrentFinancialGroup();
          try { sessionStorage.setItem(financialGroupToastKey(), JSON.stringify({ name:group?.name || 'المجموعة المالية', status:group?.status || 'active' })); } catch (_) {}
          location.reload();
          return;
        }
        applyFinancialGroupReadOnlyUi();
      }
    });

    if (channel) {
      channel.addEventListener('message', event => {
        const data = event.data || {};
        if (data.type === 'license-invalidated' && (!data.companyId || data.companyId === companyIdFromSession())) {
          logout(data.reason || 'stopped');
          return;
        }
        if (data.type === 'license-change') {
          const result = validateSessionLocal(getSession());
          if (!result.ok) logout(result.reason);
        }
        if (data.type === 'data-change' && data.deviceId !== getDeviceId() && data.companyId === companyIdFromSession()) {
          dispatchLogicalStorageEvents(data.key, data.oldValue, data.value);
          window.dispatchEvent(new CustomEvent('cashtop:external-change', { detail: data }));
        }
      });
    }

    const maximizeBrowserStorage = async (options = {}) => {
      const result = { persisted:false, usage:0, quota:0, compacted:false };
      try {
        if (navigator.storage?.persisted) result.persisted = await navigator.storage.persisted();
        if (!result.persisted && navigator.storage?.persist) result.persisted = await navigator.storage.persist();
      } catch (_) {}
      try {
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          result.usage = Number(estimate?.usage || 0);
          result.quota = Number(estimate?.quota || 0);
        }
      } catch (_) {}
      const ratio = result.quota > 0 ? result.usage / result.quota : 0;
      // R106: storage pressure must never make invoices disappear from the live
      // register. Archiving is now an explicit admin action only.
      if (options.forceCompact === true && options.allowDataArchive === true) {
        try { await compactCompletedData(true); result.compacted = true; } catch (_) {}
      }
      try {
        const ready = await navigator.serviceWorker?.ready;
        ready?.active?.postMessage?.({ type:'TRIM_OLD_CACHES' });
      } catch (_) {}
      return result;
    };
    window.Cashtop.maximizeBrowserStorage = maximizeBrowserStorage;
    window.Cashtop.recoverStoragePressure = async () => {
      const result = await maximizeBrowserStorage({ forceCompact:false });
      try {
        const audit = safeJson(localStorage.getItem('cashtop_audit_log'), []) || [];
        if (Array.isArray(audit) && audit.length > 80) localStorage.setItem('cashtop_audit_log', JSON.stringify(audit.slice(-80)));
      } catch (_) {}
      return result;
    };
    window.addEventListener('cashtop:local-storage-pressure', () => {
      window.Cashtop.recoverStoragePressure?.().catch(() => null);
    });

    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      const requestPersistentStorage = async () => {
        try {
          const already = typeof navigator.storage.persisted === 'function'
            ? await navigator.storage.persisted()
            : false;
          const granted = already || await navigator.storage.persist();
          rawSet('ct_storage_persistence_v1', JSON.stringify({ granted: Boolean(granted), checkedAt: Date.now() }));
          return granted;
        } catch (_) {
          rawSet('ct_storage_persistence_v1', JSON.stringify({ granted: false, checkedAt: Date.now() }));
          return false;
        }
      };
      requestPersistentStorage();
      setTimeout(() => maximizeBrowserStorage().catch(() => null), 800);
      /* بعض المتصفحات لا تمنح التخزين الدائم إلا بعد تفاعل واضح من المستخدم. */
      document.addEventListener('pointerdown', requestPersistentStorage, { once: true, passive: true });
    }
    // بعض متصفحات Android تمنع <script type="module"> عند فتح التطبيق من file://.
    // نحاول هنا تشغيل وحدة المزامنة كـ classic script بعد اكتمال تحميل الصفحة،
    // وهذا يصلح أيضاً الصفحات القديمة التي قد تكون ما زالت محفوظة في كاش سابق.
    setTimeout(() => ensureCloudSyncRuntime().catch(() => false), 120);

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      (async () => {
        try {
          const registration = await navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' });
          // لا نعيد تنزيل صفحات التطبيق تلقائياً بعد تثبيتها. التحديث يتم فقط
          // عند وصول Service Worker جديد بشكل طبيعي أو عند طلب تحديث الكاش يدوياً.
          const ready = await navigator.serviceWorker.ready;
          if (!sessionStorage.getItem('ct_sw_cache_verified_session')) {
            sessionStorage.setItem('ct_sw_cache_verified_session', '1');
            ready.active?.postMessage?.({ type: 'VERIFY_CACHE' });
            ready.active?.postMessage?.({ type: 'WARM_CACHE' });
          }
        } catch (err) {
          console.warn('[CASH TOP 2] SW:', err);
        }
      })();
    }
  }
})();
