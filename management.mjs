import {lessonVisible,decorateEvents} from './school.mjs';
const managementError=(status,message)=>Object.assign(new Error(message),{status});
const managementText=(v,max,required=true)=>{if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw managementError(400,'입력 내용을 확인해주세요.');return v.trim();};
export async function managementState(db,u){
 const important=(await db.prepare('SELECT * FROM important_events ORDER BY date,title').all()).results.map(e=>({...e,type:'important',time:'',student:null,class:'',univ:'',major:'',task:e.description}));
 if(u.role==='학생')return {important,progress:[]};
 const rows=(await db.prepare('SELECT lesson_progress.*,events.class,events.target_ids FROM lesson_progress JOIN events ON events.id=lesson_progress.event_id JOIN users ON users.id=lesson_progress.student WHERE users.class=events.class').all()).results;
 const progress=rows.filter(r=>lessonVisible(u,r)&&(JSON.parse(r.target_ids)===null||JSON.parse(r.target_ids).includes(r.student))).map(({class:cls,target_ids,...r})=>r);
 return {important,progress};
}
export async function managementRoute(request,u,db,readBody){
 const path=new URL(request.url).pathname,method=request.method;if(!path.startsWith('/api/important-events')&&path!=='/api/lesson-progress')return null;
 if(u.role==='학생')throw managementError(403,'교사 또는 관리자만 사용할 수 있습니다.');
 const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}}),stmt=(sql,...args)=>db.prepare(sql).bind(...args);
 if(path==='/api/lesson-progress'&&method==='PUT'){
  const b=await readBody(request);if(typeof b.completed!=='boolean')throw managementError(400,'완료 여부를 확인해주세요.');
  const event=await stmt('SELECT * FROM events WHERE id=?',managementText(b.event,100)).first(),student=await stmt('SELECT * FROM users WHERE id=?',managementText(b.student,40)).first();
  if(!event||event.type!=='lesson'||!student||student.role!=='학생'||student.class!==event.class||!lessonVisible(u,event)||!lessonVisible(student,event))throw managementError(403,'이 학생의 수업 진도를 변경할 수 없습니다.');
  const id=event.id+':'+student.id;
  if(b.completed)await stmt('INSERT INTO lesson_progress(id,event_id,student,completed_at,marked_by) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET completed_at=excluded.completed_at,marked_by=excluded.marked_by',id,event.id,student.id,new Date().toISOString(),u.id).run();else await stmt('DELETE FROM lesson_progress WHERE id=?',id).run();
  return json(200,{ok:true});
 }
 const match=path.match(/^\/api\/important-events\/([a-f0-9-]+)$/);
 if(path==='/api/important-events'&&method==='POST'||match&&['PUT','DELETE'].includes(method)){
  const b=await readBody(request),old=match?await stmt('SELECT * FROM important_events WHERE id=?',match[1]).first():null;
  if(match&&!old)throw managementError(404,'중요 일정을 찾을 수 없습니다.');
  if(old&&u.role!=='관리자'&&old.author_id!==u.id)throw managementError(403,'등록한 교사 또는 관리자만 수정·삭제할 수 있습니다.');
  if(method==='DELETE'){await stmt('DELETE FROM important_events WHERE id=?',old.id).run();return json(200,{ok:true});}
  const title=managementText(b.title,100),date=managementText(b.date,10),description=managementText(b.description??'',2000,false);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<'2000-01-01'||date>'2100-12-31')throw managementError(400,'날짜를 확인해주세요.');
  const id=old?.id||crypto.randomUUID();if(old)await stmt('UPDATE important_events SET title=?,date=?,description=? WHERE id=?',title,date,description,id).run();else await stmt('INSERT INTO important_events(id,title,date,description,author_id) VALUES(?,?,?,?,?)',id,title,date,description,u.id).run();return json(old?200:201,{id});
 }
 throw managementError(404,'요청한 기능을 찾을 수 없습니다.');
}
export async function deleteAccountData(db,u,id){
 if(u.role!=='관리자')throw managementError(403,'관리자만 계정을 삭제할 수 있습니다.');
 const target=await db.prepare('SELECT * FROM users WHERE id=?').bind(managementText(id,40)).first();if(!target)throw managementError(404,'계정을 찾을 수 없습니다.');if(target.role==='관리자')throw managementError(403,'관리자 계정은 삭제할 수 없습니다.');
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args),batch=[];
 if(target.role==='교사'){
  const users=(await db.prepare('SELECT * FROM users').all()).results,events=(await db.prepare('SELECT * FROM events').all()).results;
  for(const e of decorateEvents(events,users).filter(e=>e.teacher_id===target.id))batch.push(stmt('DELETE FROM events WHERE id=?',e.id));
  batch.push(stmt('DELETE FROM events WHERE teacher_id=?',target.id));
 }
 if(target.role==='학생'){
  batch.push(stmt("DELETE FROM events WHERE type='lesson' AND target_ids<>'null' AND json_array_length(target_ids)=1 AND EXISTS(SELECT 1 FROM json_each(events.target_ids) WHERE value=?)",target.id));
  batch.push(stmt("UPDATE events SET target_ids=(SELECT json_group_array(value) FROM json_each(events.target_ids) WHERE value<>?) WHERE type='lesson' AND target_ids<>'null' AND EXISTS(SELECT 1 FROM json_each(events.target_ids) WHERE value=?)",target.id,target.id));
  batch.push(stmt("UPDATE resource_posts SET target_ids=(SELECT json_group_array(value) FROM json_each(resource_posts.target_ids) WHERE value<>?) WHERE target_ids<>'null' AND EXISTS(SELECT 1 FROM json_each(resource_posts.target_ids) WHERE value=?)",target.id,target.id));
 }
 batch.push(stmt('DELETE FROM events WHERE student=?',target.id),stmt('DELETE FROM important_events WHERE author_id=?',target.id),stmt('DELETE FROM sessions WHERE user_id=?',target.id),stmt('DELETE FROM users WHERE id=?',target.id));
 await db.batch(batch);
}
