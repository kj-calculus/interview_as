const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));let app,base;
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,cookie='',method='GET',body){const r=await fetch(base+route,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 await start();const admin=(await req('/api/login','','POST',{id:'admin',password:'admin123'})).cookie;
 const users=[['student.a','학생','1','1반'],['student.b','학생','2','1반'],['student.c','학생','3','2반'],['teacher.a','교사','','1반'],['teacher.b','교사','','1반'],['teacher.c','교사','','2반']].map(([id,role,number,cls])=>({id,role,number,class:cls,name:id}));
 assert.equal((await req('/api/accounts',admin,'POST',{rows:users})).status,201);const c={};for(const u of users){c[u.id]=(await req('/api/login','','POST',{id:u.id,password:'777777'})).cookie;await req('/api/password',c[u.id],'POST',{currentPassword:'777777',newPassword:'Password123!'});}

 const create=async(cookie,body)=>{const r=await req('/api/events',cookie,'POST',body);assert.equal(r.status,201);return r.data.id;};
 const lesson={type:'lesson',class:'1반',title:'2차-개별지도',lesson_kind:'2차-개별지도',date:'2026-11-09',time:'7교시',task:'과제'};
 const one=await create(c['teacher.a'],{...lesson,target_ids:['student.a']}),group=await create(c['teacher.b'],{...lesson,target_ids:['student.a','student.b']}),all=await create(c['teacher.b'],{...lesson,target_ids:null,lesson_kind:'1차-OT'}),other=await create(c['teacher.c'],{...lesson,class:'2반',target_ids:['student.c']});
 const college=await create(c['teacher.a'],{type:'interview',student:'student.b',univ:'대학',major:'학과',date:'2026-11-12',time:'09:00'});
 const important={title:'수능',date:'2026-11-19',description:'학교 중요 일정'};
 assert.equal((await req('/api/important-events',c['student.a'],'POST',important)).status,403);
 const school=await req('/api/important-events',c['teacher.a'],'POST',important);assert.equal(school.status,201);
 for(const cookie of [admin,c['teacher.c'],c['student.a'],c['student.c']])assert.equal((await req('/api/state',cookie)).data.events.filter(e=>e.type==='important').length,1);
 assert.equal((await req('/api/important-events/'+school.data.id,c['teacher.b'],'PUT',important)).status,403);
 assert.equal((await req('/api/important-events/'+school.data.id,admin,'PUT',{...important,title:'수능 안내'})).status,200);
 assert.equal((await req('/api/important-events',admin,'POST',{...important,date:'2026-02-30'})).status,400);
 const mark={event:group,student:'student.a',completed:true};
 assert.equal((await req('/api/lesson-progress',c['teacher.a'],'PUT',mark)).status,200);
 assert.equal((await req('/api/lesson-progress',c['teacher.b'],'PUT',{...mark,student:'student.b'})).status,200);
 assert.equal((await req('/api/state',c['teacher.a'])).data.progress.length,2);
 assert.equal((await req('/api/state',c['teacher.c'])).data.progress.length,0);
 for(const cookie of [c['teacher.c'],c['student.a']])assert.equal((await req('/api/lesson-progress',cookie,'PUT',mark)).status,403);
 assert.equal((await req('/api/lesson-progress',c['teacher.a'],'PUT',{...mark,event:one,student:'student.b'})).status,403);
 assert.equal((await req('/api/lesson-progress',c['teacher.a'],'PUT',{...mark,completed:false})).status,200);assert.equal((await req('/api/state',c['teacher.a'])).data.progress.length,1);
 await req('/api/lesson-progress',c['teacher.a'],'PUT',mark);
 await req('/api/availability',c['student.a'],'PUT',{days:[1],note:'특이사항'});await req('/api/applications',c['student.a'],'PUT',{rows:Array.from({length:6},()=>({}))});
 assert.equal((await req('/api/accounts/delete',admin,'POST',{id:'student.a'})).status,200);
 let state=(await req('/api/state',admin)).data;assert.ok(!state.events.some(e=>e.id===one));assert.deepEqual(JSON.parse(state.events.find(e=>e.id===group).target_ids),['student.b']);assert.ok(state.events.some(e=>e.id===all));assert.equal(state.progress.length,1);assert.equal(state.progress[0].student,'student.b');assert.equal(state.availability.length,0);assert.equal(state.applications.length,0);
 const teacherOwned=await create(c['teacher.a'],{...lesson,target_ids:['student.b']});app.db.prepare("UPDATE events SET teacher_id='' WHERE id=?").run(teacherOwned);
 assert.equal((await req('/api/accounts/delete',admin,'POST',{id:'teacher.a'})).status,200);state=(await req('/api/state',admin)).data;assert.ok(!state.events.some(e=>[teacherOwned,college,school.data.id].includes(e.id)));assert.ok(state.events.some(e=>e.id===group));assert.ok(state.events.some(e=>e.id===other));
 await app.close();await start();state=(await req('/api/state',c['teacher.b'])).data;assert.equal(state.progress.length,1);
 await req('/api/events/'+group,c['teacher.b'],'DELETE',{});assert.equal((await req('/api/state',admin)).data.progress.length,0);
 console.log('PASS: account schedule cleanup, shared-group retention, teacher ownership cleanup, important calendar permissions, scoped progress completion/undo and persistence');
}finally{if(app)await app.close();if(path.dirname(dataDir)===__dirname&&path.basename(dataDir).startsWith('.test-data-'))fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
