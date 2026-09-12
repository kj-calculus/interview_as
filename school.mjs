export function lessonVisible(u,e){
 if(u.role==='관리자')return true;
 if(!(u.class||'').split(',').map(s=>s.trim()).includes(e.class))return false;
 const ids=JSON.parse(e.target_ids||'null');return u.role!=='학생'||ids===null||ids.includes(u.id);
}
export function lessonFields(u,b,students,old){
 const bad=message=>{throw Object.assign(new Error(message),{status:400});};
 const kind=b.lesson_kind??old?.lesson_kind??'';
 if(kind&&!['1차-OT','2차-개별지도','3차-모의면접'].includes(kind))bad('수업 종류를 선택해주세요.');
 const teacher_name=old?.teacher_name||u.name;
 let ids=b.target_ids===undefined?JSON.parse(old?.target_ids||'null'):b.target_ids;
 if(ids!==null){if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!students.some(s=>s.role==='학생'&&s.id===id&&s.class===b.class)))bad('해당 반의 학생을 한 명 이상 선택해주세요.');ids=[...new Set(ids)];}
 return {lesson_kind:kind,teacher_name,teacher_id:old?old.teacher_id||'':u.id,target_ids:JSON.stringify(ids),...(kind?{title:kind==='2차-개별지도'?`${teacher_name} ${kind}`:kind}:{})};
}
export function decorateEvents(events,users){
 return events.map(e=>{
  if(e.type==='lesson'){
   const matching=users.filter(u=>u.role!=='학생'&&u.name===e.teacher_name&&(u.role==='관리자'||(u.class||'').split(',').map(c=>c.trim()).includes(e.class)));
   return {...e,teacher_id:e.teacher_id||(matching.length===1?matching[0].id:'')};
  }
  const rejected=events.some(first=>first.type==='first'&&first.result==='불합격'&&first.student===e.student&&first.univ===e.univ&&first.major===e.major);
  return {...e,inactive:e.type!=='first'&&rejected};
 });
}
export function validateAvailability(b){
 const days=b.days,note=b.note??'';
 if(!Array.isArray(days)||days.length>5||days.some(d=>!Number.isInteger(d)||d<1||d>5)||typeof note!=='string'||note.length>2000)throw Object.assign(new Error('불가 요일과 비고(최대 2,000자)를 확인해주세요.'),{status:400});
 return {days:[...new Set(days)].sort(),note:note.trim()};
}
