const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));let app,base;
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,cookie='',method='GET',body){const r=await fetch(base+route,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const migrationDb=new (require('node:sqlite').DatabaseSync)(':memory:');migrationDb.exec('PRAGMA foreign_keys=ON');for(const f of fs.readdirSync('drizzle').filter(f=>/^000[0-6]_.*sql$/.test(f)).sort())migrationDb.exec(fs.readFileSync('drizzle/'+f,'utf8'));migrationDb.exec("INSERT INTO users(id,name,role,number,class,password_hash) VALUES('old.student','학생','학생','99','1반','x'); INSERT INTO events(id,type,class,date,time,title,task) VALUES('old.lesson','lesson','1반','2026-09-14','7교시','기존 과제','안내'); INSERT INTO submissions VALUES('old.sub','old.lesson','old.student','제출 글','2026-09-14'); INSERT INTO submission_files VALUES('old.file','old.sub','자료.pdf',3);");migrationDb.exec(fs.readFileSync('drizzle/0007_fluffy_tusk.sql','utf8'));migrationDb.exec("DELETE FROM events WHERE id='old.lesson'");assert.equal(migrationDb.prepare('SELECT content FROM assignments').get().content,'안내');assert.equal(migrationDb.prepare('SELECT content FROM assignment_submissions').get().content,'제출 글');assert.equal(migrationDb.prepare('SELECT id FROM submission_attachments').get().id,'old.file');migrationDb.close();
(async()=>{try{
 await start();const admin=(await req('/api/login','','POST',{id:'admin',password:'admin123'})).cookie;
 const users=[['student.a','학생','1','1반'],['student.b','학생','2','1반'],['student.c','학생','3','2반'],['teacher.a','교사','','1반'],['teacher.b','교사','','1반'],['teacher.c','교사','','2반']].map(([id,role,number,cls])=>({id,role,number,class:cls,name:id}));
 assert.equal((await req('/api/accounts',admin,'POST',{rows:users})).status,201);const c={};for(const u of users){c[u.id]=(await req('/api/login','','POST',{id:u.id,password:'777777'})).cookie;await req('/api/password',c[u.id],'POST',{currentPassword:'777777',newPassword:'Password123!'});}


 const oldLesson=(await req('/api/events',c['teacher.a'],'POST',{type:'lesson',class:'1반',date:'2026-11-09',time:'7교시',title:'OT',lesson_kind:'1차-OT',target_ids:null,task:'준비사항'})).data.id;
 assert.equal((await req('/api/submissions',c['student.a'])).data.lessons.length,0);
 const assignment={title:'독립 과제',class:'1반',content:'작성 안내',target_ids:['student.a'],files:[{name:'안내.txt',data:Buffer.from('과제 안내').toString('base64')}]};
 assert.equal((await req('/api/submissions/assignments',c['student.a'],'POST',assignment)).status,403);
 assert.equal((await req('/api/submissions/assignments',c['teacher.c'],'POST',assignment)).status,403);
 assert.equal((await req('/api/submissions/assignments',c['teacher.a'],'POST',{...assignment,target_ids:['student.c']})).status,400);
 const created=await req('/api/submissions/assignments',c['teacher.a'],'POST',assignment);assert.equal(created.status,201);const one=created.data.id;
 const group=(await req('/api/submissions/assignments',c['teacher.b'],'POST',{...assignment,target_ids:['student.a','student.b']})).data.id;
 const teacherFile=(await req('/api/submissions',c['student.a'])).data.lessons.find(e=>e.id===one).files[0];
 assert.equal((await req('/api/submissions/assignment-files/'+teacherFile.id,c['student.a'])).data.toString(),'과제 안내');assert.equal((await req('/api/submissions/assignment-files/'+teacherFile.id,c['student.b'])).status,404);
 const payload={event:one,content:'과제 글 <script>',files:[{name:'과제.txt',data:Buffer.from('학생 제출 파일').toString('base64')}]};
 assert.equal((await req('/api/submissions')).status,401);
 assert.equal((await req('/api/submissions',c['teacher.a'],'POST',payload)).status,403);
 for(const cookie of [c['student.b'],c['student.c']])assert.equal((await req('/api/submissions',cookie,'POST',payload)).status,403);
 assert.equal((await req('/api/submissions',c['student.a'],'POST',{...payload,student:'student.b'})).status,403);
 assert.equal((await req('/api/submissions',c['student.a'],'POST',{...payload,content:'',files:[]})).status,400);
 assert.equal((await req('/api/submissions',c['student.a'],'POST',{...payload,files:[{name:'bad',data:'!!!'}]})).status,400);
 assert.equal((await req('/api/submissions',c['student.a'],'POST',{...payload,files:Array(4).fill(payload.files[0])})).status,400);
 assert.equal((await req('/api/submissions',c['student.a'],'POST',payload)).status,201);
 const state=async cookie=>(await req('/api/submissions',cookie)).data;
 const original=(await state(c['student.a'])).submissions[0],file=original.files[0];
 for(const cookie of [admin,c['teacher.a'],c['teacher.b'],c['student.a']]){assert.equal((await state(cookie)).submissions.length,1);const download=await req('/api/submissions/files/'+file.id,cookie);assert.equal(download.status,200);assert.equal(download.data.toString(),'학생 제출 파일');}
 for(const cookie of [c['student.b'],c['student.c'],c['teacher.c']]){assert.equal((await state(cookie)).submissions.length,0);assert.equal((await req('/api/submissions/files/'+file.id,cookie)).status,404);}
 assert.equal((await req('/api/submissions',c['student.a'],'POST',{...payload,content:'수정 제출',files:[]})).status,201);
 const latest=(await state(c['teacher.a'])).submissions;assert.equal(latest.length,1);assert.equal(latest[0].content,'수정 제출');assert.equal(latest[0].files.length,0);
 await app.close();await start();assert.equal((await state(c['teacher.b'])).submissions[0].content,'수정 제출');
 await req('/api/events/'+oldLesson,c['teacher.a'],'DELETE',{});assert.equal((await state(c['student.a'])).submissions.length,1);
 await req('/api/accounts/delete',admin,'POST',{id:'student.a'});assert.equal((await state(admin)).submissions.length,0);assert.equal((await req('/api/submissions/files/'+file.id,admin)).status,404);
 assert.equal((await req('/api/submissions',c['student.b'],'POST',{...payload,event:group})).status,201);assert.equal((await state(admin)).submissions.length,1);
 console.log('PASS: assignment targets, role/class privacy, file bytes, input validation, resubmission, persistence and cascade deletion');
}finally{if(app)await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
