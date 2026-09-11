const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));
let app,base,checks=0;
function equal(actual,expected){assert.deepEqual(actual,expected);checks++;}
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,{cookie='',method='GET',body,headers={}}={}){const r=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}
async function login(id,password){const r=await req('/api/login',{method:'POST',body:{id,password}});equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);return r.cookie;}
const row=(id,role,cls,number='')=>({id,name:id,role,class:cls,number});
(async()=>{
 await start();equal((await req('/api/state')).status,401);
 equal((await req('/api/login',{method:'POST',body:{id:'admin',password:'wrong'}})).status,401);
 const admin=await login('admin','admin123');
 equal((await req('/api/state',{cookie:admin})).data.accounts.length,1);
 const create=await req('/api/accounts',{cookie:admin,method:'POST',body:{rows:[row('teacher.a','교사','A반'),row('teacher.b','교사','B반'),row('student.a','학생','A반','30101'),row('student.b','학생','B반','30201')]}});
 equal(create.status,201);equal(create.data.credentials.length,4);
 assert.equal(JSON.stringify((await req('/api/state',{cookie:admin})).data).includes('password_hash'),false);checks++;
 const cookies={};for(const credential of create.data.credentials){let c=await login(credential.id,credential.password);equal((await req('/api/state',{cookie:c})).data.code,'PASSWORD_CHANGE_REQUIRED');equal((await req('/api/password',{cookie:c,method:'POST',body:{currentPassword:credential.password,newPassword:'SecurePass123!'}})).status,200);cookies[credential.id]=c;}
 const teacher=cookies['teacher.a'],student=cookies['student.a'];
 equal((await req('/api/state',{cookie:teacher})).data.accounts.map(a=>a.id).sort(),['student.a','teacher.a']);
 equal((await req('/api/state',{cookie:student})).data.accounts.map(a=>a.id),['student.a']);
 equal((await req('/api/accounts',{cookie:student,method:'POST',body:{rows:[row('bad.teacher','교사','A반')],role:'관리자'}})).status,403);
 for(const r of [row('other.student','학생','B반','30103'),row('other.teacher','교사','A반')])equal((await req('/api/accounts',{cookie:teacher,method:'POST',body:{rows:[r]}})).status,400);
 equal((await req('/api/accounts',{cookie:teacher,method:'POST',body:{rows:[row('STUDENT.A','학생','A반','30104')]}})).status,400);
 equal((await req('/api/accounts',{cookie:admin,method:'POST',body:{rows:[row('fresh.student','학생','A반','30105'),row('duplicate.student','학생','B반','30101')]}})).status,400);
 equal((await req('/api/state',{cookie:admin})).data.accounts.some(a=>a.id==='fresh.student'),false);
 const result=await req('/api/accounts',{cookie:teacher,method:'POST',body:{rows:[row('new.student','학생','A반','30105')]}});equal(result.status,201);
 const lesson={type:'lesson',class:'A반',title:'모의면접',date:'2026-11-12',time:'16:30',task:'지원 동기 준비'};
 const createLesson=await req('/api/events',{cookie:teacher,method:'POST',body:lesson});equal(createLesson.status,201);
 equal((await req('/api/events',{cookie:teacher,method:'POST',body:{...lesson,class:'B반'}})).status,403);
 equal((await req('/api/events',{cookie:student,method:'POST',body:lesson})).status,403);
 equal((await req('/api/events',{cookie:teacher,method:'POST',body:{...lesson,date:'2026-02-30'}})).status,400);
 const interview={type:'interview',student:'student.a',univ:'테스트대학교',major:'경제학과',date:'2026-11-15',time:'10:00'};
 const schedule=await req('/api/events',{cookie:teacher,method:'POST',body:interview});equal(schedule.status,201);
 equal((await req('/api/events',{cookie:teacher,method:'POST',body:{...interview,student:'student.b'}})).status,403);
 equal((await req('/api/state',{cookie:student})).data.events.length,2);
 equal((await req('/api/state',{cookie:cookies['student.b']})).data.events.length,0);
 equal((await req(`/api/events/${createLesson.data.id}`,{cookie:cookies['teacher.b'],method:'PUT',body:lesson})).status,404);
 equal((await req(`/api/events/${createLesson.data.id}`,{cookie:teacher,method:'PUT',body:{...lesson,task:'수정된 과제'}})).status,200);
 equal((await req('/api/state',{cookie:student})).data.events.find(e=>e.type==='lesson').task,'수정된 과제');
 equal((await req(`/api/events/${schedule.data.id}`,{cookie:student,method:'DELETE',body:{}})).status,403);
 equal((await req('/api/events',{cookie:teacher,method:'POST',body:lesson,headers:{Origin:'https://evil.example'}})).status,403);
 equal((await req('/api/events',{cookie:teacher,method:'POST',body:lesson,headers:{'X-Interview-Request':'0'}})).status,415);
 equal((await req('/api/accounts/reset-password',{cookie:teacher,method:'POST',body:{id:'student.b'}})).status,403);
 const reset=await req('/api/accounts/reset-password',{cookie:teacher,method:'POST',body:{id:'student.a'}});equal(reset.status,200);
 equal((await req('/api/state',{cookie:student})).status,401);
 equal((await req('/api/login',{method:'POST',body:{id:'student.a',password:'SecurePass123!'}})).status,401);
 const resetSession=await login('student.a',reset.data.credentials[0].password);equal((await req('/api/state',{cookie:resetSession})).data.code,'PASSWORD_CHANGE_REQUIRED');
 equal((await req('/api/password',{cookie:admin,method:'POST',body:{currentPassword:'admin123',newPassword:'UpdatedAdmin123!'}})).status,200);
 await app.close();await start();
 equal((await req('/api/state',{cookie:admin})).data.events.length,2);
 equal((await req('/api/login',{method:'POST',body:{id:'admin',password:'admin123'}})).status,401);
 const newAdmin=await login('admin','UpdatedAdmin123!');
 equal((await req(`/api/events/${schedule.data.id}`,{cookie:newAdmin,method:'DELETE',body:{}})).status,200);
 equal((await req('/api/state',{cookie:newAdmin})).data.events.length,1);
 equal((await req('/api/logout',{cookie:newAdmin,method:'POST',body:{}})).status,200);
 equal((await req('/api/state',{cookie:newAdmin})).status,401);
 const stored=app.db.prepare('SELECT password_hash FROM users WHERE id=?').get('admin').password_hash;assert.notEqual(stored,'UpdatedAdmin123!');checks++;
 console.log(`PASS: ${checks} authentication, authorization, account import, schedule, reset, and restart persistence checks`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(app)await app.close();if(path.dirname(dataDir)===__dirname&&path.basename(dataDir).startsWith('.test-data-'))fs.rmSync(dataDir,{recursive:true,force:true});});
