const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));let app,base;
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,cookie='',method='GET',body){const r=await fetch(base+route,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 await start();const admin=(await req('/api/login','','POST',{id:'admin',password:'admin123'})).cookie;
 const users=[['student.a','학생','1','1반'],['student.b','학생','2','1반'],['student.c','학생','3','2반'],['teacher.a','교사','','1반'],['teacher.b','교사','','1반'],['teacher.c','교사','','2반']].map(([id,role,number,cls])=>({id,role,number,class:cls,name:id}));
 assert.equal((await req('/api/accounts',admin,'POST',{rows:users})).status,201);const c={};for(const u of users){c[u.id]=(await req('/api/login','','POST',{id:u.id,password:'777777'})).cookie;await req('/api/password',c[u.id],'POST',{currentPassword:'777777',newPassword:'Password123!'});}
 const lesson={type:'lesson',class:'1반',title:'2차-개별지도',lesson_kind:'2차-개별지도',date:'2026-11-07',time:'16:30',task:'준비하기',target_ids:['student.a']};
 const created=await req('/api/events',c['teacher.a'],'POST',lesson);assert.equal(created.status,201);const id=created.data.id;
 for(const cookie of [admin,c['teacher.a'],c['teacher.b'],c['student.a']]){const e=(await req('/api/state',cookie)).data.events;assert.equal(e.length,1);assert.equal(e[0].title,'teacher.a 2차-개별지도');assert.equal(e[0].date,'2026-11-07');}
 for(const cookie of [c['student.b'],c['student.c'],c['teacher.c']])assert.equal((await req('/api/state',cookie)).data.events.length,0);
 for(const target_ids of [[],['student.c'],['teacher.a'],'all'])assert.equal((await req('/api/events',c['teacher.a'],'POST',{...lesson,target_ids})).status,400);
 assert.equal((await req('/api/events',c['teacher.a'],'POST',{...lesson,lesson_kind:'invalid'})).status,400);
 assert.equal((await req('/api/events/'+id,c['teacher.b'],'PUT',{...lesson,target_ids:['student.a','student.b'],teacher_name:'forged'})).status,200);
 assert.equal((await req('/api/state',c['student.b'])).data.events[0].teacher_name,'teacher.a');
 assert.equal((await req('/api/events',c['teacher.a'],'POST',{...lesson,lesson_kind:'1차-OT',target_ids:null})).status,201);
 assert.equal((await req('/api/state',c['student.b'])).data.events.length,2);
 const bytes=Buffer.from('첨부파일 테스트\u0000\u00ff'),post={title:'면접 자료',content:'준비 자료입니다.',files:[{name:'면접 자료.txt',data:bytes.toString('base64')}]};
 assert.equal((await req('/api/resources','','POST',post)).status,401);
 const posted=await req('/api/resources',c['student.a'],'POST',post);assert.equal(posted.status,201);const pid=posted.data.id;
 const listing=(await req('/api/resources',c['teacher.c'])).data.posts;assert.equal(listing.length,1);assert.equal(listing[0].editable,false);const fid=listing[0].files[0].id;
 const file=await req('/api/resources/files/'+fid,c['student.b']);assert.equal(file.status,200);assert.deepEqual(file.data,bytes);assert.match(file.headers.get('content-disposition'),/attachment/);
 assert.equal((await req('/api/resources/files/'+fid)).status,401);
 assert.equal((await req('/api/resources/'+pid,c['student.b'],'PUT',{title:'x',content:'x'})).status,403);
 assert.equal((await req('/api/resources/'+pid,c['student.b'],'DELETE',{})).status,403);
 assert.equal((await req('/api/resources/'+pid,c['student.a'],'PUT',{title:'수정',content:'수정 내용'})).status,200);
 assert.equal((await req('/api/resources',admin,'POST',{...post,files:[{name:'x',data:'invalid!'}]})).status,400);
 assert.equal((await req('/api/resources',admin,'POST',{...post,files:Array(4).fill(post.files[0])})).status,400);
 assert.equal((await req('/api/resources',admin,'POST',{...post,files:[{name:'large',data:Buffer.alloc(2*1024*1024+1).toString('base64')}]})).status,413);
 await app.close();await start();assert.deepEqual((await req('/api/resources/files/'+fid,c['student.a'])).data,bytes);assert.equal((await req('/api/state',c['student.a'])).data.events.length,2);
 assert.equal((await req('/api/resources/'+pid,admin,'DELETE',{})).status,200);assert.equal((await req('/api/resources/files/'+fid,c['student.a'])).status,404);assert.equal((await req('/api/resources',admin)).data.posts.length,0);
 console.log('PASS: targeted lessons, all students, teacher attribution, class security, posts, file bytes, permissions, size limits and restart persistence');
}finally{if(app)await app.close();if(path.dirname(dataDir)===__dirname&&path.basename(dataDir).startsWith('.test-data-'))fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
