const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));let app,base;
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,cookie='',method='GET',body){const r=await fetch(base+route,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 await start();const admin=(await req('/api/login','','POST',{id:'admin',password:'admin123'})).cookie;
 const users=[['student.a','학생','1','1반'],['student.b','학생','2','1반'],['student.c','학생','3','2반'],['teacher.a','교사','','1반'],['teacher.b','교사','','1반'],['teacher.c','교사','','2반']].map(([id,role,number,cls])=>({id,role,number,class:cls,name:id}));
 assert.equal((await req('/api/accounts',admin,'POST',{rows:users})).status,201);const c={};for(const u of users){c[u.id]=(await req('/api/login','','POST',{id:u.id,password:'777777'})).cookie;await req('/api/password',c[u.id],'POST',{currentPassword:'777777',newPassword:'Password123!'});}


 const get=async cookie=>(await req('/api/state',cookie)).data;
 const preference={student:'student.a',days:[1,3],note:'최저 준비',min_exam:true,expected:null};
 assert.equal((await req('/api/availability',c['student.a'],'PUT',preference)).status,200);
 let saved=(await get(c['teacher.a'])).availability[0];assert.equal(saved.min_exam,true);
 const expected={days:saved.days,note:saved.note,min_exam:saved.min_exam};
 for(const cookie of [c['teacher.c'],c['student.b']])assert.equal((await req('/api/availability',cookie,'PUT',{...preference,expected})).status,403);
 assert.equal((await req('/api/availability',c['teacher.a'],'PUT',{...preference,days:[2],min_exam:false,expected})).status,200);
 assert.equal((await req('/api/availability',c['student.a'],'PUT',{...preference,expected})).status,409);
 assert.equal((await get(c['student.a'])).availability[0].min_exam,false);
 const row={primary:true,univ:'학생대',admission:'종합',major:'수학',interviewType:'생기부 기반',firstDate:'2026-10-01',interviewDate:'2026-11-01',finalDate:'2026-12-01',firstResult:'',finalResult:'',direct:false},rows=[row,...Array.from({length:5},()=>({}))];
 const payload={student:'student.a',rows,expectedRows:null};
 for(const cookie of [c['teacher.c'],c['student.b']])assert.equal((await req('/api/applications',cookie,'PUT',payload)).status,403);
 assert.equal((await req('/api/applications',c['teacher.a'],'PUT',payload)).status,200);
 const before=(await get(c['student.a'])).applications[0].rows;
 assert.equal((await req('/api/applications',c['teacher.b'],'PUT',{...payload,rows:before.map((r,i)=>i?r:{...r,univ:'수정대',firstResult:'불합격'}),expectedRows:before})).status,200);
 const after=await get(c['student.a']);assert.equal(after.applications[0].rows[0].univ,'수정대');assert.equal(after.events.filter(e=>e.inactive).length,2);
 assert.equal((await req('/api/applications',c['student.a'],'PUT',{...payload,expectedRows:before})).status,409);
 await app.close();await start();assert.deepEqual((await get(c['teacher.a'])).availability[0].days,[2]);assert.equal((await get(c['student.a'])).applications[0].rows[0].univ,'수정대');
 console.log('PASS: student/teacher edits, minimum-exam flag, class scope, stale-write protection, propagation and persistence');
}finally{if(app)await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
