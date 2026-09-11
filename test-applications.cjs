const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));let app,base;
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,cookie='',method='GET',body){const r=await fetch(base+route,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 await start();const admin=(await req('/api/login','','POST',{id:'admin',password:'admin123'})).cookie;
 const users=[{id:'student.a',role:'학생',number:'1',class:'1반'},{id:'student.b',role:'학생',number:'2',class:'2반'},{id:'teacher.a',role:'교사',number:'',class:'1반'},{id:'teacher.b',role:'교사',number:'',class:'2반'}].map(r=>({...r,name:r.id}));
 assert.equal((await req('/api/accounts',admin,'POST',{rows:users})).status,201);
 const cookies={};for(const u of users){const c=(await req('/api/login','','POST',{id:u.id,password:'777777'})).cookie;assert.equal((await req('/api/password',c,'POST',{currentPassword:'777777',newPassword:'newPassword!'})).status,200);cookies[u.id]=c;}
 const student=cookies['student.a'],row={univ:'동일대',admission:'종합',major:'수학',interviewType:'생기부 기반',firstDate:'2026-10-01',interviewDate:'2026-11-01',finalDate:'2026-12-01',firstResult:'',finalResult:'',direct:false},rows=[row,{...row,admission:'교과',direct:true},...Array.from({length:4},()=>({}))];
 assert.equal((await req('/api/applications',student,'PUT',{rows})).status,200);
 for(const c of [student,admin,cookies['teacher.a']]){const s=(await req('/api/state',c)).data;assert.equal(s.applications.length,1);assert.equal(s.events.length,5);assert.equal(new Set(s.events.map(e=>e.application)).size,2);}
 for(const c of [cookies['student.b'],cookies['teacher.b']]){const s=(await req('/api/state',c)).data;assert.equal(s.applications.length,0);assert.equal(s.events.length,0);}
 assert.equal((await req('/api/applications',student,'PUT',{student:'student.b',rows})).status,403);
 assert.equal((await req('/api/applications',admin,'PUT',{rows})).status,403);
 for(const invalid of [rows.slice(0,5),[...rows,{}],rows.map((r,i)=>i?r:{...r,interviewType:'임의'}),rows.map((r,i)=>i?r:{...r,interviewDate:'2026-02-30'}),rows.map((r,i)=>i?r:{...r,finalDate:'2026-09-01'})])assert.equal((await req('/api/applications',student,'PUT',{rows:invalid})).status,400);
 rows[0]={...row,firstResult:'불합격',finalResult:'합격'};assert.equal((await req('/api/applications',student,'PUT',{rows})).status,200);
 for(const c of [student,admin,cookies['teacher.a']]){const s=(await req('/api/state',c)).data;assert.equal(s.events.filter(e=>e.inactive).length,2);assert.equal(s.applications[0].rows[0].finalResult,'');}
 await app.close();await start();assert.equal((await req('/api/state',student)).data.events.filter(e=>e.inactive).length,2);
 rows[0]={...row,firstResult:'합격'};await req('/api/applications',student,'PUT',{rows});assert.equal((await req('/api/state',student)).data.events.some(e=>e.inactive),false);
 assert.equal((await req('/api/accounts/delete',admin,'POST',{id:'student.a'})).status,200);assert.equal((await req('/api/state',admin)).data.applications.length,0);
 console.log('PASS: six applications, direct interview, failures/reactivation, validation, ownership, class isolation, persistence and deletion');
}finally{if(app)await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
