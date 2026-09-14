const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp}=require(process.env.TEST_CLOUD?'./cloud/test-adapter.cjs':'./backend.cjs');
const dataDir=fs.mkdtempSync(path.join(__dirname,'.test-data-'));let app,base;
async function start(){app=createApp({dataDir});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function req(route,cookie='',method='GET',body){const r=await fetch(base+route,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Interview-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 await start();const admin=(await req('/api/login','','POST',{id:'admin',password:'admin123'})).cookie;
 const users=[['student.a','학생','1','1반'],['student.b','학생','2','1반'],['student.c','학생','3','2반'],['teacher.a','교사','','1반'],['teacher.b','교사','','1반'],['teacher.c','교사','','2반']].map(([id,role,number,cls])=>({id,role,number,class:cls,name:id}));
 assert.equal((await req('/api/accounts',admin,'POST',{rows:users})).status,201);const c={};for(const u of users){c[u.id]=(await req('/api/login','','POST',{id:u.id,password:'777777'})).cookie;await req('/api/password',c[u.id],'POST',{currentPassword:'777777',newPassword:'Password123!'});}



 const {handle:proxy}=await import('./api/proxy.mjs');
 async function staged(path,cookie,method,body){const text=JSON.stringify(body),size=512*1024,parts=Math.ceil(text.length/size),begin=await req('/api/uploads',cookie,'POST',{path,method,parts});assert.equal(begin.status,201);const id=begin.data.id;
  assert.equal((await req('/api/uploads/'+id,c['student.c'],'PUT',{index:0,chunk:'x'})).status,404);
  for(let index=0;index<parts;index++){const chunk=text.slice(index*size,(index+1)*size);assert.ok(Buffer.byteLength(JSON.stringify({index,chunk}))<1048576);assert.equal((await req('/api/uploads/'+id,cookie,'PUT',{index,chunk})).status,200);}
  const r=await req(path,cookie,method,{upload_id:id});assert.equal((await req(path,cookie,method,{upload_id:id})).status,400);return r;}
 const bytes=require('crypto').randomBytes(10*1024*1024),files=[{name:'10MB.bin',data:bytes.toString('base64')}];
 const post=await staged('/api/resources',c['teacher.a'],'POST',{title:'10MB 자료',content:'첨부',target_ids:['student.a'],files});assert.equal(post.status,201);
 const resource=(await req('/api/resources',c['student.a'])).data.posts[0],file=resource.files[0];assert.equal(file.size,bytes.length);
 const chunks=[];for(let offset=0;offset<bytes.length;offset+=1048576){const response=await proxy(new Request('https://interview-as.vercel.app/api/resources/files/'+file.id+'?offset='+offset,{headers:{Cookie:c['student.a']}}),(url,options)=>fetch(base+new URL(url).pathname+new URL(url).search,options));assert.equal(response.status,206);const chunk=Buffer.from(await response.arrayBuffer());assert.ok(chunk.length<=1048576);chunks.push(chunk);}assert.deepEqual(Buffer.concat(chunks),bytes);
 assert.equal((await req('/api/resources/files/'+file.id+'?offset=0',c['student.b'])).status,404);assert.equal((await req('/api/resources/files/'+file.id+'?offset=-1',c['student.a'])).status,416);
 const assignment=await staged('/api/submissions/assignments',c['teacher.a'],'POST',{title:'10MB 과제',class:'1반',content:'첨부',target_ids:['student.a'],files});assert.equal(assignment.status,201);
 const submission=await staged('/api/submissions',c['student.a'],'POST',{event:assignment.data.id,content:'제출',files});assert.equal(submission.status,201);
 assert.equal((await staged('/api/resources',c['teacher.a'],'POST',{title:'초과',content:'첨부',target_ids:null,files:[{name:'over',data:Buffer.alloc(10*1024*1024+1).toString('base64')}]})).status,413);
 const existing=(await req('/api/submissions',c['teacher.a'])).data.lessons.find(e=>e.id===assignment.data.id);assert.equal((await req('/api/submissions/assignments/'+assignment.data.id,c['teacher.a'],'PUT',{title:'과제',class:'1반',content:'첨부',target_ids:['student.a'],keep_files:existing.files.map(f=>f.id),files:[{name:'extra',data:'YQ=='}]})).status,413);
 const incomplete=(await req('/api/uploads',c['teacher.a'],'POST',{path:'/api/resources',method:'POST',parts:2})).data.id;assert.equal((await req('/api/resources',c['teacher.a'],'POST',{upload_id:incomplete})).status,400);assert.equal((await req('/api/uploads/'+incomplete,c['teacher.a'],'DELETE',{})).status,200);assert.equal(app.db.prepare('SELECT count(*) AS n FROM upload_batches').get().n,0);
 assert.equal((await req('/api/uploads',c['student.a'],'POST',{path:'/api/resources',method:'POST',parts:1})).status,400);
 console.log('PASS: 10MB post/assignment/submission, chunked gateway byte-exact download, limits, ownership, one-time use and cleanup');
}finally{if(app)await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
