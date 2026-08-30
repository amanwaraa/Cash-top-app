(function(){
'use strict';
const $=id=>document.getElementById(id);
const cfg=window.CASHTOP_TURSO?.config||{};
const base=String(cfg.databaseURL||'').replace(/\/+$/,'');
const isPathProxy=window.CASHTOP_TURSO?.backendMode==='turso-http-rtdb'||/__turso_rtdb__(?:$|\?)/i.test(base);
function transportUrl(url){if(!isPathProxy)return url;const raw=String(url||'');if(!raw.startsWith(base))return raw;let suffix=raw.slice(base.length).replace(/^\/+/,'');const q=suffix.indexOf('?');const pathPart=(q>=0?suffix.slice(0,q):suffix).replace(/\.json$/i,'');return `${base}?path=${encodeURIComponent(pathPart)}`}
const adminRoot=String(window.CASHTOP_TURSO?.adminRootPath||'cashTopExchange/cashTopAdmin').replace(/^\/+|\/+$/g,'');
const companyRoot=String(window.CASHTOP_TURSO?.rootPath||'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g,'');
const LOCAL_KEY='cashtop_admin_index_v16';
const LEGACY_LOCAL_KEY='cashtop_admin_index_v15';
const SESSION_KEY='cashtop_superadmin_session';
let state={superAdmin:null,databases:{},companies:{},keyIndex:{},retiredKeys:{},updatedAt:0};
let pendingDeleteCompanyId='';
let preparedBackup=null;
let editingKey='';
const parse=(v,f)=>{try{return JSON.parse(v)??f}catch(_){return f}};
const rawGet=k=>Storage.prototype.getItem.call(localStorage,k);
const rawSet=(k,v)=>Storage.prototype.setItem.call(localStorage,k,String(v));
const sessionGet=k=>Storage.prototype.getItem.call(sessionStorage,k);
const sessionSet=(k,v)=>Storage.prototype.setItem.call(sessionStorage,k,String(v));
const sessionRemove=k=>Storage.prototype.removeItem.call(sessionStorage,k);
const normalizeKey=v=>String(v||'').trim().toUpperCase();
const normalizeLimit=value=>{
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.floor(n)):null
};
function normalizeCustomLimits(value){
 const v=value&&typeof value==='object'?value:{};
 const d=v.daily&&typeof v.daily==='object'?v.daily:{};
 const f=v.fixed&&typeof v.fixed==='object'?v.fixed:{};
 return {
  daily:{
   invoices:normalizeLimit(d.invoices),customers:normalizeLimit(d.customers),
   expenses:normalizeLimit(d.expenses),suppliers:normalizeLimit(d.suppliers)
  },
  fixed:{
   employees:normalizeLimit(f.employees),warehouses:normalizeLimit(f.warehouses),
   branches:normalizeLimit(f.branches),products:normalizeLimit(f.products)
  }
 };
}
function readCustomLimitsFromForm(){
 const read=id=>normalizeLimit($(id)?.value);
 return {daily:{invoices:read('limitInvoicesDaily'),customers:read('limitCustomersDaily'),expenses:read('limitExpensesDaily'),suppliers:read('limitSuppliersDaily')},
 fixed:{employees:read('limitEmployeesFixed'),warehouses:read('limitWarehousesFixed'),branches:read('limitBranchesFixed'),products:read('limitProductsFixed')}};
}
function fillCustomLimits(value){
 const v=normalizeCustomLimits(value);
 const set=(id,val)=>{const el=$(id);if(el)el.value=val==null?'':String(val)};
 set('limitInvoicesDaily',v.daily.invoices);set('limitCustomersDaily',v.daily.customers);
 set('limitExpensesDaily',v.daily.expenses);set('limitSuppliersDaily',v.daily.suppliers);
 set('limitEmployeesFixed',v.fixed.employees);set('limitWarehousesFixed',v.fixed.warehouses);
 set('limitBranchesFixed',v.fixed.branches);set('limitProductsFixed',v.fixed.products);
}
function decodeStoredValue(value,fallback=null){
 let parsed=value;
 for(let i=0;i<3&&typeof parsed==='string';i+=1){const decoded=parse(parsed,null);if(decoded===null)break;parsed=decoded}
 if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.prototype.hasOwnProperty.call(parsed,'value')&&(parsed.valueEncoding||Object.prototype.hasOwnProperty.call(parsed,'deleted')||Object.prototype.hasOwnProperty.call(parsed,'updatedAt'))){
  if(parsed.deleted===true)return fallback;
  return decodeStoredValue(parsed.value,fallback);
 }
 return parsed==null?fallback:parsed;
}
function normalizeRecordArray(value,signatureKeys=[]){
 const parsed=decodeStoredValue(value,[]);
 if(Array.isArray(parsed))return parsed.filter(item=>item&&typeof item==='object'&&!Array.isArray(item));
 if(parsed&&typeof parsed==='object'){
  if(signatureKeys.some(key=>Object.prototype.hasOwnProperty.call(parsed,key)))return [parsed];
  return Object.entries(parsed).map(([key,item])=>{
   const decoded=decodeStoredValue(item,null);
   if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))return null;
   return decoded.id==null&&!/^\d+$/.test(key)?{...decoded,id:key}:decoded;
  }).filter(Boolean);
 }
 return [];
}
function normalizePlainObject(value){const parsed=decodeStoredValue(value,{});return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}
const safeSeg=v=>String(v||'').trim().replace(/[.#$\[\]\/]/g,'_');
function databaseRegistryId(url){const text=String(url||'').trim().toLowerCase();let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return `DB_${(h>>>0).toString(36).toUpperCase()}`}
function normalizeDatabaseUrl(v){return String(v||'').trim().replace(/\/+$/,'').toLowerCase()}
function status(message,type='info'){const box=$('authStatus');if(!box)return;box.className=`status show ${type}`;box.textContent=message}
function toast(message,type='success'){
 let host=document.getElementById('adminToastHost');if(!host){host=document.createElement('div');host.id='adminToastHost';host.style.cssText='position:fixed;bottom:18px;right:18px;z-index:9999;display:grid;gap:8px;max-width:min(380px,calc(100vw - 36px))';document.body.appendChild(host)}
 const el=document.createElement('div');el.textContent=message;el.style.cssText=`padding:11px 14px;border-radius:8px;color:#fff;font:700 11px Cairo;box-shadow:0 8px 25px rgba(0,0,0,.18);background:${type==='error'?'#dd4b39':type==='warning'?'#f39c12':'#00a65a'}`;host.appendChild(el);setTimeout(()=>el.remove(),3600)
}
async function hashPassword(password,salt){const data=new TextEncoder().encode(`${salt}:${password}`);const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function makeSalt(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random()}`}
async function request(url,options={},timeout=18000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const target=transportUrl(url);
  let sendOptions={...options,signal:controller.signal,cache:'no-store'};
  if(isPathProxy&&sendOptions.headers){
   const h=new Headers(sendOptions.headers);
   ['cache-control','pragma','if-match'].forEach(n=>h.delete(n));
   sendOptions={...sendOptions,headers:h};
  }
  const response=await fetch(target,sendOptions);
  if(!response.ok){
   const payload=await response.json().catch(()=>null);
   throw new Error(String(payload?.error?.message||payload?.error||`Turso API ${response.status}`));
  }
  return response;
 }finally{clearTimeout(timer)}
}
function adminUrl(path=''){return `${base}/${adminRoot}${path?'/'+path:''}.json`}
function companyUrl(companyId){return `${base}/${companyRoot}/${safeSeg(companyId)}.json`}function companyDatasetUrl(companyId,key){return `${base}/${companyRoot}/${safeSeg(companyId)}/datasets/${safeSeg(key)}.json`}function companyMetaUrl(companyId){return `${base}/${companyRoot}/${safeSeg(companyId)}/meta.json`}
function masterVaultSecret(){return String(window.CASHTOP_MASTER?.database?.authToken||'').trim()}
async function encodeStateForRemote(source){
 const out=JSON.parse(JSON.stringify(source||{})),secret=masterVaultSecret();
 if(!secret)return out;
 // سجل قواعد الشركات في القاعدة الأم: الاسم/المعرف يبقيان للفهرسة، أما الرابط والتوكن في خزنة AES-GCM.
 for(const d of Object.values(out.databases||{})){
  const connection={databaseURL:d?.databaseURL||'',authToken:d?.authToken||''};
  if(connection.databaseURL||connection.authToken)d.connectionVault=await window.CashtopActivation.sealObject(connection,secret);
  delete d.databaseURL;delete d.authToken;delete d.databaseVault;
 }
 for(const c of Object.values(out.companies||{})){const secrets={database:c?.database||null,managerPassword:c?.managerPassword||''};if(secrets.database?.databaseURL||secrets.managerPassword){c.secretsVault=await window.CashtopActivation.sealObject(secrets,secret);delete c.database;delete c.managerPassword;}delete c.databaseVault;}
 return out;
}
async function decodeStateFromRemote(source){
 const out=source&&typeof source==='object'?JSON.parse(JSON.stringify(source)):source,secret=masterVaultSecret();
 if(!out||!secret)return out;
 for(const d of Object.values(out.databases||{})){
  try{if(d?.connectionVault){const connection=await window.CashtopActivation.openObject(d.connectionVault,secret);d.databaseURL=connection?.databaseURL||'';d.authToken=connection?.authToken||'';}else if(d?.databaseVault){const connection=await window.CashtopActivation.openObject(d.databaseVault,secret);d.databaseURL=connection?.databaseURL||'';d.authToken=connection?.authToken||'';}}
  catch(e){console.warn('[ADMIN] database registry vault',e);d.databaseURL=d.databaseURL||'';d.authToken=d.authToken||'';}
  delete d.connectionVault;delete d.databaseVault;
 }
 for(const c of Object.values(out.companies||{})){try{if(c?.secretsVault){const secrets=await window.CashtopActivation.openObject(c.secretsVault,secret);c.database=secrets?.database||{databaseURL:'',authToken:''};c.managerPassword=secrets?.managerPassword||'';}else if(c?.databaseVault&&!c.database){c.database=await window.CashtopActivation.openObject(c.databaseVault,secret)}}catch(e){console.warn('[ADMIN] child secrets vault',e);c.database=c.database||{databaseURL:'',authToken:''};}delete c.secretsVault;delete c.databaseVault;}
 return out;
}
async function saveLocalStateOnly(){try{rawSet(LOCAL_KEY,await window.CashtopActivation.sealLocalObject(state));rawSet(LEGACY_LOCAL_KEY,'')}catch(e){console.warn('[ADMIN] local vault',e)}}
async function loadRemote(){if(!base)return null;try{const r=await request(adminUrl());return await decodeStateFromRemote(await r.json())}catch(e){console.warn('[ADMIN] load remote',e);return null}}
async function loadLocal(){
 for(const key of [LOCAL_KEY,LEGACY_LOCAL_KEY]){try{const raw=rawGet(key);if(raw&&String(raw).startsWith('CTV1.')){const opened=await window.CashtopActivation.openLocalObject(raw);if(opened){if(key!==LOCAL_KEY){state=normalizeState(opened);await saveLocalStateOnly()}return opened}}}catch(e){console.warn('[ADMIN] local state vault',key,e)}}
 const legacy=parse(rawGet(LOCAL_KEY),null)||parse(rawGet(LEGACY_LOCAL_KEY),null);if(legacy)try{state=normalizeState(legacy);await saveLocalStateOnly()}catch(_){}return legacy;
}
function normalizeState(value){
 const s=value&&typeof value==='object'?value:{};
 const companies=s.companies&&typeof s.companies==='object'?s.companies:{};
 const databases=s.databases&&typeof s.databases==='object'?s.databases:{};
 const keyIndex=s.keyIndex&&typeof s.keyIndex==='object'?s.keyIndex:{};
 const retiredKeys=s.retiredKeys&&typeof s.retiredKeys==='object'?s.retiredKeys:{};
 Object.entries(databases).forEach(([id,d])=>{if(!d||typeof d!=='object'){delete databases[id];return}d.id=String(d.id||id);d.name=String(d.name||d.databaseName||'قاعدة بدون اسم').trim();d.databaseURL=String(d.databaseURL||'').trim();d.authToken=String(d.authToken||'');d.createdAt=d.createdAt||new Date().toISOString();});
 Object.values(companies).forEach(c=>{
  c.backupImportEnabled=c.backupImportEnabled===true;c.plan=['plus','pro','custom'].includes(String(c.plan||'').toLowerCase())?String(c.plan).toLowerCase():'pro';c.customLimits=normalizeCustomLimits(c.customLimits);c.tenantId=String(c.tenantId||c.companyId||`TENANT_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);c.companyId=c.tenantId;
  // ترحيل تلقائي للنسخ السابقة: أي قاعدة كانت محفوظة داخل الشركة تُضاف لسجل القواعد مرة واحدة وتُربط الشركة بها.
  const dbUrl=String(c.database?.databaseURL||'').trim();
  if(dbUrl){let dbId=String(c.databaseRefId||'');let d=dbId?databases[dbId]:null;if(!d){d=Object.values(databases).find(x=>normalizeDatabaseUrl(x.databaseURL)===normalizeDatabaseUrl(dbUrl));dbId=d?.id||databaseRegistryId(dbUrl)}if(!d){d={id:dbId,name:String(c.databaseName||c.companyName||'قاعدة الشركة').trim(),databaseURL:dbUrl,authToken:String(c.database?.authToken||''),createdAt:c.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};databases[dbId]=d}else if(!d.authToken&&c.database?.authToken)d.authToken=String(c.database.authToken);c.databaseRefId=dbId;c.databaseName=d.name;}
  if(c.key){const seg=safeSeg(normalizeKey(c.key));if(c.deleted===true||c.status==='deleted'){delete keyIndex[seg];retiredKeys[seg]={tenantId:c.tenantId,companyId:c.tenantId,key:normalizeKey(c.key),deletedAt:c.updatedAt||Date.now()};}else{keyIndex[seg]={...(keyIndex[seg]||{}),tenantId:c.tenantId,companyId:c.tenantId,key:normalizeKey(c.key)};delete retiredKeys[seg];}}
 });
 return {superAdmin:s.superAdmin||null,databases,companies,keyIndex,retiredKeys,updatedAt:Number(s.updatedAt||0)}
}
async function saveState(){state.updatedAt=Date.now();await saveLocalStateOnly();if(!base){$('syncMode').textContent='محلي — قاعدة الأم غير مضبوطة';return false}try{const remoteState=await encodeStateForRemote(state);await request(adminUrl(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(remoteState)});$('syncMode').textContent='Turso متزامن + خزنة محلية مشفرة';return true}catch(e){$('syncMode').textContent='محلي — تعذر Turso';toast(`حُفظ محلياً، وتعذرت مزامنة الإدارة مع Turso: ${e.message}`,'warning');return false}}
function sessionValid(){const s=parse(sessionGet(SESSION_KEY),null);return Boolean(s&&s.expiresAt>Date.now())}
function showApp(){$('authView').classList.add('hidden');$('appView').classList.remove('hidden');render();setTimeout(()=>repairChildAccessIndexes().catch(e=>console.warn('[ADMIN] child access repair',e)),80)}
function setupAuthView(){const first=!state.superAdmin;$('confirmField').classList.toggle('hidden',!first);$('authSubtitle').textContent=first?'إنشاء أول حساب للمشرف العام':'دخول المشرف العام';$('authButton').innerHTML=first?'<i class="fa-solid fa-user-shield"></i> إنشاء حساب الإدارة':'<i class="fa-solid fa-shield-halved"></i> دخول الإدارة'}
async function handleAuth(e){e.preventDefault();const username=$('superUsername').value.trim(),password=$('superPassword').value;if(!state.superAdmin){const confirm=$('superPasswordConfirm').value;if(password!==confirm)return status('كلمتا المرور غير متطابقتين.','error');if(password.length<6)return status('كلمة المرور يجب أن تكون 6 أحرف على الأقل.','error');const salt=makeSalt();state.superAdmin={username,passwordHash:await hashPassword(password,salt),salt,createdAt:new Date().toISOString(),authVersion:Date.now()};await saveState();sessionSet(SESSION_KEY,JSON.stringify({username,expiresAt:Date.now()+8*60*60*1000}));showApp();return}const expected=await hashPassword(password,state.superAdmin.salt);if(String(username).toLowerCase()!==String(state.superAdmin.username).toLowerCase()||expected!==state.superAdmin.passwordHash)return status('بيانات المشرف العام غير صحيحة.','error');sessionSet(SESSION_KEY,JSON.stringify({username:state.superAdmin.username,expiresAt:Date.now()+8*60*60*1000}));showApp()}
function planNote(){
 const plan=$('plan').value;
 $('customLimitsPanel')?.classList.toggle('hidden',plan!=='custom');
 $('planDetails').innerHTML=plan==='plus'
  ?'<b>Plus:</b> تطبق حدود Plus المحددة مسبقاً على الشركة.'
  :plan==='custom'
   ?'<b>مخصصة:</b> حدد الحدود اليومية والثابتة يدوياً من الحقول أدناه.'
   :'<b>Pro:</b> جميع الحدود غير محدودة.';
}
function calcExpiry(start=new Date()){const unit=$('durationUnit').value,q=Math.max(1,Number($('durationQuantity').value||1));if(unit==='unlimited')return '';const d=new Date(start);if(unit==='minute')d.setMinutes(d.getMinutes()+q);if(unit==='hour')d.setHours(d.getHours()+q);if(unit==='day')d.setDate(d.getDate()+q);if(unit==='month')d.setMonth(d.getMonth()+q);if(unit==='year')d.setFullYear(d.getFullYear()+q);return d.toISOString()}
function updateExpiryPreview(){const unit=$('durationUnit').value;$('durationQuantity').disabled=unit==='unlimited';const end=calcExpiry();$('expiryPreview').textContent=end?'تم تحديد مدة الاشتراك.':'مدة الاشتراك غير محدودة.'}
function generateKey(){return `CT-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Date.now().toString(36).slice(-5).toUpperCase()}`}
function databaseList(){return Object.values(state.databases||{}).filter(d=>d&&d.id).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar'))}
function databaseById(id){return state.databases?.[String(id||'')]||null}
function databaseForCompany(c){if(!c)return null;const direct=databaseById(c.databaseRefId);if(direct)return direct;const url=normalizeDatabaseUrl(c.database?.databaseURL);return databaseList().find(d=>normalizeDatabaseUrl(d.databaseURL)===url)||null}
function companyUsesDatabase(c,id){if(!c||!id)return false;if(String(c.databaseRefId||'')===String(id))return true;const d=databaseById(id);return Boolean(d&&normalizeDatabaseUrl(c.database?.databaseURL)===normalizeDatabaseUrl(d.databaseURL))}
function fillDatabaseOptions(selectId,selected=''){
 const el=$(selectId);if(!el)return;const keep=String(selected||el.value||'');const list=databaseList();
 el.innerHTML='<option value="">اختر قاعدة محفوظة...</option>'+list.map(d=>`<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
 el.value=list.some(d=>String(d.id)===keep)?keep:'';
}
function applySelectedDatabaseToCompany(id){const d=databaseById(id);$('companyDatabaseName').value=d?.name||'';$('companyDatabaseURL').value=d?.databaseURL||'';$('companyAuthToken').value=d?.authToken||'';}
function renderDatabaseRegistryDetails(){
 const select=$('databaseRegistrySelect');if(!select)return;const list=databaseList();const current=String(select.value||'');const d=databaseById(current)||list[0]||null;if(d&&select.value!==d.id)select.value=d.id;
 if(!d){$('databaseRegistryDetails').innerHTML='<div class="database-empty">لا توجد قواعد محفوظة بعد. اضغط «إضافة قاعدة» لإضافة أول قاعدة.</div>';$('databaseRegistryKeys').innerHTML='';return}
 const linked=Object.values(state.companies||{}).filter(c=>c&&!c.deleted&&companyUsesDatabase(c,d.id));
 $('databaseRegistryDetails').innerHTML=`<div class="database-summary"><div class="mini"><span>اسم القاعدة</span><strong>${escapeHtml(d.name)}</strong></div><div class="mini"><span>الرابط</span><strong dir="ltr">${escapeHtml(d.databaseURL||'—')}</strong></div><div class="mini"><span>التوكن</span><strong>${d.authToken?'محفوظ ومشفر ✓':'غير موجود'}</strong></div></div>`;
 $('databaseRegistryKeys').innerHTML=linked.length?`<div class="note" style="margin-top:10px"><b>مفاتيح الشركات على هذه القاعدة (${linked.length}):</b></div><div class="database-keys">${linked.sort((a,b)=>String(a.companyName||'').localeCompare(String(b.companyName||''),'ar')).map(c=>`<span class="database-key-chip ${c.status==='active'?'':'stopped'}"><span>${escapeHtml(c.companyName)}</span><code>${escapeHtml(c.key)}</code></span>`).join('')}</div>`:'<div class="database-empty">لا توجد مفاتيح شركات مرتبطة بهذه القاعدة حتى الآن.</div>';
}
function renderDatabaseRegistry(){
 const list=databaseList();const reg=$('databaseRegistrySelect');if(reg){const keep=String(reg.value||'');reg.innerHTML=list.length?list.map(d=>`<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join(''):'<option value="">لا توجد قواعد محفوظة</option>';reg.value=list.some(d=>d.id===keep)?keep:(list[0]?.id||'');}
 const companySel=$('companyDatabaseRegistry');if(companySel){const keep=String(companySel.value||'');fillDatabaseOptions('companyDatabaseRegistry',keep);if(companySel.value)applySelectedDatabaseToCompany(companySel.value)}
 renderDatabaseRegistryDetails();
}
function openDatabaseModal(){$('databaseForm')?.reset();$('databaseModal')?.classList.add('show');setTimeout(()=>$('databaseName')?.focus(),30)}
function closeDatabaseModal(){$('databaseModal')?.classList.remove('show')}
async function saveDatabaseRegistry(e){
 e.preventDefault();const name=String($('databaseName')?.value||'').trim(),url=String($('databaseURL')?.value||'').trim(),token=String($('databaseAuthToken')?.value||'').trim();
 if(!name||!url||!token)return toast('أدخل اسم القاعدة والرابط والتوكن.','error');if(!/^(?:libsql|https?):\/\//i.test(url))return toast('رابط القاعدة غير صالح. استخدم رابط Turso الصحيح.','error');
 const same=databaseList().find(d=>normalizeDatabaseUrl(d.databaseURL)===normalizeDatabaseUrl(url));const now=new Date().toISOString();const id=same?.id||databaseRegistryId(url);state.databases=state.databases||{};state.databases[id]={...(same||{}),id,name,databaseURL:url,authToken:token,createdAt:same?.createdAt||now,updatedAt:now};
 // إذا تم تحديث قاعدة موجودة، نحدّث بيانات الاتصال في كل الشركات المرتبطة حتى تكون ملفات الدخول التالية على التوكن الجديد.
 Object.values(state.companies||{}).forEach(c=>{if(companyUsesDatabase(c,id)){c.databaseRefId=id;c.databaseName=name;c.database={...(c.database||{}),databaseURL:url,authToken:token};}});
 try{const synced=await saveState();closeDatabaseModal();renderDatabaseRegistry();$('databaseRegistrySelect').value=id;renderDatabaseRegistryDetails();fillDatabaseOptions('companyDatabaseRegistry',id);$('companyDatabaseRegistry').value=id;applySelectedDatabaseToCompany(id);toast(synced?(same?'تم تحديث القاعدة في القاعدة الأم وربط بياناتها بالمفاتيح الحالية.':'تمت إضافة القاعدة إلى القاعدة الأم وأصبحت جاهزة للاختيار.'):'تم حفظ القاعدة محلياً، لكن لم تصل للقاعدة الأم. راجع اتصال قاعدة الأم ثم أعد الحفظ.',synced?'success':'warning')}catch(err){toast('تعذر حفظ القاعدة: '+(err.message||err),'error')}
}

function companyAccess(company){const tenantId=String(company.tenantId||company.companyId);return {tenantId,companyId:tenantId,companyKey:company.key,companyName:company.companyName,status:company.status,plan:company.plan,customLimits:normalizeCustomLimits(company.customLimits),startAt:company.startAt,endAt:company.endAt,durationUnit:company.durationUnit,durationQuantity:company.durationQuantity,backupImportEnabled:company.backupImportEnabled===true,authVersion:company.authVersion,updatedAt:Date.now(),manager:{id:`ADMIN_${tenantId}`,username:company.managerUsername,displayName:'مدير الشركة',role:'admin',active:company.status==='active',permissions:{},authVersion:company.authVersion}}}
function payload(value){return {value:JSON.stringify(value),valueEncoding:'local-storage-json-v1',deleted:false,updatedAt:Date.now(),revision:1,deviceId:'admin-console',page:'admin-console'}}
async function publishCompanyAccessToChild(company){
 const direct=window.CashtopActivation?.tursoDirect;if(!direct?.writeExact)throw new Error('مشغل قاعدة الشركة غير متاح.');
 const db=company?.database||{};if(!db.databaseURL||!db.authToken)throw new Error('أدخل رابط وتوكن قاعدة الشركة قبل الحفظ.');
 const tenantId=safeSeg(company.tenantId||company.companyId),root=companyRoot,stamp=Date.now();
 const accessPath=`${root}/${tenantId}/datasets/cashtop_company_access`;
 const metaPath=`${root}/${tenantId}/meta`;
 await direct.writeExact(db,accessPath,payload(companyAccess(company)));
 let meta={};try{const current=await direct.readExact(db,metaPath);if(current&&typeof current==='object'&&!Array.isArray(current))meta=current}catch(_){}
 const changed=Array.isArray(meta.changedKeys)?meta.changedKeys:[];
 const nextMeta={...meta,tenantId,companyId:tenantId,companyKey:company.key,companyName:company.companyName,schema:19,datasetStampSchema:1,datasetStamps:{...(meta.datasetStamps||{}),cashtop_company_access:stamp},changedKeys:[...new Set([...changed,'cashtop_company_access'])],updatedAt:stamp,managedBy:'cashTopAdmin'};
 await direct.writeExact(db,metaPath,nextMeta);
 return true;
}
let childRepairStarted=false;
async function repairChildAccessIndexes(){
 if(childRepairStarted)return;childRepairStarted=true;
 const companies=Object.values(state.companies||{}).filter(c=>c?.database?.databaseURL&&c?.database?.authToken);
 if(!companies.length)return;
 const results=await mapConcurrent(companies,2,async c=>{await publishCompanyAccessToChild(c);return true});
 const failed=results.filter(x=>x instanceof Error);
 if(failed.length)toast(`تعذر تحديث سجل الدخول في ${failed.length} قاعدة شركة. افتح الشركة واحفظها بعد مراجعة الرابط والتوكن.`,'warning');
}
async function writeCompany(company){
 const tenantId=String(company.tenantId||company.companyId);company.tenantId=tenantId;company.companyId=tenantId;
 const accessPayload=payload(companyAccess(company));
 if(base){
  // اكتب بيانات الوصول أولاً ثم أعلن التغيير في meta. بهذه الطريقة لا يرى
  // جهاز آخر revision جديداً قبل اكتمال صف صلاحيات الشركة. PATCH ذري ولا يحتاج قراءة مسبقة.
  await request(companyDatasetUrl(tenantId,'cashtop_company_access'),{method:'PUT',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:JSON.stringify(accessPayload)});
  const announcedAt=Date.now();
  await request(companyMetaUrl(tenantId),{method:'PATCH',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:JSON.stringify({tenantId,companyId:tenantId,companyKey:company.key,companyName:company.companyName,schema:19,datasetStampSchema:1,datasetStamps:{cashtop_company_access:announcedAt},changedKeys:['cashtop_company_access'],updatedAt:announcedAt,managedBy:'cashTopAdmin'})});
 }
 let licenses=normalizeRecordArray(rawGet('cashtop_admin_licenses'),['key','tenantId','companyId','companyName','plan','status']);
 /* نعالج تلقائياً أي صيغة قديمة: Array أو Object أو قيمة قاعدة قديمة مغلفة، ثم نوحدها إلى Array قبل filter/find. */
 licenses=licenses.filter(x=>normalizeKey(x.key)!==normalizeKey(company.key)||String(x.tenantId||x.companyId||x.id)===tenantId);
 const li=licenses.findIndex(x=>String(x.tenantId||x.companyId||x.id)===tenantId);
 const license={id:tenantId,key:company.key,tenantId,companyId:tenantId,companyName:company.companyName,status:company.status,plan:company.plan,customLimits:normalizeCustomLimits(company.customLimits),startAt:company.startAt,endAt:company.endAt,durationUnit:company.durationUnit,durationQuantity:company.durationQuantity,backupImportEnabled:company.backupImportEnabled===true};
 if(li>=0)licenses[li]=license;else licenses.push(license);rawSet('cashtop_admin_licenses',JSON.stringify(licenses));
 let users=normalizeRecordArray(rawGet('cashtop_admin_users'),['username','companyKey','tenantId','companyId','role']);
 users=users.filter(x=>normalizeKey(x.companyKey)!==normalizeKey(company.key)||String(x.tenantId||x.companyId||'')===tenantId);
 const ui=users.findIndex(x=>String(x.tenantId||x.companyId||'')===tenantId&&x.role==='admin');
 const user={id:`ADMIN_${tenantId}`,companyKey:company.key,tenantId,companyId:tenantId,username:company.managerUsername,password:company.managerPassword,displayName:'مدير الشركة',role:'admin',active:company.status==='active'};
 if(ui>=0)users[ui]=user;else users.push(user);rawSet('cashtop_admin_users',JSON.stringify(users));
 const bindings=normalizePlainObject(rawGet('cashtop_tenant_bindings'));if(company.deleted===true||company.status==='deleted')delete bindings[normalizeKey(company.key)];else bindings[normalizeKey(company.key)]=tenantId;rawSet('cashtop_tenant_bindings',JSON.stringify(bindings));
}
async function writeCompanyAccessOnly(company){
 const tenantId=String(company.tenantId||company.companyId);if(!base)return true;const accessPayload=payload(companyAccess(company));
 await request(companyDatasetUrl(tenantId,'cashtop_company_access'),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(accessPayload)},9000);
 const announcedAt=Date.now();
 await request(companyMetaUrl(tenantId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId,companyId:tenantId,companyKey:company.key,companyName:company.companyName,schema:19,datasetStampSchema:1,datasetStamps:{cashtop_company_access:announcedAt},changedKeys:['cashtop_company_access'],updatedAt:announcedAt,managedBy:'cashTopAdmin'})},9000);
 return true;
}
async function mapConcurrent(items,limit,worker){let cursor=0;const results=[];async function run(){while(cursor<items.length){const i=cursor++;try{results[i]=await worker(items[i],i)}catch(e){results[i]=e}}}await Promise.all(Array.from({length:Math.min(limit,items.length||1)},run));return results}
async function saveCompany(e){
 e.preventDefault();const stateBeforeSave=JSON.stringify(state);const key=normalizeKey($('companyKey').value);if(!key)return toast('أدخل مفتاح الشركة.','error');
 const keySeg=safeSeg(key);
 const existingIndex=editingKey&&state.keyIndex[safeSeg(normalizeKey(editingKey))];
 const retired=state.retiredKeys?.[keySeg];
 const editingTenant=String(existingIndex&&(existingIndex.tenantId||existingIndex.companyId)||'');
 const retiredTenant=String(retired&&(retired.tenantId||retired.companyId)||'');
 // المفتاح المحذوف حذفاً عادياً يبقى مرتبطاً بنفس tenant حتى تعود نفس البيانات عند إضافته من جديد.
 // وإذا كان المستخدم يعدّل شركة أخرى فلا نسمح له باختطاف مفتاح له بيانات محفوظة؛
 // يُعاد إدخال المفتاح من نموذج شركة جديدة ليعود تلقائياً إلى شركته السابقة.
 if(editingTenant&&retiredTenant&&editingTenant!==retiredTenant)return toast('هذا المفتاح مرتبط ببيانات شركة محفوظة. ألغِ التعديل وأضف المفتاح من جديد لاستعادة نفس الشركة.','warning');
 const existingId=String(editingTenant||retiredTenant||'');
 const duplicateEntry=state.keyIndex[keySeg];const duplicate=duplicateEntry&&(duplicateEntry.tenantId||duplicateEntry.companyId);
 if(duplicate&&String(duplicate)!==existingId)return toast('مفتاح الشركة مستخدم لشركة أخرى نشطة.','error');
 const existing=existingId?state.companies[existingId]:null;const now=new Date();
 const databaseRefId=String($('companyDatabaseRegistry')?.value||'');const selectedDatabase=databaseById(databaseRefId);if(!selectedDatabase)return toast('اختر قاعدة بيانات محفوظة من القائمة المنسدلة أولاً.','error');
 const tenantId=String(existing?.tenantId||existing?.companyId||existingId||`TENANT_${Date.now()}_${crypto.randomUUID?crypto.randomUUID().slice(0,8):Math.random().toString(36).slice(2,10)}`);
 const company={tenantId,companyId:tenantId,companyName:$('companyName').value.trim(),key,managerUsername:$('managerUsername').value.trim(),managerPassword:$('managerPassword').value||existing?.managerPassword||'',plan:$('plan').value,customLimits:readCustomLimitsFromForm(),status:$('status').value,backupImportEnabled:$('backupImportEnabled').value==='true',databaseRefId,databaseName:selectedDatabase.name,database:{databaseURL:selectedDatabase.databaseURL,authToken:selectedDatabase.authToken},durationUnit:$('durationUnit').value,durationQuantity:$('durationUnit').value==='unlimited'?null:Math.max(1,Number($('durationQuantity').value||1)),startAt:existing?.startAt||now.toISOString(),endAt:calcExpiry(existing?.startAt?new Date(existing.startAt):now),authVersion:Date.now(),createdAt:existing?.createdAt||now.toISOString(),updatedAt:now.toISOString()};
 delete company.deleted;delete company.deletedAt;
 if(!company.companyName||!company.managerUsername||!company.managerPassword)return toast('أكمل اسم الشركة وبيانات مديرها.','error');
 if(!company.database?.databaseURL||!company.database?.authToken)return toast('أدخل رابط وتوكن قاعدة الشركة. لا يمكن إنشاء ملف دخول بدون قاعدة مرتبطة.','error');
 if(!/^(?:libsql|https?):\/\//i.test(company.database.databaseURL))return toast('رابط قاعدة الشركة غير صالح. استخدم رابط Turso الصحيح.','error');
 if(editingKey&&normalizeKey(editingKey)!==key){const oldKey=normalizeKey(editingKey),oldSeg=safeSeg(oldKey);delete state.keyIndex[oldSeg];delete state.retiredKeys?.[oldSeg];const bindings=normalizePlainObject(rawGet('cashtop_tenant_bindings'));delete bindings[oldKey];rawSet('cashtop_tenant_bindings',JSON.stringify(bindings));}
 state.companies[tenantId]=company;state.keyIndex[keySeg]={tenantId,companyId:tenantId,key,updatedAt:Date.now()};delete state.retiredKeys?.[keySeg];
 try{await publishCompanyAccessToChild(company);await writeCompany(company);await saveState();toast(retired?'تمت إعادة تفعيل المفتاح وربطه بنفس بيانات الشركة السابقة.':'تم حفظ الشركة. هذا المفتاح مرتبط بمسار بيانات مستقل بالكامل.');if(company.database?.databaseURL&&company.database?.authToken){try{await downloadManagerActivation(company.tenantId)}catch(_){toast('تم الحفظ لكن تعذر تنزيل ملف مدير الشركة تلقائياً. يمكنك استخدام زر التنزيل من الجدول.','warning')}}resetForm();render()}catch(err){state=normalizeState(parse(stateBeforeSave,{}));await saveLocalStateOnly();render();toast(err.message||'تعذر حفظ الشركة.','error')}
}
function resetForm(){editingKey='';$('editingKey').value='';$('formTitle').textContent='إنشاء شركة ومفتاح جديد';$('companyForm').reset();$('companyKey').value=generateKey();fillDatabaseOptions('companyDatabaseRegistry','');$('companyDatabaseRegistry').value='';applySelectedDatabaseToCompany('');$('durationUnit').value='month';$('durationQuantity').value=1;$('plan').value='plus';$('status').value='active';$('backupImportEnabled').value='false';fillCustomLimits({});$('cancelEdit').classList.add('hidden');planNote();updateExpiryPreview()}
function hydrateRetiredCompanyByKey(){if(editingKey)return;const key=normalizeKey($('companyKey').value),retired=state.retiredKeys?.[safeSeg(key)];if(!retired)return;const tenantId=String(retired.tenantId||retired.companyId||''),c=state.companies[tenantId];if(!c)return;$('companyName').value=c.companyName||'';$('managerUsername').value=c.managerUsername||'';$('managerPassword').value=c.managerPassword||'';const d=databaseForCompany(c);fillDatabaseOptions('companyDatabaseRegistry',d?.id||'');$('companyDatabaseRegistry').value=d?.id||'';applySelectedDatabaseToCompany(d?.id||'');$('plan').value=c.plan||'plus';fillCustomLimits(c.customLimits);$('status').value='active';$('backupImportEnabled').value=String(c.backupImportEnabled===true);$('durationUnit').value=c.durationUnit||'unlimited';$('durationQuantity').value=c.durationQuantity||1;planNote();updateExpiryPreview();toast('تم العثور على هذا المفتاح المحذوف. ستتم إعادة ربطه بنفس بيانات الشركة السابقة عند الحفظ.','info')}
function editCompany(id){const c=state.companies[id];if(!c)return;editingKey=c.key;$('editingKey').value=c.key;$('formTitle').textContent=`تعديل ${c.companyName}`;$('companyName').value=c.companyName;$('companyKey').value=c.key;$('managerUsername').value=c.managerUsername;$('managerPassword').value=c.managerPassword;const d=databaseForCompany(c);fillDatabaseOptions('companyDatabaseRegistry',d?.id||'');$('companyDatabaseRegistry').value=d?.id||'';applySelectedDatabaseToCompany(d?.id||'');$('plan').value=c.plan;fillCustomLimits(c.customLimits);$('status').value=c.status;$('backupImportEnabled').value=String(c.backupImportEnabled===true);$('durationUnit').value=c.durationUnit||'unlimited';$('durationQuantity').value=c.durationQuantity||1;$('cancelEdit').classList.remove('hidden');planNote();updateExpiryPreview();scrollTo({top:0,behavior:'smooth'})}
async function toggleCompany(id){const c=state.companies[id];if(!c)return;const previous={status:c.status,authVersion:c.authVersion,updatedAt:c.updatedAt};c.status=c.status==='active'?'stopped':'active';c.authVersion=Date.now();c.updatedAt=new Date().toISOString();try{await publishCompanyAccessToChild(c);await writeCompany(c);await saveState();render();toast(c.status==='active'?'تم تفعيل المفتاح في القاعدة الأم وقاعدة الشركة.':'تم إيقاف المفتاح في القاعدة الأم وقاعدة الشركة وستُرفض ملفات الدخول.','warning')}catch(e){Object.assign(c,previous);render();toast('تعذر تحديث حالة المفتاح داخل قاعدة الشركة: '+(e.message||e),'error')}}
function deleteCompany(id){const c=state.companies[id];if(!c)return;pendingDeleteCompanyId=id;$('deleteAllCompanyData').checked=false;$('deleteCompanyMessage').innerHTML=`سيتم إيقاف مفتاح <b>${escapeHtml(c.key)}</b> لشركة <b>${escapeHtml(c.companyName)}</b>. إذا لم تحدد حذف جميع البيانات فستبقى بيانات الشركة محفوظة ويمكن إعادة نفس المفتاح لاحقاً لاستكمال العمل عليها.`;$('deleteCompanyModal').classList.add('show')}
function closeDeleteCompanyModal(){pendingDeleteCompanyId='';$('deleteCompanyModal').classList.remove('show');$('deleteAllCompanyData').checked=false}
function purgeLocalCompanyAdminRefs(company){const tenantId=String(company.tenantId||company.companyId),key=normalizeKey(company.key);let licenses=normalizeRecordArray(rawGet('cashtop_admin_licenses'),['key','tenantId','companyId','companyName','plan','status']);licenses=licenses.filter(x=>String(x.tenantId||x.companyId||x.id||'')!==tenantId&&normalizeKey(x.key)!==key);rawSet('cashtop_admin_licenses',JSON.stringify(licenses));let users=normalizeRecordArray(rawGet('cashtop_admin_users'),['username','companyKey','tenantId','companyId','role']);users=users.filter(x=>String(x.tenantId||x.companyId||'')!==tenantId&&normalizeKey(x.companyKey)!==key);rawSet('cashtop_admin_users',JSON.stringify(users));const bindings=normalizePlainObject(rawGet('cashtop_tenant_bindings'));delete bindings[key];rawSet('cashtop_tenant_bindings',JSON.stringify(bindings))}
async function confirmDeleteCompany(){const id=pendingDeleteCompanyId,c=state.companies[id];if(!c)return closeDeleteCompanyModal();const hardDelete=$('deleteAllCompanyData').checked===true;const btn=$('confirmDeleteCompany');btn.disabled=true;try{const key=normalizeKey(c.key),seg=safeSeg(key),tenantId=String(c.tenantId||c.companyId);if(hardDelete){if(c.database?.databaseURL&&c.database?.authToken&&window.CashtopActivation?.tursoDirect?.deletePrefix)await window.CashtopActivation.tursoDirect.deletePrefix(c.database,`${companyRoot}/${safeSeg(tenantId)}`);if(base)await request(companyUrl(tenantId),{method:'DELETE',headers:{'Cache-Control':'no-cache, no-store'}},120000);purgeLocalCompanyAdminRefs(c);delete state.keyIndex[seg];delete state.retiredKeys?.[seg];delete state.companies[id];await saveState();closeDeleteCompanyModal();render();toast('تم حذف المفتاح وجميع بيانات الشركة نهائياً من قاعدة البيانات.','warning');return}c.status='deleted';c.deleted=true;c.deletedAt=new Date().toISOString();c.authVersion=Date.now();c.updatedAt=c.deletedAt;delete state.keyIndex[seg];state.retiredKeys=state.retiredKeys||{};state.retiredKeys[seg]={tenantId,companyId:tenantId,key,deletedAt:Date.now()};const bindings=normalizePlainObject(rawGet('cashtop_tenant_bindings'));delete bindings[key];rawSet('cashtop_tenant_bindings',JSON.stringify(bindings));await publishCompanyAccessToChild(c);await writeCompany(c);await saveState();closeDeleteCompanyModal();render();toast('تم إيقاف المفتاح مع الاحتفاظ بجميع بيانات الشركة. يمكن إعادة نفس المفتاح لاحقاً.','warning')}catch(err){toast(`تعذر تنفيذ الحذف: ${err.message||err}`,'error')}finally{btn.disabled=false}}

function formatBytes(bytes){const n=Number(bytes||0);if(n<1024)return `${n} B`;if(n<1024**2)return `${(n/1024).toFixed(2)} KB`;if(n<1024**3)return `${(n/1024**2).toFixed(2)} MB`;return `${(n/1024**3).toFixed(2)} GB`}
async function prepareFullBackup(){
 const btn=$('prepareBackupBtn');btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> جاري استخراج جميع البيانات...';
 try{
  const companies={};const list=Object.values(state.companies||{});let done=0;
  for(const company of list){const id=String(company.tenantId||company.companyId);try{const r=await request(companyUrl(id),{},60000);companies[id]=await r.json()}catch(err){companies[id]={__backupError:String(err.message||err)}}done++;btn.innerHTML=`<i class="fa-solid fa-circle-notch fa-spin"></i> استخراج ${done}/${list.length}`}
  const packageData={format:'CASH_TOP_FULL_BACKUP',version:2,createdAt:new Date().toISOString(),adminState:await encodeStateForRemote(state),companies};
  const text=JSON.stringify(packageData);preparedBackup={packageData,text,size:new Blob([text]).size};$('backupSize').textContent=formatBytes(preparedBackup.size);$('downloadBackupBtn').disabled=false;toast(`تم تجهيز نسخة شاملة بحجم ${formatBytes(preparedBackup.size)}.`)
 }catch(err){toast(`تعذر تجهيز النسخة: ${err.message||err}`,'error')}finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-magnifying-glass-chart"></i> استخراج البيانات وحساب الحجم'}
}
function downloadPreparedBackup(){if(!preparedBackup)return toast('قم باستخراج البيانات أولاً.','warning');const blob=new Blob([preparedBackup.text],{type:'application/json;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`CashTop_All_Companies_Backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);}
function setRestoreProgress(percent,label=''){const p=Math.max(0,Math.min(100,Math.round(percent)));$('restoreProgress').classList.add('show');$('restoreProgressBar').style.width=`${p}%`;$('restoreProgressLabel').textContent=`${p}%${label?` — ${label}`:''}`}
async function restoreFullBackup(){
 const file=$('restoreBackupFile').files?.[0];if(!file)return toast('اختر ملف النسخة الاحتياطية أولاً.','warning');if(!confirm('سيتم استبدال بيانات الإدارة ومسارات الشركات الموجودة بالنسخة المختارة. هل تريد المتابعة؟'))return;
 const btn=$('restoreBackupBtn');btn.disabled=true;setRestoreProgress(1,'قراءة الملف');
 try{
  const data=JSON.parse(await file.text());if(data?.format!=='CASH_TOP_FULL_BACKUP'||!data.adminState||!data.companies)throw new Error('ملف النسخة غير صالح أو ليس نسخة شاملة من كاش توب.');
  const entries=Object.entries(data.companies);const total=entries.length+1;let done=0;
  state=normalizeState(await decodeStateFromRemote(data.adminState));const remoteAdminState=await encodeStateForRemote(state);await request(adminUrl(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(remoteAdminState)},60000);done++;setRestoreProgress((done/total)*100,'استعادة إعدادات الإدارة');
  for(const [id,value] of entries){await request(companyUrl(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)},120000);done++;setRestoreProgress((done/total)*100,`رفع الشركة ${done-1}/${entries.length}`)}
  await saveLocalStateOnly();setRestoreProgress(100,'اكتملت الاستعادة بنجاح');render();toast('تم استيراد جميع بيانات الشركات والإدارة بنجاح.');
 }catch(err){toast(`فشل الاستيراد: ${err.message||err}`,'error')}finally{btn.disabled=false}
}
async function changeAdminPassword(e){e.preventDefault();const current=$('currentAdminPassword').value,next=$('newAdminPassword').value,confirmPass=$('confirmNewAdminPassword').value;if(next!==confirmPass)return toast('تأكيد كلمة المرور الجديدة غير مطابق.','error');if(next.length<6)return toast('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.','error');const expected=await hashPassword(current,state.superAdmin.salt);if(expected!==state.superAdmin.passwordHash)return toast('كلمة المرور الحالية غير صحيحة.','error');const salt=makeSalt();state.superAdmin={...state.superAdmin,passwordHash:await hashPassword(next,salt),salt,authVersion:Date.now(),updatedAt:new Date().toISOString()};await saveState();$('changeAdminPasswordForm').reset();$('adminSettingsModal').classList.remove('show');toast('تم تغيير كلمة مرور المشرف العام ومزامنتها بنجاح.');}
async function copyKey(key){try{await navigator.clipboard.writeText(key)}catch(_){const input=document.createElement('input');input.value=key;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove()}toast('تم نسخ المفتاح.')}
function fmt(v){return v?new Date(v).toLocaleString('ar-EG'):'غير محدود'}
function render(){
 renderDatabaseRegistry();
 const q=String(($('companySearchInput')?.value||'')).trim().toLowerCase();
 let list=Object.values(state.companies||{}).filter(c=>!c.deleted);
 $('statAll').textContent=list.length;
 $('statActive').textContent=list.filter(c=>c.status==='active'&&(!c.endAt||new Date(c.endAt)>new Date())).length;
 $('statPlus').textContent=list.filter(c=>c.plan==='plus').length;
 $('statPro').textContent=list.filter(c=>c.plan==='pro').length;
 if($('statCustom'))$('statCustom').textContent=list.filter(c=>c.plan==='custom').length;
 const shown=list.filter(c=>!q || String(c.companyName||'').toLowerCase().includes(q) || String(c.key||'').toLowerCase().includes(q));
 $('companiesBody').innerHTML=shown.length?shown.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(c=>{
   const expired=c.endAt&&Date.now()>=new Date(c.endAt).getTime(),statusClass=expired?'expired':c.status==='active'?'active':'stopped',statusText=expired?'منتهي':c.status==='active'?'نشط':'موقوف',lock=c.backupImportEnabled===true?'<span class="badge active"><i class="fa-solid fa-lock-open"></i> مفتوح</span>':'<span class="badge stopped"><i class="fa-solid fa-lock"></i> مقفل</span>';
   return `<tr><td data-label="الشركة"><b>${escapeHtml(c.companyName)}</b></td><td data-label="المفتاح"><div class="key-cell"><code>${escapeHtml(c.key)}</code><button class="btn btn-light" type="button" title="نسخ المفتاح" onclick="AdminPage.copy(decodeURIComponent('${encodeURIComponent(c.key)}'))"><i class="fa-solid fa-copy"></i></button></div></td><td data-label="القاعدة"><b>${escapeHtml(databaseForCompany(c)?.name||c.databaseName||'—')}</b></td><td data-label="الخطة"><span class="badge ${c.plan}">${c.plan==='plus'?'Plus':c.plan==='custom'?'مخصصة':'Pro'}</span></td><td data-label="الحالة"><span class="badge ${statusClass}">${statusText}</span></td><td data-label="المدير"><div style="display:flex;gap:6px;align-items:center;justify-content:center"><span>${escapeHtml(c.managerUsername)}</span><button class="btn btn-light" type="button" title="عرض كلمة المرور" onclick="AdminPage.showPassword('${c.companyId}')"><i class="fa-solid fa-eye"></i></button></div></td><td data-label="استيراد النسخ">${lock}</td><td data-label="البدء">${fmt(c.startAt)}</td><td data-label="الانتهاء">${fmt(c.endAt)}</td><td data-label="الإجراءات"><div class="actions"><button class="btn btn-light" onclick="AdminPage.edit('${c.companyId}')"><i class="fa-solid fa-pen"></i></button><button class="btn ${c.status==='active'?'btn-warning':'btn-success'}" onclick="AdminPage.toggle('${c.companyId}')"><i class="fa-solid fa-power-off"></i></button><button class="btn btn-light" title="تنزيل ملف مدير الشركة" onclick="AdminPage.downloadManager('${c.companyId}')"><i class="fa-solid fa-file-arrow-down"></i></button><button class="btn btn-danger" onclick="AdminPage.remove('${c.companyId}')"><i class="fa-solid fa-trash"></i></button></div></td></tr>`
 }).join(''):'<tr><td colspan="10" style="padding:25px;color:#64748b">'+(q?'لا توجد نتائج مطابقة للبحث.':'لا توجد شركات بعد.')+'</td></tr>';
}
function showCompanyPassword(id){const c=state.companies?.[id];if(!c)return;alert(`الشركة: ${c.companyName}\nاسم المستخدم: ${c.managerUsername}\nكلمة المرور: ${c.managerPassword}`)}

async function downloadManagerActivation(id){
 const c=state.companies?.[id];
 if(!c) return toast('الشركة غير موجودة.','error');
 if(!c.database?.databaseURL||!c.database?.authToken) return toast('أدخل رابط وتوكن قاعدة الشركة أولاً ثم احفظ الشركة.','warning');
 try{
  const payload={type:'company-manager',activationKey:c.key,fileId:'MGR_'+c.tenantId,companyId:c.tenantId,tenantId:c.tenantId,companyKey:c.key,companyName:c.companyName,username:c.managerUsername,role:'admin',status:c.status,plan:c.plan,customLimits:c.customLimits,startAt:c.startAt,expiresAt:c.endAt,rootPath:companyRoot,adminRootPath:adminRoot,database:c.database,account:{id:'ADMIN_'+c.tenantId,username:c.managerUsername,password:c.managerPassword,displayName:'مدير الشركة',role:'admin',active:c.status==='active',permissions:{},authVersion:c.authVersion},companyAccess:companyAccess(c)};
  await window.CashtopActivation.prepareActivationFile(payload,`${c.companyName}_مدير_الشركة`);
  toast('تم تنزيل ملف مدير الشركة بنجاح.','success');
 }catch(e){toast('تعذر إنشاء ملف التفعيل: '+(e.message||e),'error')}
}

async function saveMasterDb(){const url=$('masterDatabaseURL')?.value.trim(),token=$('masterAuthToken')?.value.trim();if(!url||!token)return toast('أدخل رابط وتوكن قاعدة الأم.','warning');if(!/^libsql:\/\//i.test(url))return toast('رابط Turso يجب أن يبدأ بـ libsql://','warning');try{await window.CashtopActivation.saveMasterConfig({databaseURL:url,authToken:token});$('masterDbStatus').textContent='تم حفظ قاعدة الأم محلياً. سيتم إعادة تحميل لوحة الإدارة لتفعيل الاتصال.';setTimeout(()=>location.reload(),500)}catch(e){toast('تعذر حفظ قاعدة الأم: '+(e.message||e),'error')}}
async function loadMasterDbForm(){try{const m=await window.CashtopActivation?.loadMasterConfig?.();$('masterDatabaseURL').value=m?.database?.databaseURL||'';$('masterAuthToken').value=m?.database?.authToken||'';$('masterDbStatus').textContent=m?.database?.databaseURL?'قاعدة الأم محفوظة محلياً بشكل محمي.':'لم يتم ضبط قاعدة الأم بعد.';}catch(_){}}

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
window.AdminPage={edit:editCompany,toggle:toggleCompany,remove:deleteCompany,copy:copyKey,showPassword:showCompanyPassword,downloadManager:downloadManagerActivation,openDatabase:openDatabaseModal};
window.addEventListener('DOMContentLoaded',async()=>{state=normalizeState(await loadRemote()||await loadLocal());await saveLocalStateOnly();setupAuthView();if(sessionValid())showApp();$('authForm').addEventListener('submit',handleAuth);$('companyForm').addEventListener('submit',saveCompany);$('generateKey').addEventListener('click',()=>{$('companyKey').value=generateKey()});$('companyKey').addEventListener('change',hydrateRetiredCompanyByKey); $('companySearchInput')?.addEventListener('input',render); $('clearCompanySearch')?.addEventListener('click',()=>{if($('companySearchInput')){$('companySearchInput').value='';render()}}); $('toggleManagerPassword')?.addEventListener('click',()=>{const i=$('managerPassword');if(!i)return;i.type=i.type==='password'?'text':'password';});$('plan').addEventListener('change',planNote);$('durationUnit').addEventListener('change',updateExpiryPreview);$('durationQuantity').addEventListener('input',updateExpiryPreview);$('cancelEdit').addEventListener('click',resetForm);$('logoutBtn').addEventListener('click',()=>{sessionRemove(SESSION_KEY);location.reload()});$('confirmDeleteCompany').addEventListener('click',confirmDeleteCompany);$('cancelDeleteCompany').addEventListener('click',closeDeleteCompanyModal);$('deleteCompanyModal').addEventListener('click',e=>{if(e.target===$('deleteCompanyModal'))closeDeleteCompanyModal()});$('adminSettingsBtn').addEventListener('click',()=>$('adminSettingsModal').classList.add('show'));$('closeAdminSettings').addEventListener('click',()=>$('adminSettingsModal').classList.remove('show'));$('adminSettingsModal').addEventListener('click',e=>{if(e.target===$('adminSettingsModal'))$('adminSettingsModal').classList.remove('show')});$('changeAdminPasswordForm').addEventListener('submit',changeAdminPassword);$('saveMasterDbBtn')?.addEventListener('click',saveMasterDb);$('clearMasterDbBtn')?.addEventListener('click',()=>{localStorage.removeItem('ct_master_runtime_v4');localStorage.removeItem('ct_master_runtime_v3');localStorage.removeItem('ct_master_runtime_v2');toast('تم مسح إعدادات قاعدة الأم المحلية.','warning');loadMasterDbForm()});loadMasterDbForm();$('addDatabaseBtn')?.addEventListener('click',openDatabaseModal);$('addDatabaseFromCompanyBtn')?.addEventListener('click',openDatabaseModal);$('closeDatabaseModal')?.addEventListener('click',closeDatabaseModal);$('databaseModal')?.addEventListener('click',e=>{if(e.target===$('databaseModal'))closeDatabaseModal()});$('databaseForm')?.addEventListener('submit',saveDatabaseRegistry);$('databaseRegistrySelect')?.addEventListener('change',renderDatabaseRegistryDetails);$('companyDatabaseRegistry')?.addEventListener('change',e=>applySelectedDatabaseToCompany(e.target.value));$('prepareBackupBtn').addEventListener('click',prepareFullBackup);$('downloadBackupBtn').addEventListener('click',downloadPreparedBackup);$('restoreBackupBtn').addEventListener('click',restoreFullBackup);resetForm();render()});
})();
