'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const scrypt=require('node:util').promisify(crypto.scrypt);
const fail=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');return `${salt}:${(await scrypt(password,salt,64)).toString('hex')}`;}
async function matches(password,stored){const [salt,hex]=stored.split(':');return crypto.timingSafeEqual(await scrypt(password,salt,64),Buffer.from(hex,'hex'));}
const classesOf=u=>[...new Set((u?.class||'').split(',').map(c=>c.trim()).filter(Boolean))];
const normalizeClass=(value,role)=>{const list=classesOf({class:value});if(!list.length||list.length>20||list.some(c=>c.length>80)||(role==='학생'&&list.length!==1))throw fail(400,'학생은 한 반, 교사는 최대 20개 반을 지정해주세요.');return list.join(', ');};
const publicUser=u=>({id:u.id,number:u.number,name:u.name,role:u.role,class:u.class,mustChangePassword:!!u.must_change});
function createApp({dataDir=process.env.DATA_DIR||path.join(__dirname,'data'),secureCookies=false}={}){
 fs.mkdirSync(dataDir,{recursive:true});const db=new DatabaseSync(path.join(dataDir,'interview.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY COLLATE NOCASE,number TEXT NOT NULL DEFAULT '',name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('관리자','교사','학생')),class TEXT NOT NULL DEFAULT '',password_hash TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 0);
 CREATE UNIQUE INDEX IF NOT EXISTS student_number ON users(number) WHERE role='학생';
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('first','interview','final','lesson')),student TEXT REFERENCES users(id),class TEXT NOT NULL DEFAULT '',univ TEXT NOT NULL DEFAULT '',major TEXT NOT NULL DEFAULT '',date TEXT NOT NULL,time TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',task TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 PRAGMA user_version=1;`);
 db.exec('CREATE TABLE IF NOT EXISTS applications(student TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,rows TEXT NOT NULL)');
 for(const [name,value] of [['lesson_kind',"''"],['teacher_name',"''"],['target_ids',"'null'"]])if(!db.prepare('PRAGMA table_info(events)').all().some(c=>c.name===name))db.exec('ALTER TABLE events ADD COLUMN '+name+' TEXT NOT NULL DEFAULT '+value);
 db.exec('CREATE TABLE IF NOT EXISTS resource_posts(id TEXT PRIMARY KEY,author_id TEXT NOT NULL,author_name TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS resource_files(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES resource_posts(id) ON DELETE CASCADE,name TEXT NOT NULL,size INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,student TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,content TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS submission_files(id TEXT PRIMARY KEY,submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,name TEXT NOT NULL,size INTEGER NOT NULL)');

 const storage=require('./local-storage.cjs').adapters(db,dataDir);
 db.exec('CREATE TABLE IF NOT EXISTS availability(student TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,days TEXT NOT NULL,note TEXT NOT NULL)');
 if(!db.prepare('PRAGMA table_info(resource_posts)').all().some(c=>c.name==='target_ids'))db.exec("ALTER TABLE resource_posts ADD COLUMN target_ids TEXT NOT NULL DEFAULT 'null'");
 for(const name of ['teacher_id','result'])if(!db.prepare('PRAGMA table_info(events)').all().some(c=>c.name===name))db.exec("ALTER TABLE events ADD COLUMN "+name+" TEXT NOT NULL DEFAULT ''");
 db.exec('CREATE TABLE IF NOT EXISTS important_events(id TEXT PRIMARY KEY,title TEXT NOT NULL,date TEXT NOT NULL,description TEXT NOT NULL,author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS lesson_progress(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,student TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,completed_at TEXT NOT NULL,marked_by TEXT NOT NULL)');
 if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assignments'").get())db.exec(fs.readFileSync(path.join(__dirname,'drizzle/0007_fluffy_tusk.sql'),'utf8'));
 if(!db.prepare('PRAGMA table_info(availability)').all().some(c=>c.name==='min_exam'))db.exec('ALTER TABLE availability ADD COLUMN min_exam INTEGER NOT NULL DEFAULT 0');
 let submissionRoute,managementState,managementRoute,deleteAccountData,decorateEvents,saveAdmissionResult,saveApplicationRows,validateApplications,applicationEvents,lessonVisible,lessonFields,saveStudentAvailability,validateAvailability,resourceRoute;
 const allUsers=()=>db.prepare('SELECT * FROM users ORDER BY role,class,number,name').all();
 const getUser=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const canStudent=(u,s)=>s?.role==='학생'&&(u.role==='관리자'||(u.role==='교사'&&classesOf(u).includes(s.class))||(u.role==='학생'&&u.id===s.id));
 const canEvent=(u,e)=>e.type==='lesson'?lessonVisible(u,e):canStudent(u,getUser(e.student));
 const oldState=u=>({user:publicUser(u),accounts:allUsers().filter(a=>u.role==='관리자'||a.id===u.id||canStudent(u,a)).map(publicUser),events:db.prepare('SELECT * FROM events ORDER BY date,time').all().filter(e=>canEvent(u,e))});
 const state=u=>{const result=oldState(u);const applications=db.prepare('SELECT * FROM applications').all().filter(a=>canStudent(u,getUser(a.student))).map(a=>({...a,rows:JSON.parse(a.rows)}));const availability=db.prepare('SELECT * FROM availability').all().filter(a=>canStudent(u,getUser(a.student))).map(a=>({...a,days:JSON.parse(a.days),min_exam:!!a.min_exam}));return {...result,applications,availability,events:[...decorateEvents(result.events,allUsers()),...applicationEvents(applications,result.accounts)]};};
 const requireManager=u=>{if(u.role==='학생')throw fail(403,'교사 또는 관리자만 사용할 수 있습니다.');};
 const text=(v,max,required=true)=>{if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw fail(400,'입력 항목과 길이를 확인해주세요.');return v.trim();};
 function validateRows(u,rows){
  requireManager(u);if(!Array.isArray(rows)||!rows.length||rows.length>500)throw fail(400,'계정은 한 번에 1~500명까지 등록할 수 있습니다.');
  const users=allUsers(),ids=new Set(users.map(a=>a.id.toLowerCase())),numbers=new Set(users.filter(a=>a.role==='학생').map(a=>a.number));
  return rows.map((r,i)=>{const a={row:i+2};let error='';try{
   if(!r||typeof r!=='object')throw fail(400,'행을 확인해주세요.');
   for(const [k,max] of Object.entries({id:40,name:60,number:30,role:10,class:1700}))a[k]=text(r[k]??'',max,k!=='number');
   a.class=normalizeClass(a.class,a.role);if(!['교사','학생'].includes(a.role))error='권한은 교사 또는 학생만 가능합니다.';
   else if(u.role==='교사'&&(a.role!=='학생'||!classesOf(u).includes(a.class)))error='본인 배정반의 학생만 등록할 수 있습니다.';
   else if(a.role==='학생'&&!a.number)error='학생 학번은 필수입니다.';
   else if(!/^[a-zA-Z0-9._-]{3,40}$/.test(a.id))error='아이디는 영문·숫자·._- 3~40자입니다.';
   else if(ids.has(a.id.toLowerCase()))error='이미 사용 중이거나 파일에서 중복된 아이디입니다.';
   else if(a.role==='학생'&&numbers.has(a.number))error='중복된 학생 학번입니다.';
   ids.add(a.id.toLowerCase());if(a.role==='학생')numbers.add(a.number);
  }catch(e){error=e.message;}return {...a,error};});
 }
 function validateEvent(u,b,old){
  requireManager(u);const type=text(b.type,20),date=text(b.date,10),time=text(b.time,10);
  if(!['lesson','first','interview','final'].includes(type))throw fail(400,'일정 종류를 확인해주세요.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<'2000-01-01'||date>'2100-12-31')throw fail(400,'올바른 날짜를 입력해주세요.');
  if(type==='lesson'?!['7교시','8교시','상시'].includes(time)&&!(old?.time===time&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time)):!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw fail(400,'올바른 시간을 입력해주세요.');
  const e={type,date,time,student:null,class:'',univ:'',major:'',title:'',task:''};
  if(type==='lesson'){
   e.class=text(b.class,80);e.title=text(b.title,80);e.task=text(b.task??'',5000,false);
   if(u.role==='교사'&&!classesOf(u).includes(e.class))throw fail(403,'본인 배정반에만 수업을 등록할 수 있습니다.');
   if(!allUsers().some(a=>classesOf(a).includes(e.class)))throw fail(400,'계정을 먼저 등록해 배정반을 만들어주세요.');
  }else{const student=getUser(text(b.student,40));if(!canStudent(u,student))throw fail(403,'해당 학생의 일정을 관리할 수 없습니다.');e.student=student.id;e.class=student.class;e.univ=text(b.univ,100);e.major=text(b.major??'',100,false);}
  if(type==='lesson')Object.assign(e,lessonFields(u,b,allUsers(),old));else e.teacher_id=old?old.teacher_id||'':u.id;return e;
 }
 const tokenHash=t=>crypto.createHash('sha256').update(t).digest('hex');
 function session(req){const token=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('interview_session='))?.slice('interview_session='.length);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return db.prepare('SELECT users.*,sessions.token_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?').get(tokenHash(token),Date.now());}
 const cookie=(token,age)=>`interview_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secureCookies?'; Secure':''}`;
 async function body(req){if(req.headers['content-type']?.split(';')[0]!=='application/json'||req.headers['x-interview-request']!=='1')throw fail(415,'올바른 요청 형식이 아닙니다.');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>((/^\/api\/(resources|submissions)/.test(req.url))?3*1024*1024:1024*1024))throw fail(413,'요청이 너무 큽니다.');chunks.push(chunk);}try{const b=JSON.parse(Buffer.concat(chunks).toString());if(!b||Array.isArray(b)||typeof b!=='object')throw Error();return b;}catch{throw fail(400,'입력 내용을 확인해주세요.');}}
 const attempts=new Map();
 const ready=(async()=>{({submissionRoute}=await import('./submissions.mjs'));({validateApplications,applicationEvents}=await import('./applications.mjs'));({lessonVisible,lessonFields,saveStudentAvailability,validateAvailability,decorateEvents}=await import('./school.mjs'));({resourceRoute}=await import('./resources.mjs'));({saveAdmissionResult,saveApplicationRows}=await import('./results.mjs'));({managementState,managementRoute,deleteAccountData}=await import('./management.mjs'));if(!getUser('admin'))db.prepare('INSERT INTO users(id,number,name,role,class,password_hash) VALUES(?,?,?,?,?,?)').run('admin','','관리자','관리자','',await hashPassword(process.env.ADMIN_INITIAL_PASSWORD||'admin123'));})();
 const dummy=hashPassword(crypto.randomBytes(24).toString('hex'));
 const server=http.createServer(async(req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
  try{
   await ready;const route=new URL(req.url,'http://localhost').pathname;
   if(route.startsWith('/api/')){
    if(req.headers.origin&&req.headers.origin!==`${secureCookies?'https':'http'}://${req.headers.host}`)throw fail(403,'허용되지 않은 요청 출처입니다.');
    if(req.headers['sec-fetch-site']==='cross-site')throw fail(403,'허용되지 않은 요청입니다.');
    if(route==='/api/login'&&req.method==='POST'){
     const b=await body(req),id=text(b.id,40),password=text(b.password,128),key=req.socket.remoteAddress,now=Date.now();
     for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
     const entry=attempts.get(key)||{count:0,until:now+15*60*1000};if(entry.count>=20)throw fail(429,'로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.');entry.count++;attempts.set(key,entry);
     const u=getUser(id),ok=await matches(password,u?.password_hash||await dummy);if(!u||!ok)throw fail(401,'아이디 또는 비밀번호가 올바르지 않습니다.');attempts.delete(key);
     const prior=session(req);if(prior)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(prior.token_hash);
     db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),u.id,now+8*3600000);res.setHeader('Set-Cookie',cookie(token,8*3600));return json(200,{user:publicUser(u)});
    }
    const u=session(req);if(!u)throw fail(401,'로그인이 필요합니다.');
    if(route==='/api/logout'&&req.method==='POST'){await body(req);db.prepare('DELETE FROM sessions WHERE token_hash=?').run(u.token_hash);res.setHeader('Set-Cookie',cookie('',0));return json(200,{ok:true});}
    if(route==='/api/me'&&req.method==='GET')return json(200,{user:publicUser(u)});
    if(route==='/api/password'&&req.method==='POST'){
     const b=await body(req),old=text(b.currentPassword,128),next=text(b.newPassword,128);if(next.length<8)throw fail(400,'새 비밀번호는 8자 이상 입력해주세요.');if(old===next)throw fail(400,'현재 비밀번호와 다른 비밀번호를 입력해주세요.');if(!await matches(old,u.password_hash))throw fail(400,'현재 비밀번호가 올바르지 않습니다.');const hash=await hashPassword(next);if(getUser(u.id).password_hash!==u.password_hash)throw fail(409,'비밀번호가 변경되었습니다. 다시 로그인해주세요.');db.prepare('UPDATE users SET password_hash=?,must_change=0 WHERE id=?').run(hash,u.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(u.id,u.token_hash);return json(200,{ok:true});
    }
    if(u.must_change)throw fail(403,'처음 로그인하면 비밀번호를 변경해주세요.',{code:'PASSWORD_CHANGE_REQUIRED'});
    if(route.startsWith('/api/important-events')||route==='/api/lesson-progress'){const result=await managementRoute({url:'http://localhost'+req.url,method:req.method},u,storage.DB,()=>body(req));res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));}
    if(route.startsWith('/api/submissions')){const result=await submissionRoute({url:'http://localhost'+req.url,method:req.method},u,storage.DB,storage.FILES,()=>body(req));res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));}
    if(route.startsWith('/api/resources')){const request={url:'http://localhost'+req.url,method:req.method};const result=await resourceRoute(request,u,storage.DB,storage.FILES,()=>body(req));res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));}
    if(route==='/api/state'&&req.method==='GET'){const s=state(u),extra=await managementState(storage.DB,u);return json(200,{...s,progress:extra.progress,events:[...s.events,...extra.important]});}
    if(route==='/api/availability'&&req.method==='PUT')return json(200,await saveStudentAvailability(storage.DB,u,await body(req)));
    if(route==='/api/results'&&req.method==='POST'){await saveAdmissionResult(storage.DB,u,await body(req));return json(200,{ok:true});}
    if(route==='/api/applications'&&req.method==='PUT'){const b=await body(req),student=b.student||u.id;if(!canStudent(u,getUser(student)))throw fail(403,'해당 학생의 지원 정보를 수정할 수 없습니다.');const rows=validateApplications(b.rows);await saveApplicationRows(storage.DB,student,rows,b.expectedRows);return json(200,{ok:true});}
    if(route==='/api/accounts/validate'&&req.method==='POST'){const b=await body(req);return json(200,{rows:validateRows(u,b.rows)});}
    if(route==='/api/accounts'&&req.method==='POST'){
     const b=await body(req),rows=validateRows(u,b.rows);if(rows.some(a=>a.error))throw fail(400,'등록 오류를 수정해주세요.',{rows});
     const credentials=[];for(const r of rows){const password='777777';credentials.push({...r,password,hash:await hashPassword(password)});}
     db.exec('BEGIN IMMEDIATE');try{const again=validateRows(u,b.rows);if(again.some(a=>a.error))throw fail(409,'다른 작업에서 계정이 등록되었습니다. 다시 확인해주세요.',{rows:again});const insert=db.prepare('INSERT INTO users(id,number,name,role,class,password_hash,must_change) VALUES(?,?,?,?,?,?,1)');for(const r of credentials)insert.run(r.id,r.number,r.name,r.role,r.class,r.hash);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
     return json(201,{credentials:credentials.map(({hash,error,row,...r})=>r)});
    }
    if(route==='/api/accounts/reset-password'&&req.method==='POST'){
     requireManager(u);const b=await body(req),target=getUser(text(b.id,40));if(!target||target.role==='관리자'||!(u.role==='관리자'||canStudent(u,target)))throw fail(403,'이 계정의 비밀번호를 초기화할 수 없습니다.');const password='777777',hash=await hashPassword(password);db.prepare('UPDATE users SET password_hash=?,must_change=1 WHERE id=?').run(hash,target.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);return json(200,{credentials:[{...publicUser(target),password}]});
    }

    if(route==='/api/accounts/classes'&&req.method==='POST'){
     if(u.role!=='관리자')throw fail(403,'관리자만 교사의 배정반을 변경할 수 있습니다.');const b=await body(req),target=getUser(text(b.id,40));if(!target||target.role!=='교사')throw fail(404,'교사 계정을 찾을 수 없습니다.');const classes=normalizeClass(text(b.class,1700),'교사');db.prepare('UPDATE users SET class=? WHERE id=?').run(classes,target.id);return json(200,{ok:true});
    }
    if(route==='/api/accounts/delete'&&req.method==='POST'){const b=await body(req);await deleteAccountData(storage.DB,u,b.id);return json(200,{ok:true});}
    if(route==='/api/events'&&req.method==='POST'){const e=validateEvent(u,await body(req)),id=crypto.randomUUID();db.prepare('INSERT INTO events(id,type,student,class,univ,major,date,time,title,task,lesson_kind,teacher_name,target_ids,teacher_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,e.type,e.student,e.class,e.univ,e.major,e.date,e.time,e.title,e.task,e.lesson_kind||'',e.teacher_name||'',e.target_ids||'null',e.teacher_id||'');return json(201,{id});}
    const m=route.match(/^\/api\/events\/([a-zA-Z0-9-]+)$/);
    if(m&&['PUT','DELETE'].includes(req.method)){
     requireManager(u);const b=await body(req),old=db.prepare('SELECT * FROM events WHERE id=?').get(m[1]);if(!old||!canEvent(u,old))throw fail(404,'일정을 찾을 수 없습니다.');
     if(req.method==='DELETE')db.prepare('DELETE FROM events WHERE id=?').run(old.id);else{const e=validateEvent(u,b,old);db.prepare('UPDATE events SET type=?,student=?,class=?,univ=?,major=?,date=?,time=?,title=?,task=?,lesson_kind=?,teacher_name=?,target_ids=?,teacher_id=? WHERE id=?').run(e.type,e.student,e.class,e.univ,e.major,e.date,e.time,e.title,e.task,e.lesson_kind||'',e.teacher_name||'',e.target_ids||'null',e.teacher_id||'',old.id);}return json(200,{ok:true});
    }
    throw fail(404,'요청한 기능을 찾을 수 없습니다.');
   }
   if(!['GET','HEAD'].includes(req.method))throw fail(405,'허용되지 않은 요청입니다.');
   const assets={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/exceljs.min.js':'exceljs.min.js','/exceljs.LICENSE':'exceljs.LICENSE'},name=assets[route];if(!name)throw fail(404,'페이지를 찾을 수 없습니다.');
   const data=await fs.promises.readFile(path.join(__dirname,'dist',name));res.setHeader('Cache-Control','no-cache');res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8');res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(!e.status)console.error('Request failed:',e.message);if(!res.headersSent)json(e.status||500,{error:e.status?e.message:'저장 중 문제가 발생했습니다. 다시 시도해주세요.',...(e.rows?{rows:e.rows}:{}),...(e.code?{code:e.code}:{})});else res.end();}
 });
 return {server,db,ready,close:()=>new Promise(resolve=>{server.close(()=>{db.close();resolve();});server.closeIdleConnections();})};
}
module.exports={createApp};
