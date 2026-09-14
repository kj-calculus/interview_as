import {lessonVisible} from './school.mjs';
const submissionError=(status,message)=>Object.assign(new Error(message),{status});
export async function submissionRoute(request,u,db,bucket,readBody){
 const path=new URL(request.url).pathname,method=request.method,stmt=(sql,...args)=>db.prepare(sql).bind(...args),all=async(sql,...args)=>(await stmt(sql,...args).all()).results;
 const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 const lessons=(await all("SELECT *,content AS task,substr(created_at,1,10) AS date,author_name AS time FROM assignments ORDER BY created_at DESC")).filter(e=>lessonVisible(u,e));
 const students=(await all("SELECT id,name,number,class,role FROM users WHERE role='학생'")).filter(s=>u.role==='관리자'||u.role==='학생'&&s.id===u.id||u.role==='교사'&&(u.class||'').split(',').map(c=>c.trim()).includes(s.class));
 const permitted=s=>{const e=lessons.find(e=>e.id===s.event_id),student=students.find(a=>a.id===s.student);return e&&student&&lessonVisible(student,e);};
 if(path==='/api/submissions'&&method==='GET'){
  const seen=new Set(),submissions=(await all('SELECT * FROM assignment_submissions ORDER BY rowid DESC')).filter(s=>{if(!permitted(s))return false;const key=JSON.stringify([s.event_id,s.student]);if(seen.has(key))return false;seen.add(key);return true;});
  const files=await all('SELECT id,submission_id,name,size FROM submission_attachments'),assignmentFiles=await all('SELECT id,assignment_id,name,size FROM assignment_files');
  return json(200,{lessons:lessons.map(e=>({...e,files:assignmentFiles.filter(f=>f.assignment_id===e.id),target_ids:u.role==='학생'?'null':e.target_ids})),students,submissions:submissions.map(s=>({...s,files:files.filter(f=>f.submission_id===s.id)}))});
 }
 const assignmentFileMatch=path.match(/^\/api\/submissions\/assignment-files\/([a-f0-9-]+)$/);
 if(assignmentFileMatch&&method==='GET'){
  const f=await stmt('SELECT * FROM assignment_files WHERE id=?',assignmentFileMatch[1]).first();if(!f||!lessons.some(e=>e.id===f.assignment_id))throw submissionError(404,'과제 파일을 찾을 수 없습니다.');
  const object=await bucket?.get(f.id);if(!object)throw submissionError(503,'파일을 불러오지 못했습니다.');
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g,'%27')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 const match=path.match(/^\/api\/submissions\/files\/([a-f0-9-]+)$/);
 if(match&&method==='GET'){
  const f=await stmt('SELECT * FROM submission_attachments WHERE id=?',match[1]).first(),s=f?await stmt('SELECT * FROM assignment_submissions WHERE id=?',f.submission_id).first():null;
  if(!s||!permitted(s))throw submissionError(404,'제출 파일을 찾을 수 없습니다.');
  const object=await bucket?.get(f.id);if(!object)throw submissionError(503,'파일을 불러오지 못했습니다. 다시 시도해주세요.');
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g,'%27')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(['/api/submissions','/api/submissions/assignments'].includes(path)&&method==='POST'){
  const creating=path.endsWith('/assignments');
  if(creating?u.role==='학생':u.role!=='학생')throw submissionError(403,creating?'교사 또는 관리자만 과제를 등록할 수 있습니다.':'학생 본인만 과제를 제출할 수 있습니다.');
  const b=await readBody(request);if(b.student&&b.student!==u.id)throw submissionError(403,'본인 과제만 제출할 수 있습니다.');
  if(!creating&&!lessons.some(e=>e.id===b.event))throw submissionError(403,'제출 가능한 과제가 아닙니다.');
  if(typeof b.content!=='string'||b.content.length>20000)throw submissionError(400,'제출 글은 20,000자 이하로 입력해주세요.');
  if(!Array.isArray(b.files)||b.files.length>3)throw submissionError(400,'파일은 최대 3개입니다.');
  let total=0;const files=b.files.map(f=>{if(typeof f?.name!=='string'||!f.name.trim()||f.name.length>180||typeof f.data!=='string'||f.data.length>2800000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))throw submissionError(400,'첨부파일을 확인해주세요.');const bytes=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));total+=bytes.length;if(!bytes.length||total>2*1024*1024)throw submissionError(413,'파일은 합계 2MB 이하로 제출해주세요.');return {id:crypto.randomUUID(),name:f.name.trim().replace(/[\r\n\\/]/g,'_'),bytes};});
  let target_ids;if(creating){
   if(typeof b.title!=='string'||!b.title.trim()||b.title.length>120)throw submissionError(400,'과제명을 입력해주세요.');
   if(typeof b.class!=='string'||!students.some(s=>s.class===b.class))throw submissionError(403,'배정반 안에서 학생을 선택해주세요.');
   if(!Array.isArray(b.target_ids)||!b.target_ids.length||b.target_ids.length>500||b.target_ids.some(id=>!students.some(s=>s.id===id&&s.class===b.class)))throw submissionError(400,'대상 학생을 한 명 이상 선택해주세요.');target_ids=JSON.stringify([...new Set(b.target_ids)]);
  }
  const content=b.content.trim();if(!content&&!files.length)throw submissionError(400,'제출 글 또는 파일을 입력해주세요.');if(files.length&&!bucket)throw submissionError(503,'파일 저장소에 연결하지 못했습니다.');
  const id=crypto.randomUUID(),uploaded=[];
  try{for(const f of files){await bucket.put(f.id,f.bytes);uploaded.push(f.id);}await db.batch(creating?[stmt('INSERT INTO assignments(id,title,content,class,target_ids,author_id,author_name,created_at) VALUES(?,?,?,?,?,?,?,?)',id,b.title.trim(),content,b.class,target_ids,u.id,u.name,new Date().toISOString()),...files.map(f=>stmt('INSERT INTO assignment_files(id,assignment_id,name,size) VALUES(?,?,?,?)',f.id,id,f.name,f.bytes.length))]:[stmt('INSERT INTO assignment_submissions(id,event_id,student,content,created_at) VALUES(?,?,?,?,?)',id,b.event,u.id,content,new Date().toISOString()),...files.map(f=>stmt('INSERT INTO submission_attachments(id,submission_id,name,size) VALUES(?,?,?,?)',f.id,id,f.name,f.bytes.length))]);}catch(e){for(const id of uploaded)try{await bucket.delete(id);}catch{}throw e;}
  return json(201,{id});
 }
 throw submissionError(404,'요청한 과제를 찾을 수 없습니다.');
}
