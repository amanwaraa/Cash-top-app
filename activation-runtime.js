/* CASH TOP Activation Runtime v4
 * Portable activation files.
 * New files are opaque Base64 blobs (no format/version labels in the file contents).
 * Legacy JSON activation files remain readable for backward compatibility.
 */
(() => {
  'use strict';
  const RUNTIME_KEY = 'ct_activation_runtime_v4';
  const MASTER_KEY = 'ct_master_runtime_v4';
  const LEGACY_RUNTIME_KEY = 'ct_activation_runtime_v3';
  const LEGACY_RUNTIME_KEY_V2 = 'ct_activation_runtime_v2';
  const LEGACY_MASTER_KEY = 'ct_master_runtime_v3';
  const LEGACY_MASTER_KEY_V2 = 'ct_master_runtime_v2';
  const APP_TAG = 'CASH_TOP_ACTIVATION_V4';
  const LEGACY_APP_TAG_V3 = 'CASH_TOP_ACTIVATION_V3';
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const b64 = u8 => btoa(String.fromCharCode(...u8));
  const unb64 = s => Uint8Array.from(atob(String(s || '')), c => c.charCodeAt(0));
  const json = v => JSON.stringify(v);
  const safeText = v => String(v ?? '').trim();
  const clone = v => JSON.parse(JSON.stringify(v));

  // Obfuscated application wrapping material. This only hides the implementation
  // details from casual inspection; it is not a substitute for a server secret.
  const K = ['CT','_x7','4P','!q','9N','a2','_m','6R','@z','3L'].join('');
  const u8 = s => enc.encode(String(s));
  function xorBytes(bytes, mask){
    const out = new Uint8Array(bytes.length);
    const m = u8(mask); for(let i=0;i<bytes.length;i++) out[i]=bytes[i]^m[i%m.length];
    return out;
  }
  const wrapText = s => b64(xorBytes(enc.encode(String(s||'')), K));
  const unwrapText = s => dec.decode(xorBytes(unb64(s), K));

  async function derive(password, salt, iterations=210000) {
    const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
  }
  async function aesEncrypt(text, password, saltBytes=null){
    const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await derive(password, salt);
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, enc.encode(String(text)));
    return {salt,iv,cipher:new Uint8Array(cipher)};
  }
  async function aesDecrypt(cipher, password, salt, iv){
    const key = await derive(password, salt);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv}, key, cipher);
    return dec.decode(plain);
  }

  // Generic AES-GCM vault helpers used by the mother admin console. The secret
  // is supplied at runtime (for remote DB records we use the master DB token),
  // so child database credentials are never stored as readable JSON remotely.
  async function sealObject(value, secret){
    const pass=safeText(secret); if(!pass) throw new Error('مفتاح الحماية المحلي غير متوفر.');
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await derive(pass,salt,240000);
    const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(json(value))));
    const out=new Uint8Array(16+12+cipher.length);out.set(salt,0);out.set(iv,16);out.set(cipher,28);
    return 'CTV1.'+b64(out);
  }
  async function openObject(value, secret){
    const text=safeText(value); if(!text.startsWith('CTV1.')) throw new Error('بيانات الخزنة غير صالحة.');
    const raw=unb64(text.slice(5)); if(raw.length<45) throw new Error('بيانات الخزنة تالفة.');
    const key=await derive(safeText(secret),raw.slice(0,16),240000);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:raw.slice(16,28)},key,raw.slice(28));
    return JSON.parse(dec.decode(plain));
  }
  const DEVICE_VAULT_KEY='ct_device_vault_secret_v1';
  function deviceVaultSecret(){
    try{const raw=localStorage.getItem(DEVICE_VAULT_KEY);if(raw){const v=unwrapText(raw);if(v)return v;}}catch(_){}
    const bytes=crypto.getRandomValues(new Uint8Array(32));const secret=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
    try{localStorage.setItem(DEVICE_VAULT_KEY,wrapText(secret));}catch(_){}return secret;
  }
  async function sealLocalObject(value){return sealObject(value,deviceVaultSecret())}
  async function openLocalObject(value){return openObject(value,deviceVaultSecret())}


  /*
   * Direct Turso client used only for two trust-boundary operations:
   *  - strict login verification before a session is created;
   *  - publishing the company-access record from the mother admin to the child DB.
   * Normal application sync still goes through turso-rtdb.js/turso-sync.js.
   */
  function tursoTable(db){return safeText(db?.table||'cashtop_rtdb').replace(/[^a-zA-Z0-9_]/g,'')||'cashtop_rtdb'}
  function tursoPipelineUrl(db){
    const url=safeText(db?.databaseURL);if(!url)throw new Error('رابط قاعدة البيانات غير موجود.');
    if(!/^(?:libsql|https?):\/\//i.test(url))throw new Error('رابط قاعدة البيانات غير صالح.');
    return url.replace(/^libsql:\/\//i,'https://').replace(/\/+$/,'')+'/v2/pipeline';
  }
  function tursoArg(value){
    if(value===null||value===undefined)return {type:'null'};
    if(typeof value==='number'&&Number.isInteger(value))return {type:'integer',value:String(value)};
    if(typeof value==='number')return {type:'float',value:String(value)};
    return {type:'text',value:String(value)};
  }
  function tursoCell(cell){
    if(!cell||cell.type==='null')return null;
    if(cell.type==='integer'||cell.type==='float'){const n=Number(cell.value);return Number.isFinite(n)?n:cell.value}
    return cell.value;
  }
  function tursoRows(result){
    const names=(result?.cols||[]).map(c=>c.name);
    return (result?.rows||[]).map(row=>Object.fromEntries(row.map((cell,i)=>[names[i],tursoCell(cell)])));
  }
  async function tursoPipeline(db,statements,timeout=24000){
    const token=safeText(db?.authToken);if(!token)throw new Error('توكن قاعدة البيانات غير موجود.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(tursoPipelineUrl(db),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({requests:[...statements.map(st=>({type:'execute',stmt:{sql:st.sql,args:(st.args||[]).map(tursoArg)}})),{type:'close'}]}),signal:controller.signal,cache:'no-store'});
      const text=await response.text();
      if(!response.ok)throw new Error(`Turso HTTP ${response.status}: ${text.slice(0,300)}`);
      let data;try{data=JSON.parse(text)}catch(_){throw new Error('استجابة قاعدة البيانات غير صالحة.');}
      return statements.map((_,i)=>{const item=data?.results?.[i];if(!item||item.type!=='ok')throw new Error(`Turso SQL: ${item?.error?.message||item?.error||'UNKNOWN'}`);return item.response?.result||{cols:[],rows:[],affected_row_count:0}});
    }catch(error){
      if(error?.name==='AbortError')throw new Error('انتهت مهلة الاتصال بقاعدة البيانات.');
      throw error;
    }finally{clearTimeout(timer)}
  }
  async function tursoEnsure(db){
    const table=tursoTable(db);
    await tursoPipeline(db,[{sql:`CREATE TABLE IF NOT EXISTS ${table} (path TEXT PRIMARY KEY,payload TEXT,deleted INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)`,args:[]}]);
    return true;
  }
  function tursoParsePayload(raw){if(raw==null)return null;if(typeof raw!=='string')return raw;try{return JSON.parse(raw)}catch(_){return raw}}
  function normalizeRemotePath(path){return safeText(path).replace(/\.json(?:\?.*)?$/i,'').replace(/^\/+|\/+$/g,'').replace(/\/{2,}/g,'/')}
  async function tursoReadExact(db,path,{ensure=false}={}){
    if(ensure)await tursoEnsure(db);
    const table=tursoTable(db),normalized=normalizeRemotePath(path);
    const [result]=await tursoPipeline(db,[{sql:`SELECT payload,deleted,updated_at FROM ${table} WHERE path = ? LIMIT 1`,args:[normalized]}]);
    const row=tursoRows(result)[0];if(!row)return undefined;
    return Number(row.deleted)===1?null:tursoParsePayload(row.payload);
  }
  async function tursoWriteExact(db,path,value){
    await tursoEnsure(db);
    const table=tursoTable(db),normalized=normalizeRemotePath(path),now=Date.now();
    await tursoPipeline(db,[{sql:`INSERT INTO ${table}(path,payload,deleted,updated_at) VALUES(?,?,0,?) ON CONFLICT(path) DO UPDATE SET payload=excluded.payload,deleted=0,updated_at=excluded.updated_at`,args:[normalized,JSON.stringify(value),now]}]);
    return true;
  }
  async function tursoDeletePrefix(db,path){
    await tursoEnsure(db);
    const table=tursoTable(db),normalized=normalizeRemotePath(path),prefix=normalized+'/%';
    await tursoPipeline(db,[{sql:`DELETE FROM ${table} WHERE path = ? OR path LIKE ?`,args:[normalized,prefix]}],60000);
    return true;
  }
  const tursoDirect=Object.freeze({pipeline:tursoPipeline,ensure:tursoEnsure,readExact:tursoReadExact,writeExact:tursoWriteExact,deletePrefix:tursoDeletePrefix,normalizePath:normalizeRemotePath});

  /*
   * New portable format (binary -> Base64):
   *   1 byte marker + 16 salt + 12 iv + 2-byte wrapped-key length + wrapped activation key
   *   + 16 payload salt + 12 payload iv + encrypted JSON payload
   * The file contains no human-readable labels such as "format", "encoding", or "keyHint".
   */
  async function packOpaque(payload){
    const activationKey = safeText(payload.activationKey);
    if(!activationKey) throw new Error('ملف التفعيل يحتاج مفتاح دخول.');
    const keySalt = crypto.getRandomValues(new Uint8Array(16));
    const wrapped = await aesEncrypt(activationKey, K, keySalt);
    const keyBlob = new Uint8Array(wrapped.iv.length + wrapped.cipher.length);
    keyBlob.set(wrapped.iv,0); keyBlob.set(wrapped.cipher,wrapped.iv.length);
    if(keyBlob.length>65535) throw new Error('تعذر إنشاء ملف التفعيل.');
    const payloadSalt = crypto.getRandomValues(new Uint8Array(16));
    const payloadIv = crypto.getRandomValues(new Uint8Array(12));
    const payloadKey = await derive(activationKey, payloadSalt);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:payloadIv}, payloadKey, enc.encode(json({...payload,app:APP_TAG}))));
    const out = new Uint8Array(1+16+12+2+keyBlob.length+16+12+cipher.length);
    let o=0; out[o++]=0x73;
    out.set(keySalt,o); o+=16; out.set(wrapped.iv,o); o+=12;
    out[o++]=(keyBlob.length>>8)&255; out[o++]=keyBlob.length&255;
    out.set(keyBlob,o); o+=keyBlob.length;
    out.set(payloadSalt,o); o+=16; out.set(payloadIv,o); o+=12; out.set(cipher,o);
    return b64(out);
  }

  async function unpackOpaque(text){
    let raw;
    try { raw=unb64(String(text||'').replace(/\s+/g,'')); } catch(_) { throw new Error('ملف التفعيل غير صالح.'); }
    if(raw.length<1+16+12+2+28+16+12+16 || raw[0]!==0x73) throw new Error('ملف التفعيل غير صالح.');
    let o=1;
    const keySalt=raw.slice(o,o+16); o+=16;
    const keyIv=raw.slice(o,o+12); o+=12;
    const keyLen=(raw[o++]<<8)|raw[o++];
    if(keyLen<29 || o+keyLen+16+12>=raw.length) throw new Error('ملف التفعيل تالف.');
    const keyBlob=raw.slice(o,o+keyLen); o+=keyLen;
    let activationKey='';
    try { activationKey=await aesDecrypt(keyBlob.slice(12),K,keySalt,keyBlob.slice(0,12)); } catch(_) { throw new Error('تعذر التحقق من ملف التفعيل.'); }
    const payloadSalt=raw.slice(o,o+16); o+=16;
    const payloadIv=raw.slice(o,o+12); o+=12;
    const cipher=raw.slice(o);
    try {
      const key=await derive(activationKey,payloadSalt);
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:payloadIv},key,cipher);
      const payload=JSON.parse(dec.decode(plain));
      if(![APP_TAG,LEGACY_APP_TAG_V3].includes(payload?.app) || safeText(payload.activationKey)!==safeText(activationKey)) throw new Error();
      return payload;
    } catch(_) { throw new Error('فشل التحقق من ملف التفعيل أو تم العبث به.'); }
  }

  // Legacy v2 reader.
  async function deriveLegacy(secret, salt) {
    const material = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
  }
  async function decryptLegacyEnvelope(envelope, secret) {
    if (!envelope || envelope.format !== 'CASH_TOP_ACTIVATION_V2') throw new Error('ليس ملف تفعيل قديمًا معتمدًا.');
    const salt=unb64(envelope.salt),iv=unb64(envelope.iv),cipher=unb64(envelope.ciphertext);
    const key=await deriveLegacy(secret,salt);
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher)));
  }

  async function makeFile(payload){
    const value={...clone(payload),fileId:payload.fileId||(crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random()}`),app:APP_TAG};
    const opaque=await packOpaque(value);
    return {value,opaque};
  }
  async function downloadOpaque(value,fileName){
    const name=(fileName||`${value.displayName||value.username||'CashTop'}_activation.ctauth`).replace(/[\\/:*?"<>|]+/g,'_');
    const blob=new Blob([await packOpaque(value)],{type:'application/octet-stream'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800);
  }
  async function prepareActivationFile(payload,fileName){
    const made=await makeFile(payload); await downloadOpaque(made.value,(fileName||'activation').replace(/\.(?:ctauth|ctkey)$/i,'')+'.ctauth'); return made;
  }
  async function downloadActivationFile(payload,fileName){ return prepareActivationFile(payload,fileName); }

  async function parseActivationFile(file){
    if(!file) throw new Error('اختر ملف التفعيل أولاً.');
    const text=await file.text();
    const trimmed=text.trim();
    // v3 opaque file
    try {
      if(trimmed && !trimmed.startsWith('{')) {
        const payload=await unpackOpaque(trimmed);
        if(payload.expiresAt && Date.now()>=new Date(payload.expiresAt).getTime()) throw new Error('انتهت صلاحية ملف التفعيل.');
        return payload;
      }
    } catch(e){ if(!trimmed.startsWith('{')) throw e; }
    // v2 JSON compatibility
    let envelope; try{envelope=JSON.parse(trimmed)}catch(_){throw new Error('ملف التفعيل غير صالح.');}
    if(envelope?.format==='CASH_TOP_ACTIVATION_V2'){
      const keyHint=String(envelope.keyHint||''); if(!keyHint) throw new Error('ملف التفعيل القديم لا يحتوي على مفتاح دخول.');
      const payload=await decryptLegacyEnvelope(envelope,keyHint);
      if(payload.activationKey!==keyHint) throw new Error('فشل التحقق من مفتاح ملف التفعيل.');
      if(payload.expiresAt && Date.now()>=new Date(payload.expiresAt).getTime()) throw new Error('انتهت صلاحية ملف التفعيل.');
      return payload;
    }
    throw new Error('ملف التفعيل غير صالح.');
  }

  const LOCAL_DB_ACCESS_KEY = 'ct_local_db_access_v3';
  const LEGACY_LOCAL_DB_ACCESS_KEYS = ['ct_local_db_access_v2','ct_local_db_access_v1'];
  const dbScopedKey=id=>`${LOCAL_DB_ACCESS_KEY}::${encodeURIComponent(safeText(id)||'current')}`;
  function databaseIdentity(meta={}){return safeText(meta.companyId||meta.tenantId||readRuntime()?.companyId||readRuntime()?.tenantId)}
  function saveDatabaseAccess(db, meta={}) {
    const identity=databaseIdentity(meta);
    const cfg = db && typeof db === 'object' ? {
      databaseURL: safeText(db.databaseURL),
      authToken: safeText(db.authToken),
      table: safeText(db.table || 'cashtop_rtdb'),
      companyId: safeText(meta.companyId || identity),
      tenantId: safeText(meta.tenantId || meta.companyId || identity),
      savedAt: Date.now()
    } : null;
    if (!cfg?.databaseURL || !cfg?.authToken) throw new Error('بيانات الدخول لقاعدة البيانات غير مكتملة.');
    const wrapped=wrapText(JSON.stringify(cfg));
    localStorage.setItem(LOCAL_DB_ACCESS_KEY, wrapped);
    if(identity)localStorage.setItem(dbScopedKey(identity),wrapped);
    for(const legacy of LEGACY_LOCAL_DB_ACCESS_KEYS){try{localStorage.removeItem(legacy)}catch(_){}}
    try { window.dispatchEvent(new CustomEvent('cashtop:database-access-ready', { detail: {...cfg,authToken:''} })); } catch (_) {}
    return cfg;
  }
  function readDatabaseAccess(identity=''){
    const wanted=safeText(identity||readRuntime()?.companyId||readRuntime()?.tenantId);
    const candidates=[wanted?dbScopedKey(wanted):'',LOCAL_DB_ACCESS_KEY].filter(Boolean);
    for(const key of candidates){
      try{
        const raw=localStorage.getItem(key),cfg=raw?JSON.parse(unwrapText(raw)):null;
        const cfgId=safeText(cfg?.companyId||cfg?.tenantId);
        if(cfg?.databaseURL&&cfg?.authToken&&(!wanted||!cfgId||cfgId===wanted))return cfg;
      }catch(_){}
    }
    // One-time migration from older readable/obfuscated local formats.
    for(const legacy of LEGACY_LOCAL_DB_ACCESS_KEYS){
      try{
        const raw=localStorage.getItem(legacy);if(!raw)continue;
        let cfg=null;
        try{cfg=JSON.parse(unwrapText(raw))}catch(_){try{cfg=JSON.parse(raw)}catch(__){}}
        if(cfg?.databaseURL&&cfg?.authToken){
          const cfgId=safeText(cfg.companyId||cfg.tenantId||wanted);
          if(wanted&&cfgId&&cfgId!==wanted)continue;
          saveDatabaseAccess(cfg,{companyId:cfgId,tenantId:cfgId});return cfg;
        }
      }catch(_){}
    }
    return null;
  }

  async function activatePayload(payload){
    if(!payload || ![APP_TAG,LEGACY_APP_TAG_V3,'CASH_TOP_ACTIVATION_V2'].includes(payload.app) && payload.format!== 'CASH_TOP_ACTIVATION_V2') throw new Error('ملف التفعيل غير صالح.');
    const cfg=payload.database||{};
    const runtime={activationKey:payload.activationKey,fileId:payload.fileId,type:payload.type,companyId:payload.companyId,companyKey:payload.companyKey,companyName:payload.companyName,username:payload.username,role:payload.role,account:payload.account||null,permissions:payload.permissions||{},database:{databaseURL:cfg.databaseURL||'',authToken:cfg.authToken||'',table:cfg.table||'cashtop_rtdb'},rootPath:payload.rootPath||'cashTopExchange/cashTopPOS',adminRootPath:payload.adminRootPath||'cashTopExchange/cashTopAdmin',activatedAt:Date.now()};
    localStorage.setItem(RUNTIME_KEY,wrapText(JSON.stringify(runtime)));
    if(cfg.databaseURL && cfg.authToken) saveDatabaseAccess(cfg,{companyId:payload.companyId,tenantId:payload.tenantId});
    try{window.dispatchEvent(new CustomEvent('cashtop:activation-loaded',{detail:runtime}))}catch(_){}
    return runtime;
  }
  function readRuntime(){
    try{const raw=localStorage.getItem(RUNTIME_KEY);if(raw)return JSON.parse(unwrapText(raw));}catch(_){}
    try{const raw=localStorage.getItem(LEGACY_RUNTIME_KEY);if(raw)return JSON.parse(unwrapText(raw));}catch(_){}
    try{const raw=localStorage.getItem(LEGACY_RUNTIME_KEY_V2);return raw?JSON.parse(decodeURIComponent(escape(atob(raw)))):null}catch(_){return null}
  }

  // Master configuration remains only on the admin device. It is stored as an
  // opaque local value, never as readable JSON or a plain-text credential.
  // The master token is still a client-side secret and therefore should be
  // protected by the device/browser account; this layer only removes readable
  // credentials from ordinary storage inspection.
  function saveMasterConfig(cfg){
    const master={type:'master',database:{databaseURL:safeText(cfg.databaseURL),authToken:safeText(cfg.authToken)},adminRootPath:cfg.adminRootPath||'cashTopExchange/cashTopAdmin',rootPath:cfg.rootPath||'cashTopExchange/cashTopPOS',savedAt:Date.now()};
    localStorage.setItem(MASTER_KEY,wrapText(JSON.stringify(master)));
    window.CASHTOP_MASTER=master;
    return master;
  }
  function readMasterConfig(){
    for(const key of [MASTER_KEY,LEGACY_MASTER_KEY]){
      try{const raw=localStorage.getItem(key);if(raw){const master=JSON.parse(unwrapText(raw));window.CASHTOP_MASTER=master;return master;}}catch(_){}
    }
    try{const old=JSON.parse(localStorage.getItem(LEGACY_MASTER_KEY_V2)||'null');if(old?.plain){const master=JSON.parse(decodeURIComponent(escape(atob(old.plain))));window.CASHTOP_MASTER=master;return master;}}catch(_){}
    return null;
  }
  async function loadMasterConfig(){return readMasterConfig();}
  // Bootstrap synchronously before turso-config.js executes on the admin page.
  try{readMasterConfig();}catch(_){}
  function buildRolePayload(type,account,extra={}){const rt=readRuntime()||{};const session=window.Cashtop?.getSession?.()||{};return {type,activationKey:session.companyKey||rt.companyKey||'',fileId:`${String(type).toUpperCase()}_${account?.id||Date.now()}`,companyId:session.companyId||session.tenantId||rt.companyId||'',tenantId:session.tenantId||session.companyId||rt.companyId||'',companyKey:session.companyKey||rt.companyKey||'',companyName:session.companyName||rt.companyName||'الشركة',role:account?.role||type,status:session.status||'active',plan:session.plan||'pro',startAt:session.licenseStart||'',expiresAt:session.licenseEnd||'',rootPath:rt.rootPath||'cashTopExchange/cashTopPOS',adminRootPath:rt.adminRootPath||'cashTopExchange/cashTopAdmin',database:rt.database||{},permissions:account?.permissions||{},username:account?.username||'',account,...extra};}
  function decodeRemoteDatasetValue(value){
    let v=value;
    for(let i=0;i<6;i++){
      if(v==null)return null;
      if(v&&typeof v==='object'&&v.deleted===true)return null;
      if(v&&typeof v==='object'&&Object.prototype.hasOwnProperty.call(v,'value')){v=v.value;continue}
      if(typeof v==='string'){try{v=JSON.parse(v);continue}catch(_){}}
      break;
    }
    return v;
  }
  async function assertRoleAccountRemote(payload){
    const type=safeText(payload?.type),account=payload?.account||{};
    const companyId=safeText(payload?.companyId||payload?.tenantId),root=safeText(payload?.rootPath||'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g,'');
    const db=readDatabaseAccess(companyId)||payload?.database||{};
    if(!companyId||!db.databaseURL||!db.authToken)throw new Error('بيانات قاعدة الشركة غير جاهزة لإنشاء ملف الدخول.');
    const read=async key=>decodeRemoteDatasetValue(await tursoDirect.readExact(db,`${root}/${companyId.replace(/[.#$\[\]\/]/g,'_')}/datasets/${key}`));
    const access=await read('cashtop_company_access');
    if(!access||safeText(access.companyKey).toUpperCase()!==safeText(payload.companyKey||payload.activationKey).toUpperCase()||access.status!=='active')throw new Error('مفتاح الشركة غير نشط أو غير موجود في قاعدة الشركة.');
    const same=(a,b)=>String(a||'')===String(b||'');
    const versionOk=(a,b)=>String(a||'')===String(b||'');
    const list=v=>Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v):[]);
    if(type==='employee'){
      const row=list(await read('cashtop_employees')).find(x=>same(x?.id,account.id));
      if(!row||!versionOk(row.authVersion,account.authVersion))throw new Error('حساب الموظف لم يصل إلى قاعدة الشركة بعد.');
    }else if(type==='branch-manager'){
      const row=list(await read('cashtop_branches')).find(x=>same(x?.managerUserId,account.id)||same(x?.id,account.branchRecordId));
      if(!row||!versionOk(row.managerAuthVersion,account.authVersion))throw new Error('حساب مدير الفرع لم يصل إلى قاعدة الشركة بعد.');
    }else if(type==='representative'){
      const row=list(await read('cashtop_sales_agents')).find(x=>same(x?.id,account.id));
      if(!row||!versionOk(row.authVersion,account.authVersion))throw new Error('حساب المندوب لم يصل إلى قاعدة الشركة بعد.');
    }
    return true;
  }
  async function prepareVerifiedRoleFile(type,account,fileName,extra={}){
    const payload=buildRolePayload(type,account,extra);
    if(!['employee','branch-manager','representative'].includes(type))return prepareActivationFile(payload,fileName);
    if(!window.Cashtop?.syncNow)throw new Error('المزامنة الداخلية غير جاهزة. أعد فتح الصفحة ثم حاول تنزيل الملف.');
    const result=await window.Cashtop.syncNow({manual:false});
    if(result?.networkDeferred||result?.offline||result?.unavailable||Number(result?.remaining||0)>0||Number(result?.failed||0)>0){
      throw new Error('تم حفظ الحساب محلياً لكن لم يتم تثبيته في قاعدة الشركة بعد. تحقق من الإنترنت ثم أعد تنزيل ملف الدخول.');
    }
    await assertRoleAccountRemote(payload);
    return prepareActivationFile(payload,fileName);
  }
  window.CashtopActivation={version:5,makeFile,prepareActivationFile,downloadActivationFile,parseActivationFile,activatePayload,readRuntime,saveDatabaseAccess,readDatabaseAccess,saveMasterConfig,readMasterConfig,loadMasterConfig,buildRolePayload,prepareVerifiedRoleFile,assertRoleAccountRemote,sealObject,openObject,sealLocalObject,openLocalObject,tursoDirect,constants:{RUNTIME_KEY,MASTER_KEY,LOCAL_DB_ACCESS_KEY,APP_TAG}};
})();
