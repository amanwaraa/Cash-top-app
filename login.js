(function(){
'use strict';
const $=id=>document.getElementById(id); const SESSION_KEY='cashtop_tab_session_v2', PERSIST='cashtop_persistent_session_v1', REM='cashtop_remembered_key';
const rawGet=k=>{try{return localStorage.getItem(k)}catch(_){return null}}; const rawSet=(k,v)=>{try{localStorage.setItem(k,String(v))}catch(_){}};
const norm=v=>String(v||'').trim().toUpperCase();
function show(msg,type='info'){const b=$('status');b.className='status show '+type;b.textContent=msg}
function writeSession(s){const x=JSON.stringify(s);try{sessionStorage.setItem(SESSION_KEY,x)}catch(_){};rawSet(PERSIST,x);try{window.name='CASHTOP_SESSION_V2:'+x}catch(_){} }
function readSession(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}}
function saveCompanyCache(p){
 const key=norm(p.companyKey||p.activationKey), tenant=String(p.companyId||p.tenantId||key), lic={id:tenant,key,tenantId:tenant,companyId:tenant,companyName:p.companyName||'الشركة',status:p.status||'active',plan:p.plan||'pro',startAt:p.startAt||'',endAt:p.expiresAt||p.endAt||''};
 rawSet('cashtop_admin_licenses',JSON.stringify([lic])); rawSet('cashtop_tenant_bindings',JSON.stringify({[key]:tenant}));
 rawSet(`cashtop_data::${encodeURIComponent(tenant)}::cashtop_company_access`,JSON.stringify(p.companyAccess||{...lic,manager:p.type==='company-manager'?p.account:null}));
 const users=p.type==='employee'||p.type==='representative'||p.type==='branch-manager'?[p.account]:[]; if(users.length) rawSet('cashtop_admin_users',JSON.stringify(users));
 if(p.branches) rawSet(`cashtop_data::${encodeURIComponent(tenant)}::cashtop_branches`,JSON.stringify(p.branches));
 if(p.employees) rawSet(`cashtop_data::${encodeURIComponent(tenant)}::cashtop_employees`,JSON.stringify(p.employees));
 if(p.agents) rawSet(`cashtop_data::${encodeURIComponent(tenant)}::cashtop_sales_agents`,JSON.stringify(p.agents));
}
async function verifyRemote(p){
 const direct=window.CashtopActivation?.tursoDirect;
 if(!direct?.readExact) throw new Error('تعذر تشغيل التحقق الآمن من قاعدة البيانات.');
 const db=p.database||{};
 if(!db.databaseURL||!db.authToken) throw new Error('ملف التفعيل لا يحتوي على بيانات اتصال صالحة.');
 const tenant=String(p.companyId||p.tenantId||'').trim().replace(/[.#$\[\]\/]/g,'_');
 if(!tenant) throw new Error('ملف التفعيل لا يحتوي على معرف الشركة.');
 const root=String(p.rootPath||'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g,'');
 const decode=value=>{let v=value;for(let i=0;i<6;i++){if(v==null)return null;if(v&&typeof v==='object'&&v.deleted===true)return null;if(v&&typeof v==='object'&&Object.prototype.hasOwnProperty.call(v,'value')){v=v.value;continue}if(typeof v==='string'){try{v=JSON.parse(v);continue}catch(_){}}break}return v};
 const readDataset=async name=>decode(await direct.readExact(db,`${root}/${tenant}/datasets/${name}`));
 let access;
 try{access=await readDataset('cashtop_company_access')}catch(error){throw new Error('تعذر الاتصال بقاعدة الشركة والتحقق من الحساب: '+String(error?.message||error));}
 if(!access||typeof access!=='object') throw new Error('هذا المفتاح غير مسجل في قاعدة الشركة. أعد حفظ الشركة من لوحة القاعدة الأم أولاً.');
 if(!access.companyKey||norm(access.companyKey)!==norm(p.companyKey||p.activationKey)) throw new Error('ملف التفعيل لا يطابق مفتاح الشركة المسجل في قاعدة البيانات.');
 if(String(access.tenantId||access.companyId||tenant)!==tenant) throw new Error('ملف التفعيل لا يطابق معرف الشركة المسجل في قاعدة البيانات.');
 if(access.status!=='active') throw new Error('تم إيقاف مفتاح هذا الملف من الإدارة العامة.');
 const end=access.endAt?new Date(access.endAt).getTime():0;if(end&&Date.now()>=end)throw new Error('انتهت مدة مفتاح الشركة.');
 const account={...(p.account||{})};
 const list=v=>Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v):[]);
 const sameVersion=(remoteVersion,fileVersion)=>String(remoteVersion||'')===String(fileVersion||'');
 const sameId=(a,b)=>String(a||'')===String(b||'');
 let verifiedAccount=null;
 if(p.type==='company-manager'){
   const row=access.manager;
   if(!row||typeof row!=='object')throw new Error('حساب مدير الشركة غير موجود في قاعدة البيانات.');
   if(row.active===false)throw new Error('تم إيقاف حساب مدير الشركة من الإدارة العامة.');
   if(account.id&&!sameId(row.id,account.id))throw new Error('ملف مدير الشركة لا يطابق الحساب المسجل في قاعدة البيانات.');
   if(account.username&&String(row.username||'').toLowerCase()!==String(account.username).toLowerCase())throw new Error('اسم مدير الشركة في الملف لا يطابق قاعدة البيانات.');
   if(!sameVersion(row.authVersion,account.authVersion))throw new Error('تم تحديث ملف مدير الشركة. نزّل ملف الدخول الجديد من الإدارة العامة.');
   verifiedAccount={...account,...row,password:account.password||''};
 }else if(p.type==='employee'){
   const rows=list(await readDataset('cashtop_employees'));const row=rows.find(x=>sameId(x?.id,account.id));
   if(!row)throw new Error('حساب الموظف غير موجود في قاعدة البيانات أو تم حذفه.');
   if(row.active===false||['stopped','inactive','deleted'].includes(String(row.status||'').toLowerCase()))throw new Error('تم إيقاف حساب الموظف.');
   if(!sameVersion(row.authVersion,account.authVersion))throw new Error('تم تحديث ملف الموظف. اطلب ملف دخول جديد من المدير.');
   verifiedAccount={...account,...row,displayName:row.name||row.displayName||account.displayName,active:true};
 }else if(p.type==='branch-manager'){
   const rows=list(await readDataset('cashtop_branches'));const row=rows.find(x=>sameId(x?.managerUserId,account.id)||sameId(x?.id,account.branchRecordId));
   if(!row||!row.managerUsername)throw new Error('حساب مدير الفرع غير موجود في قاعدة البيانات أو تم حذفه.');
   if(row.managerActive===false)throw new Error('تم إيقاف حساب مدير الفرع.');
   if(!sameVersion(row.managerAuthVersion,account.authVersion))throw new Error('تم تحديث ملف مدير الفرع. اطلب ملف دخول جديد.');
   verifiedAccount={...account,username:row.managerUsername,displayName:row.manager||account.displayName,permissions:row.managerPermissions||account.permissions,branchRecordId:row.id,branchId:row.isMain===true?'MAIN':row.id,dataBranchId:row.isMain===true?'MAIN':row.id,branchName:row.name,active:true};
 }else if(p.type==='representative'){
   const rows=list(await readDataset('cashtop_sales_agents'));const row=rows.find(x=>sameId(x?.id,account.id));
   if(!row)throw new Error('حساب المندوب غير موجود في قاعدة البيانات أو تم حذفه.');
   if(row.active===false||['stopped','inactive','deleted'].includes(String(row.status||'').toLowerCase()))throw new Error('تم إيقاف حساب المندوب.');
   if(!sameVersion(row.authVersion,account.authVersion))throw new Error('تم تحديث ملف المندوب. اطلب ملف دخول جديد.');
   verifiedAccount={...account,...row,displayName:(row.name||account.displayName)+(String(row.name||'').includes('مندوب')?'':' (مندوب)'),active:true};
 }else{
   throw new Error('نوع حساب ملف التفعيل غير معتمد للدخول إلى النظام.');
 }
 return {...p,account:verifiedAccount,status:access.status,plan:access.plan||p.plan,customLimits:access.customLimits||p.customLimits,expiresAt:access.endAt||p.expiresAt,companyAccess:access};
}
async function doLogin(file){
 if(!/\.(?:ctauth|ctkey|cashkey|key|dat)$/i.test(file?.name||'')) throw new Error('امتداد ملف التفعيل غير معتمد. استخدم ملف .ctauth');
 const p=await window.CashtopActivation.parseActivationFile(file);
 if(!p.database?.databaseURL || !p.database?.authToken) throw new Error('ملف التفعيل لا يحتوي على بيانات اتصال صالحة.');
 const verified=await verifyRemote(p); if(verified.status && verified.status!=='active') throw new Error('تم إيقاف هذا المفتاح من الإدارة العامة.');
 window.CashtopActivation.saveDatabaseAccess(verified.database,{companyId:verified.companyId,tenantId:verified.tenantId||verified.companyId});
 await window.CashtopActivation.activatePayload(verified);
 try{ window.CashtopTursoConfig?.refresh?.(); }catch(_){}
 saveCompanyCache(verified);
 const account=verified.account||{}; const s={mode:'activation-file',uid:account.id||verified.activationKey,username:account.username||verified.username,displayName:account.displayName||verified.displayName||account.username||verified.username,role:account.role||verified.role||'employee',permissions:account.permissions||verified.permissions||{},branchRecordId:account.branchRecordId||null,branchId:account.branchId||null,dataBranchId:account.dataBranchId||account.branchId||null,branchName:account.branchName||'',companyKey:norm(verified.companyKey||verified.activationKey),tenantId:String(verified.companyId||verified.tenantId||''),companyId:String(verified.companyId||verified.tenantId||''),companyName:verified.companyName||'الشركة',licenseId:String(verified.companyId||verified.tenantId||verified.activationKey),licenseStart:verified.startAt||'',licenseEnd:verified.expiresAt||verified.endAt||'',plan:verified.plan||'pro',customLimits:verified.customLimits||null,status:verified.status||'active',loginAt:new Date().toISOString(),activationFileId:verified.fileId};
 writeSession(s); rawSet(REM,s.companyKey); return s;
}
window.handleLogin=async function(e){e.preventDefault();const f=$('activationFile').files?.[0];if(!f)return show('اختر ملف التفعيل أولاً.','error');const btn=$('loginBtn');btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق من الملف...';show('جاري فك الملف والتحقق من وجود الحساب داخل قاعدة الشركة...','info');try{await doLogin(f);show('تم التحقق بنجاح. جاري فتح النظام...','success');setTimeout(()=>location.replace('لوحة التحكم.html'),350)}catch(err){console.error(err);show(String(err?.message||'تعذر فتح ملف التفعيل.'),'error');btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول'}};
function resetFileUI(){ $('fileInfo').classList.remove('show'); $('fileInfo').textContent=''; $('fileIcon').className='fa-solid fa-file-shield'; }
function selected(){const f=$('activationFile').files?.[0];if(!f)return resetFileUI();$('fileInfo').textContent='الملف المرفق: '+f.name;$('fileInfo').classList.add('show');$('fileIcon').className='fa-solid fa-circle-check upload-icon';$('fileIcon').style.color='#28a745';const m=$('fileMessage');if(m){m.textContent='تم إرفاق ملف التفعيل بنجاح';m.style.color='var(--primary)'}}
window.addEventListener('DOMContentLoaded',()=>{const f=$('activationFile'),d=$('dropArea');f.addEventListener('change',selected);['dragenter','dragover'].forEach(x=>d.addEventListener(x,e=>{e.preventDefault();d.classList.add('drag')}));['dragleave','drop'].forEach(x=>d.addEventListener(x,e=>{e.preventDefault();d.classList.remove('drag')}));d.addEventListener('drop',e=>{if(e.dataTransfer.files?.length){try{f.files=e.dataTransfer.files}catch(_){}selected()}});$('loginForm').addEventListener('submit',window.handleLogin);});
})();
