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
 await req('/api/events/'+one,c['teacher.a'],'PUT',{...lesson,target_ids:['student.b']});assert.equal((await state(c['student.a'])).submissions.length,0);assert.equal((await req('/api/submissions/files/'+file.id,c['student.a'])).status,404);
 await req('/api/accounts/delete',admin,'POST',{id:'student.a'});assert.equal((await state(admin)).submissions.length,0);assert.equal((await req('/api/submissions/files/'+file.id,admin)).status,404);
 assert.equal((await req('/api/submissions',c['student.b'],'POST',{...payload,event:group})).status,201);await req('/api/events/'+group,c['teacher.b'],'DELETE',{});assert.equal((await state(admin)).submissions.length,0);
 console.log('PASS: assignment targets, role/class privacy, file bytes, input validation, resubmission, persistence and cascade deletion');
}finally{if(app)await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
