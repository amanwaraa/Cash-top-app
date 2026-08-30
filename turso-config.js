/* CASH TOP 2 — Turso/libSQL runtime configuration */
(() => {
  'use strict';
  const APP_ID='cash-top-turso-2026-r74';
  const DEFAULT_ROOT='cashTopExchange/cashTopPOS';
  const DEFAULT_ADMIN_ROOT='cashTopExchange/cashTopAdmin';
  const safe=v=>String(v ?? '').trim();
  const readLocalDatabase=(runtime=null)=>{
    try { const identity=runtime?.companyId||runtime?.tenantId||''; const db=window.CashtopActivation?.readDatabaseAccess?.(identity); if(db?.databaseURL&&db?.authToken)return db; } catch (_) {}
    return null;
  };
  const readRuntime=()=>{
    try { return window.CashtopActivation?.readRuntime?.() || null; } catch (_) { return null; }
  };
  const readMaster=()=>{
    try {
      // loadMasterConfig is async in the activation runtime, so first use the
      // already decrypted runtime/master objects when available.
      if (window.CASHTOP_MASTER?.database) return window.CASHTOP_MASTER;
      const m=window.CashtopActivation?.readMasterConfig?.(); if(m?.database)return m;
    } catch (_) {}
    return null;
  };
  function build(runtime, master){
    const localDatabase=readLocalDatabase(runtime);
    const source = localDatabase ? { database: localDatabase, rootPath: runtime?.rootPath || master?.rootPath, adminRootPath: runtime?.adminRootPath || master?.adminRootPath } : (runtime?.database?.databaseURL ? runtime : (master || runtime || {}));
    const database = source?.database || {};
    const dbURL=safe(database.databaseURL);
    const authToken=safe(database.authToken);
    const bridgeBase = ['http:','https:'].includes(location.protocol)
      ? `${location.origin}/__turso_rtdb__`
      : 'file:///__turso_rtdb__';
    window.CASHTOP_TURSO={
      enabled:Boolean(dbURL && authToken),
      authMode:localDatabase?'local-activation-cache':(runtime?'activation-file':'activation-required'),
      syncMode:'turso-http-rtdb', backendMode:'turso-http-rtdb', backendName:'Turso / libSQL',
      rootPath:safe(runtime?.rootPath || source?.rootPath || DEFAULT_ROOT),
      adminRootPath:safe(runtime?.adminRootPath || source?.adminRootPath || DEFAULT_ADMIN_ROOT),
      legacyRootPaths:Object.freeze(['cashTopPOS/v6']),
      usagePolicy:Object.freeze({remoteCheckMs:1200,navigationCheckMs:500,fullRefreshMs:86400000,writeDebounceMs:25,cloudAudit:false}),
      config:Object.freeze({databaseURL:bridgeBase,databaseURLs:Object.freeze([bridgeBase]),projectId:APP_ID}),
      turso:Object.freeze({databaseURL:dbURL,authToken,table:'cashtop_rtdb'}),
      collections:Object.freeze({licenses:'licenses',users:'users',companies:'companies'}),
      activation:runtime || null,
      localDatabaseCached:Boolean(localDatabase)
    };
    return window.CASHTOP_TURSO;
  }
  window.CashtopTursoConfig={
    refresh(){ return build(readRuntime(),readMaster()); },
    async refreshAsync(){
      let runtime=readRuntime();
      let master=readMaster();
      if(!runtime && window.CashtopActivation?.loadMasterConfig){
        try { master=await window.CashtopActivation.loadMasterConfig(); } catch (_) {}
      }
      return build(runtime,master);
    }
  };
  build(readRuntime(),readMaster());
  try { window.addEventListener('cashtop:database-access-ready', () => { build(readRuntime(), readMaster()); }); } catch (_) {}
})();
