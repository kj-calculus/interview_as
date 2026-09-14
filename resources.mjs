import {fileDownload,decodeAttachment} from './transfers.mjs';
const resourceError=(status,message)=>Object.assign(new Error(message),{status});
const resourceText=(v,max,required=true)=>{if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw resourceError(400,'제목과 내용을 확인해주세요.');return v.trim();};
export async function resourceRoute(request,u,db,bucket,readBody){
 const route=new URL(request.url).pathname,method=request.method;
 if(!route.startsWith('/api/resources'))return null;
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args),first=(sql,...args)=>stmt(sql,...args).first(),all=async(sql,...args)=>(await stmt(sql,...args).all()).results;
 const classes=(u.class||'').split(',').map(c=>c.trim());
 const students=await all("SELECT id,class FROM users WHERE role='학생'");
 const visible=p=>{if(!p)return false;const ids=JSON.parse(p.target_ids||'null');return ids===null||u.role==='관리자'||(u.role==='학생'?ids.includes(u.id):p.author_id===u.id||students.some(s=>ids.includes(s.id)&&classes.includes(s.class)));};
 const targets=b=>{const ids=b.target_ids??null;if(ids===null)return 'null';if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>!students.some(s=>s.id===id&&(u.role==='관리자'||classes.includes(s.class)))))throw resourceError(400,'공개할 학생을 배정반 안에서 선택해주세요.');return JSON.stringify([...new Set(ids)]);};
 if(u.role==='학생'&&method!=='GET')throw resourceError(403,'학생은 자료 열람과 다운로드만 가능합니다.');
 const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(route==='/api/resources'&&method==='GET'){
  const posts=(await all('SELECT * FROM resource_posts ORDER BY created_at DESC')).filter(visible).slice(0,200);
  const files=await all('SELECT id,post_id,name,size FROM resource_files');
  return json(200,{posts:posts.map(p=>({...p,target_ids:u.role==='학생'?undefined:p.target_ids,files:files.filter(f=>f.post_id===p.id),editable:u.role!=='학생'&&(p.author_id===u.id||u.role==='관리자')}))});
 }
 const fileMatch=route.match(/^\/api\/resources\/files\/([a-f0-9-]+)$/);
 if(fileMatch&&method==='GET'){
  const f=await first('SELECT * FROM resource_files WHERE id=?',fileMatch[1]);if(!f||!visible(await first('SELECT * FROM resource_posts WHERE id=?',f.post_id)))throw resourceError(404,'첨부파일을 찾을 수 없습니다.');
  return await fileDownload(request,bucket,f);
 }
 if(route==='/api/resources'&&method==='POST'){
  const b=await readBody(request),title=resourceText(b.title,120),content=resourceText(b.content??'',20000,false),files=b.files??[],target_ids=targets(b);
  if(!Array.isArray(files)||files.length>3)throw resourceError(400,'첨부파일은 최대 3개입니다.');
  let total=0;const attachments=files.map(f=>{const name=resourceText(f?.name,180).replace(/[\r\n\\/]/g,'_');if(typeof f.data!=='string'||f.data.length>14000000||(f.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)))throw resourceError(400,'첨부파일을 확인해주세요.');const bytes=decodeAttachment(f.data);total+=bytes.length;if(!bytes.length||total>10*1024*1024)throw resourceError(413,'첨부파일은 합계 10MB 이하로 올려주세요.');return {id:crypto.randomUUID(),name,bytes};});
  if(!content&&!attachments.length)throw resourceError(400,'내용 또는 첨부파일을 입력해주세요.');
  if(attachments.length&&!bucket)throw resourceError(503,'파일 저장소를 준비 중입니다. 잠시 후 다시 시도해주세요.');
  const id=crypto.randomUUID(),uploaded=[];
  try{for(const f of attachments){await bucket.put(f.id,f.bytes);uploaded.push(f.id);}await db.batch([stmt('INSERT INTO resource_posts(id,author_id,author_name,title,content,created_at,target_ids) VALUES(?,?,?,?,?,?,?)',id,u.id,u.name,title,content,new Date().toISOString(),target_ids),...attachments.map(f=>stmt('INSERT INTO resource_files(id,post_id,name,size) VALUES(?,?,?,?)',f.id,id,f.name,f.bytes.length))]);}
  catch(e){for(const key of uploaded)try{await bucket.delete(key);}catch{}throw e;}
  return json(201,{id});
 }
 const match=route.match(/^\/api\/resources\/([a-f0-9-]+)$/);
 if(match&&['PUT','DELETE'].includes(method)){
  const b=await readBody(request),p=await first('SELECT * FROM resource_posts WHERE id=?',match[1]);if(!p)throw resourceError(404,'게시글을 찾을 수 없습니다.');if(p.author_id!==u.id&&u.role!=='관리자')throw resourceError(403,'작성자 또는 관리자만 수정·삭제할 수 있습니다.');
  if(method==='PUT'){const title=resourceText(b.title,120),content=resourceText(b.content??'',20000,false);if(!content&&!(await first('SELECT id FROM resource_files WHERE post_id=?',p.id)))throw resourceError(400,'내용을 입력해주세요.');await stmt('UPDATE resource_posts SET title=?,content=?,target_ids=? WHERE id=?',title,content,b.target_ids===undefined?p.target_ids:targets(b),p.id).run();}
  else {const files=await all('SELECT id FROM resource_files WHERE post_id=?',p.id);if(files.length&&!bucket)throw resourceError(503,'파일 저장소에 연결하지 못했습니다.');for(const f of files)await bucket.delete(f.id);await stmt('DELETE FROM resource_posts WHERE id=?',p.id).run();}
  return json(200,{ok:true});
 }
 throw resourceError(404,'요청한 자료를 찾을 수 없습니다.');
}
