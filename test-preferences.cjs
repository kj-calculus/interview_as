const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));let app,base;
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,cookie='',method='GET',body){const r=await fetch(base+route,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 await start();const admin=(await req('/api/login','','POST',{id:'admin',password:'admin123'})).cookie;
 const users=[['student.a','학생','1','1반'],['student.b','학생','2','1반'],['student.c','학생','3','2반'],['teacher.a','교사','','1반'],['teacher.b','교사','','1반'],['teacher.c','교사','','2반']].map(([id,role,number,cls])=>({id,role,number,class:cls,name:id}));
 assert.equal((await req('/api/accounts',admin,'POST',{rows:users})).status,201);const c={};for(const u of users){c[u.id]=(await req('/api/login','','POST',{id:u.id,password:'777777'})).cookie;await req('/api/password',c[u.id],'POST',{currentPassword:'777777',newPassword:'Password123!'});}

 assert.equal((await req('/api/availability',c['student.a'],'PUT',{days:[1,3],note:'수요일 학원 <특이사항>'})).status,200);
 for(const cookie of [admin,c['teacher.a'],c['teacher.b'],c['student.a']]){const a=(await req('/api/state',cookie)).data.availability;assert.equal(a.length,1);assert.deepEqual(a[0].days,[1,3]);assert.equal(a[0].note,'수요일 학원 <특이사항>');}
 for(const cookie of [c['student.b'],c['student.c'],c['teacher.c']])assert.equal((await req('/api/state',cookie)).data.availability.length,0);
 assert.equal((await req('/api/availability',c['teacher.a'],'PUT',{days:[],note:''})).status,403);
 assert.equal((await req('/api/availability',c['student.a'],'PUT',{student:'student.b',days:[],note:''})).status,403);
 for(const b of [{days:[0],note:''},{days:['1'],note:''},{days:[1],note:'x'.repeat(2001)}])assert.equal((await req('/api/availability',c['student.a'],'PUT',b)).status,400);
 const lesson={type:'lesson',class:'1반',title:'1차-OT',lesson_kind:'1차-OT',date:'2026-11-09',task:'',target_ids:['student.a']};
 for(const time of ['7교시','8교시','상시'])assert.equal((await req('/api/events',c['teacher.a'],'POST',{...lesson,time})).status,201);
 for(const time of ['9교시','16:30'])assert.equal((await req('/api/events',c['teacher.a'],'POST',{...lesson,time})).status,400);
 const post={title:'선택 공개',content:'개별 안내',target_ids:['student.a'],files:[{name:'안내.txt',data:Buffer.from('비공개 첨부').toString('base64')}]};
 assert.equal((await req('/api/resources',c['student.a'],'POST',post)).status,403);
 for(const target_ids of [[],['student.c'],['teacher.a']])assert.equal((await req('/api/resources',c['teacher.a'],'POST',{...post,target_ids})).status,400);
 const created=await req('/api/resources',c['teacher.a'],'POST',post);assert.equal(created.status,201);const pid=created.data.id;
 const data=(await req('/api/resources',c['student.a'])).data.posts;assert.equal(data.length,1);assert.equal(data[0].editable,false);const fid=data[0].files[0].id;
 for(const cookie of [c['student.b'],c['student.c'],c['teacher.c']]){assert.equal((await req('/api/resources',cookie)).data.posts.length,0);assert.equal((await req('/api/resources/files/'+fid,cookie)).status,404);}
 assert.equal((await req('/api/resources/files/'+fid,c['student.a'])).status,200);
 for(const method of ['PUT','DELETE'])assert.equal((await req('/api/resources/'+pid,c['student.a'],method,post)).status,403);
 assert.equal((await req('/api/resources/'+pid,c['teacher.a'],'PUT',{...post,target_ids:null})).status,200);
 assert.equal((await req('/api/resources',c['student.b'])).data.posts.length,1);assert.equal((await req('/api/resources/files/'+fid,c['student.b'])).status,200);
 await req('/api/resources/'+pid,c['teacher.a'],'PUT',{...post,target_ids:['student.b']});assert.equal((await req('/api/resources/files/'+fid,c['student.a'])).status,404);
 await app.close();await start();assert.deepEqual((await req('/api/state',c['teacher.a'])).data.availability[0].days,[1,3]);assert.equal((await req('/api/resources/files/'+fid,c['student.a'])).status,404);
 await req('/api/availability',c['student.a'],'PUT',{days:[],note:''});assert.deepEqual((await req('/api/state',c['teacher.a'])).data.availability[0].days,[]);
 console.log('PASS: student read-only resources, selective post/file access, audience changes, preferences ownership and persistence, and lesson periods');
}finally{if(app)await app.close();if(path.dirname(dataDir)===__dirname&&path.basename(dataDir).startsWith('.test-data-'))fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
