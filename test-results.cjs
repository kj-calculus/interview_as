const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));let app,base;
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,cookie='',method='GET',body){const r=await fetch(base+route,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 await start();const admin=(await req('/api/login','','POST',{id:'admin',password:'admin123'})).cookie;
 const users=[['student.a','학생','1','1반'],['student.b','학생','2','1반'],['student.c','학생','3','2반'],['teacher.a','교사','','1반'],['teacher.b','교사','','1반'],['teacher.c','교사','','2반']].map(([id,role,number,cls])=>({id,role,number,class:cls,name:id}));
 assert.equal((await req('/api/accounts',admin,'POST',{rows:users})).status,201);const c={};for(const u of users){c[u.id]=(await req('/api/login','','POST',{id:u.id,password:'777777'})).cookie;await req('/api/password',c[u.id],'POST',{currentPassword:'777777',newPassword:'Password123!'});}

 const row={univ:'테스트대',admission:'종합',major:'수학',interviewType:'생기부 기반',firstDate:'2026-10-01',interviewDate:'2026-11-01',finalDate:'2026-12-01',firstResult:'',finalResult:'',direct:false};
 let rows=[row,{...row,admission:'추천'},...Array.from({length:4},()=>({}))];assert.equal((await req('/api/applications',c['student.a'],'PUT',{rows,expectedRows:null})).status,200);
 const state=async cookie=>(await req('/api/state',cookie)).data;
 rows=(await state(c['student.a'])).applications[0].rows;const original=structuredClone(rows);
 const payload={student:'student.a',slot:0,phase:'first',result:'합격',expectedRow:rows[0]};
 for(const cookie of [c['student.b'],c['teacher.c']])assert.equal((await req('/api/results',cookie,'POST',payload)).status,403);
 assert.equal((await req('/api/results',c['student.a'],'POST',payload)).status,200);
 assert.equal((await state(c['teacher.a'])).applications[0].rows[0].firstResult,'합격');
 assert.equal((await state(c['teacher.a'])).applications[0].rows[1].firstResult,'');
 assert.equal((await req('/api/results',c['teacher.a'],'POST',{...payload,result:'불합격'})).status,409);
 assert.equal((await req('/api/applications',c['student.a'],'PUT',{rows:original,expectedRows:original})).status,409);
 rows=(await state(c['teacher.a'])).applications[0].rows;
 assert.equal((await req('/api/results',c['teacher.a'],'POST',{...payload,phase:'final',result:'합격',expectedRow:rows[0]})).status,200);
 rows=(await state(c['student.a'])).applications[0].rows;assert.equal(rows[0].finalResult,'합격');
 assert.equal((await req('/api/results',c['teacher.b'],'POST',{...payload,result:'불합격',expectedRow:rows[0]})).status,200);
 let s=await state(c['student.a']);assert.equal(s.applications[0].rows[0].finalResult,'');assert.equal(s.events.filter(e=>e.application==='student.a:0'&&e.inactive).length,2);
 assert.equal((await req('/api/results',c['student.a'],'POST',{...payload,phase:'final',expectedRow:s.applications[0].rows[0]})).status,400);
 assert.equal((await req('/api/results',c['student.a'],'POST',{...payload,result:'',expectedRow:s.applications[0].rows[0]})).status,200);
 for(const change of [{phase:'interview'},{result:'대기'},{slot:6}])assert.equal((await req('/api/results',admin,'POST',{...payload,...change})).status,400);
 const lesson={type:'lesson',class:'1반',title:'2차-개별지도',lesson_kind:'2차-개별지도',date:'2026-11-09',time:'7교시',target_ids:null};
 const created=await req('/api/events',c['teacher.a'],'POST',{...lesson,teacher_id:'teacher.b'});assert.equal(created.status,201);
 assert.equal((await state(c['teacher.b'])).events.find(e=>e.id===created.data.id).teacher_id,'teacher.a');
 await req('/api/events/'+created.data.id,c['teacher.b'],'PUT',lesson);assert.equal((await state(c['teacher.b'])).events.find(e=>e.id===created.data.id).teacher_id,'teacher.a');
 app.db.prepare("UPDATE events SET teacher_id='' WHERE id=?").run(created.data.id);assert.equal((await state(c['teacher.a'])).events.find(e=>e.id===created.data.id).teacher_id,'teacher.a');
 const legacy=await req('/api/events',c['teacher.a'],'POST',{type:'first',student:'student.a',univ:'개별대',major:'물리',date:'2026-11-01',time:'09:00'});
 assert.equal((await req('/api/results',c['teacher.a'],'POST',{student:'student.a',eventId:legacy.data.id,phase:'first',result:'합격',expectedResult:''})).status,200);
 await app.close();await start();assert.equal((await state(c['student.a'])).events.find(e=>e.id===legacy.data.id).result,'합격');
 console.log('PASS: student/teacher result synchronization, class scope, stale-write prevention, failure deactivation, independent applications, and immutable lesson ownership');
}finally{if(app)await app.close();if(path.dirname(dataDir)===__dirname&&path.basename(dataDir).startsWith('.test-data-'))fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
