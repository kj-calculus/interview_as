import {submissionRoute} from '../submissions.mjs';
import {managementState,managementRoute,deleteAccountData} from '../management.mjs';
import {saveAdmissionResult,saveApplicationRows} from '../results.mjs';
import {lessonVisible,lessonFields,validateAvailability,decorateEvents} from '../school.mjs';
import {resourceRoute} from '../resources.mjs';
import {validateApplications,applicationEvents} from '../applications.mjs';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(16)));
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
async function passwordHash(password,salt=random()) {const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256);return `${salt}:${hex(bits)}`;}
async function matches(password,stored){const actual=await passwordHash(password,stored.split(':')[0]);let diff=actual.length^stored.length;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^stored.charCodeAt(i);return diff===0;}
const fail=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
const text=(v,max,required=true)=>{if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw fail(400,'입력 항목과 길이를 확인해주세요.');return v.trim();};
const classesOf=u=>[...new Set((u?.class||'').split(',').map(c=>c.trim()).filter(Boolean))];
const normalizeClass=(value,role)=>{const list=classesOf({class:value});if(!list.length||list.length>20||list.some(c=>c.length>80)||(role==='학생'&&list.length!==1))throw fail(400,'학생은 한 반, 교사는 최대 20개 반을 지정해주세요.');return list.join(', ');};
const publicUser=u=>({id:u.id,number:u.number,name:u.name,role:u.role,class:u.class,mustChangePassword:!!u.must_change});
const canStudent=(u,s)=>s?.role==='학생'&&(u.role==='관리자'||(u.role==='교사'&&classesOf(u).includes(s.class))||(u.role==='학생'&&u.id===s.id));
const manager=u=>{if(u.role==='학생')throw fail(403,'교사 또는 관리자만 사용할 수 있습니다.');};
const cookie=(token,age)=>`interview_session=${token}; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=${age}`;
async function readBody(request){const limit=/^\/api\/(resources|submissions)/.test(new URL(request.url).pathname)?3*1048576:1048576;if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||request.headers.get('x-interview-request')!=='1')throw fail(415,'올바른 요청 형식이 아닙니다.');if(Number(request.headers.get('content-length'))>limit)throw fail(413,'요청이 너무 큽니다.');const reader=request.body?.getReader();let size=0;const chunks=[];if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw fail(413,'요청이 너무 큽니다.');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{const b=JSON.parse(new TextDecoder().decode(bytes));if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{throw fail(400,'입력 내용을 확인해주세요.');}}

export async function handle(request,env,assets={}) {
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN'};
 const json=(status,data)=>Response.json(data,{status,headers});
 try {
  const url=new URL(request.url),route=url.pathname,method=request.method;
  if(!route.startsWith('/api/')) {const asset=assets[route==='/'?'/index.html':route];if(!asset)return json(404,{error:'페이지를 찾을 수 없습니다.'});if(!['GET','HEAD'].includes(method))throw fail(405,'허용되지 않은 요청입니다.');return new Response(method==='HEAD'?null:asset.content,{headers:{...headers,'Content-Type':asset.type}});}
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw fail(403,'허용되지 않은 요청 출처입니다.');
  if(request.headers.get('sec-fetch-site')==='cross-site')throw fail(403,'허용되지 않은 요청입니다.');
  const db=env.DB;
  const statement=(sql,args=[])=>db.prepare(sql).bind(...args);
  const first=(sql,...args)=>statement(sql,args).first();
  const all=async(sql,...args)=>(await statement(sql,args).all()).results;
  const run=(sql,...args)=>statement(sql,args).run();
  const users=()=>all('SELECT * FROM users ORDER BY role,class,number,name');
  const getUser=id=>first('SELECT * FROM users WHERE id=?',id);
  const canEvent=async(u,e)=>e.type==='lesson'?lessonVisible(u,e):canStudent(u,await getUser(e.student));
  async function session(){const token=(request.headers.get('cookie')||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('interview_session='))?.slice(18);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return first('SELECT users.*,sessions.token_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?',await digest(token),Date.now());}
  async function rowsFor(u,rows){manager(u);if(!Array.isArray(rows)||!rows.length||rows.length>500)throw fail(400,'계정은 한 번에 1~500명까지 등록할 수 있습니다.');const existing=await users(),ids=new Set(existing.map(a=>a.id.toLowerCase())),numbers=new Set(existing.filter(a=>a.role==='학생').map(a=>a.number));return rows.map((r,i)=>{const a={row:Number.isInteger(r?.row)?r.row:i+2};let error='';try{for(const [k,max] of Object.entries({id:40,name:60,number:30,role:10,class:1700}))a[k]=text(r?.[k]??'',max,k!=='number');a.class=normalizeClass(a.class,a.role);if(!['교사','학생'].includes(a.role))error='권한은 교사 또는 학생만 가능합니다.';else if(u.role==='교사'&&(a.role!=='학생'||!classesOf(u).includes(a.class)))error='본인 배정반의 학생만 등록할 수 있습니다.';else if(a.role==='학생'&&!a.number)error='학생 학번은 필수입니다.';else if(!/^[a-zA-Z0-9._-]{3,40}$/.test(a.id))error='아이디는 영문·숫자·._- 3~40자입니다.';else if(ids.has(a.id.toLowerCase()))error='중복된 아이디입니다.';else if(a.role==='학생'&&numbers.has(a.number))error='중복된 학생 학번입니다.';ids.add(a.id.toLowerCase());if(a.role==='학생')numbers.add(a.number);}catch(e){error=e.message;}return {...a,error};});}
  async function eventFor(u,b,old){manager(u);const type=text(b.type,20),date=text(b.date,10),time=text(b.time,10);if(!['lesson','first','interview','final'].includes(type))throw fail(400,'일정 종류를 확인해주세요.');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<'2000-01-01'||date>'2100-12-31')throw fail(400,'올바른 날짜를 입력해주세요.');if(type==='lesson'?!['7교시','8교시','상시'].includes(time)&&!(old?.time===time&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time)):!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw fail(400,'올바른 시간을 입력해주세요.');const e={type,date,time,student:null,class:'',univ:'',major:'',title:'',task:''};if(type==='lesson'){e.class=text(b.class,80);e.title=text(b.title,80);e.task=text(b.task??'',5000,false);if(u.role==='교사'&&!classesOf(u).includes(e.class))throw fail(403,'본인 배정반에만 수업을 등록할 수 있습니다.');if(!(await users()).some(a=>classesOf(a).includes(e.class)))throw fail(400,'계정을 먼저 등록해 배정반을 만들어주세요.');}else{const s=await getUser(text(b.student,40));if(!canStudent(u,s))throw fail(403,'해당 학생의 일정을 관리할 수 없습니다.');e.student=s.id;e.class=s.class;e.univ=text(b.univ,100);e.major=text(b.major??'',100,false);}if(type==='lesson')Object.assign(e,lessonFields(u,b,await users(),old));else e.teacher_id=old?old.teacher_id||'':u.id;return e;}
  if(route==='/api/login'&&method==='POST') {
   const b=await readBody(request),id=text(b.id,40),password=text(b.password,128),now=Date.now();
   if(!env.ADMIN_INITIAL_HASH)throw fail(503,'관리자 계정 설정을 완료해주세요.');
   await run("INSERT OR IGNORE INTO users(id,number,name,role,class,password_hash,must_change) VALUES('admin','','관리자','관리자','',?,0)",env.ADMIN_INITIAL_HASH);
   const key=await digest(request.headers.get('cf-connecting-ip')||'unknown');
   await run('INSERT INTO login_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END',key,now+900000,now,now);
   if((await first('SELECT count FROM login_attempts WHERE key=?',key)).count>20)throw fail(429,'로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.');
   const u=await getUser(id);if(!await matches(password,u?.password_hash||env.ADMIN_INITIAL_HASH)||!u)throw fail(401,'아이디 또는 비밀번호가 올바르지 않습니다.');
   if((await getUser(id)).password_hash!==u.password_hash)throw fail(401,'비밀번호가 변경되었습니다. 다시 로그인해주세요.');
   await run('DELETE FROM login_attempts WHERE key=? OR expires<?',key,now);
   const prior=await session();if(prior)await run('DELETE FROM sessions WHERE token_hash=?',prior.token_hash);
   await run('DELETE FROM sessions WHERE expires<=?',now);const token=random()+random();await run('INSERT INTO sessions VALUES(?,?,?)',await digest(token),u.id,now+28800000);headers['Set-Cookie']=cookie(token,28800);return json(200,{user:publicUser(u)});
  }
  const u=await session();if(!u)throw fail(401,'로그인이 필요합니다.');
  if(route==='/api/me'&&method==='GET')return json(200,{user:publicUser(u)});
  if(route==='/api/logout'&&method==='POST'){await readBody(request);await run('DELETE FROM sessions WHERE token_hash=?',u.token_hash);headers['Set-Cookie']=cookie('',0);return json(200,{ok:true});}
  if(route==='/api/password'&&method==='POST') {const b=await readBody(request),old=text(b.currentPassword,128),next=text(b.newPassword,128);if(next.length<8)throw fail(400,'새 비밀번호는 8자 이상 입력해주세요.');if(old===next)throw fail(400,'현재 비밀번호와 다른 비밀번호를 입력해주세요.');if(!await matches(old,u.password_hash))throw fail(400,'현재 비밀번호가 올바르지 않습니다.');const hash=await passwordHash(next);const result=await run('UPDATE users SET password_hash=?,must_change=0 WHERE id=? AND password_hash=?',hash,u.id,u.password_hash);if(result.meta.changes!==1)throw fail(409,'비밀번호가 변경되었습니다. 다시 로그인해주세요.');await run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?',u.id,u.token_hash);return json(200,{ok:true});}
  if(u.must_change)throw fail(403,'처음 로그인하면 비밀번호를 변경해주세요.',{code:'PASSWORD_CHANGE_REQUIRED'});
  if(route.startsWith('/api/important-events')||route==='/api/lesson-progress')return await managementRoute(request,u,db,readBody);
  if(route.startsWith('/api/submissions'))return await submissionRoute(request,u,db,env.FILES,readBody);
  if(route.startsWith('/api/resources'))return await resourceRoute(request,u,db,env.FILES,readBody);
  if(route==='/api/state'&&method==='GET') {const list=await users(),accounts=list.filter(a=>u.role==='관리자'||a.id===u.id||canStudent(u,a));const events=(await all('SELECT * FROM events ORDER BY date,time')).filter(e=>e.type==='lesson'?lessonVisible(u,e):canStudent(u,list.find(a=>a.id===e.student)));const applications=(await all('SELECT * FROM applications')).filter(a=>canStudent(u,list.find(s=>s.id===a.student))).map(a=>({...a,rows:JSON.parse(a.rows)}));const availability=(await all('SELECT * FROM availability')).filter(a=>canStudent(u,list.find(s=>s.id===a.student))).map(a=>({...a,days:JSON.parse(a.days)}));const extra=await managementState(db,u);return json(200,{user:publicUser(u),accounts:accounts.map(publicUser),applications,availability,progress:extra.progress,events:[...decorateEvents(events,list),...applicationEvents(applications,accounts),...extra.important]});}
  if(route==='/api/availability'&&method==='PUT'){if(u.role!=='학생')throw fail(403,'학생 본인만 입력할 수 있습니다.');const b=await readBody(request);if(b.student&&b.student!==u.id)throw fail(403,'본인 정보만 입력할 수 있습니다.');const a=validateAvailability(b);await run('INSERT INTO availability(student,days,note) VALUES(?,?,?) ON CONFLICT(student) DO UPDATE SET days=excluded.days,note=excluded.note',u.id,JSON.stringify(a.days),a.note);return json(200,{student:u.id,...a});}
  if(route==='/api/results'&&method==='POST'){await saveAdmissionResult(db,u,await readBody(request));return json(200,{ok:true});}
  if(route==='/api/applications'&&method==='PUT'){if(u.role!=='학생')throw fail(403,'학생 본인만 지원 정보를 입력할 수 있습니다.');const b=await readBody(request);if(b.student&&b.student!==u.id)throw fail(403,'본인 지원 정보만 입력할 수 있습니다.');const rows=validateApplications(b.rows);await saveApplicationRows(db,u.id,rows,b.expectedRows);return json(200,{ok:true});}
  if(route==='/api/accounts/validate'&&method==='POST'){const b=await readBody(request);return json(200,{rows:await rowsFor(u,b.rows)});}
  if(route==='/api/accounts'&&method==='POST') {const b=await readBody(request),rows=await rowsFor(u,b.rows);if(rows.some(a=>a.error))throw fail(400,'등록 오류를 수정해주세요.',{rows});const credentials=[];for(const r of rows){const password='777777';credentials.push({...r,password,hash:await passwordHash(password)});}if(!await session())throw fail(401,'다시 로그인해주세요.');try{await db.batch(credentials.map(r=>statement('INSERT INTO users(id,number,name,role,class,password_hash,must_change) VALUES(?,?,?,?,?,?,1)',[r.id,r.number,r.name,r.role,r.class,r.hash])));}catch(e){if(/UNIQUE|constraint/i.test(e.message))throw fail(409,'중복된 아이디 또는 학번이 있습니다. 다시 확인해주세요.');throw e;}return json(201,{credentials:credentials.map(({hash,error,row,...r})=>r)});}
  if(route==='/api/accounts/reset-password'&&method==='POST'){manager(u);const b=await readBody(request),target=await getUser(text(b.id,40));if(!target||target.role==='관리자'||!(u.role==='관리자'||canStudent(u,target)))throw fail(403,'이 계정의 비밀번호를 초기화할 수 없습니다.');const password='777777',hash=await passwordHash(password);await db.batch([statement('UPDATE users SET password_hash=?,must_change=1 WHERE id=?',[hash,target.id]),statement('DELETE FROM sessions WHERE user_id=?',[target.id])]);return json(200,{credentials:[{...publicUser(target),password}]});}

  if(route==='/api/accounts/classes'&&method==='POST'){
   if(u.role!=='관리자')throw fail(403,'관리자만 교사의 배정반을 변경할 수 있습니다.');const b=await readBody(request),target=await getUser(text(b.id,40));if(!target||target.role!=='교사')throw fail(404,'교사 계정을 찾을 수 없습니다.');const classes=normalizeClass(text(b.class,1700),'교사');await run('UPDATE users SET class=? WHERE id=?',classes,target.id);return json(200,{ok:true});
  }
  if(route==='/api/accounts/delete'&&method==='POST'){const b=await readBody(request);await deleteAccountData(db,u,b.id);return json(200,{ok:true});}
  if(route==='/api/events'&&method==='POST'){const e=await eventFor(u,await readBody(request)),id=crypto.randomUUID();await run('INSERT INTO events(id,type,student,class,univ,major,date,time,title,task,lesson_kind,teacher_name,target_ids,teacher_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,e.type,e.student,e.class,e.univ,e.major,e.date,e.time,e.title,e.task,e.lesson_kind||'',e.teacher_name||'',e.target_ids||'null',e.teacher_id||'');return json(201,{id});}
  const match=route.match(/^\/api\/events\/([a-zA-Z0-9-]+)$/);
  if(match&&['PUT','DELETE'].includes(method)){manager(u);const b=await readBody(request),old=await first('SELECT * FROM events WHERE id=?',match[1]);if(!old||!await canEvent(u,old))throw fail(404,'일정을 찾을 수 없습니다.');if(method==='DELETE')await run('DELETE FROM events WHERE id=?',old.id);else{const e=await eventFor(u,b,old);await run('UPDATE events SET type=?,student=?,class=?,univ=?,major=?,date=?,time=?,title=?,task=?,lesson_kind=?,teacher_name=?,target_ids=?,teacher_id=? WHERE id=?',e.type,e.student,e.class,e.univ,e.major,e.date,e.time,e.title,e.task,e.lesson_kind||'',e.teacher_name||'',e.target_ids||'null',e.teacher_id||'',old.id);}return json(200,{ok:true});}
  throw fail(404,'요청한 기능을 찾을 수 없습니다.');
 } catch(e){if(!e.status)console.error('Request failed:',e.message);return json(e.status||500,{error:e.status?e.message:'저장 중 문제가 발생했습니다. 다시 시도해주세요.',...(e.rows?{rows:e.rows}:{}),...(e.code?{code:e.code}:{})});}
}
export {passwordHash};
