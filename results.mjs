const resultError=(status,message)=>Object.assign(new Error(message),{status});
export async function saveApplicationRows(db,student,rows,expectedRows){
 const old=await db.prepare('SELECT rows FROM applications WHERE student=?').bind(student).first();
 if(expectedRows!==undefined&&JSON.stringify(old?JSON.parse(old.rows):null)!==JSON.stringify(expectedRows))throw resultError(409,'다른 화면에서 지원 정보가 변경되었습니다. 새로고침 후 확인해주세요.');
 const result=old?await db.prepare('UPDATE applications SET rows=? WHERE student=? AND rows=?').bind(JSON.stringify(rows),student,old.rows).run():await db.prepare('INSERT OR IGNORE INTO applications(student,rows) VALUES(?,?)').bind(student,JSON.stringify(rows)).run();
 if(result.meta.changes!==1)throw resultError(409,'지원 정보가 변경되었습니다. 새로고침 후 확인해주세요.');
}
export async function saveAdmissionResult(db,u,b){
 if(!['first','final'].includes(b.phase)||!['','합격','불합격'].includes(b.result))throw resultError(400,'발표 종류와 합격 여부를 확인해주세요.');
 const s=typeof b.student==='string'?await db.prepare('SELECT * FROM users WHERE id=?').bind(b.student).first():null;
 if(!s||s.role!=='학생'||!(u.role==='관리자'||u.role==='학생'&&u.id===s.id||u.role==='교사'&&(u.class||'').split(',').map(c=>c.trim()).includes(s.class)))throw resultError(403,'해당 학생의 합격 여부를 수정할 수 없습니다.');
 if(b.eventId){
  const e=await db.prepare('SELECT * FROM events WHERE id=?').bind(b.eventId).first();
  if(!e||e.student!==s.id||e.type!==b.phase)throw resultError(404,'발표 일정을 찾을 수 없습니다.');
  if(e.result!==b.expectedResult)throw resultError(409,'결과가 변경되었습니다. 새로고침 후 확인해주세요.');
  if(e.type==='final'){const first=await db.prepare("SELECT id FROM events WHERE student=? AND univ=? AND major=? AND type='first' AND result='불합격'").bind(s.id,e.univ,e.major).first();if(first)throw resultError(400,'1차 불합격 상태에서는 최종 결과를 입력할 수 없습니다.');}
  const result=await db.prepare('UPDATE events SET result=? WHERE id=? AND result=?').bind(b.result,e.id,e.result).run();if(result.meta.changes!==1)throw resultError(409,'결과가 변경되었습니다. 새로고침 후 확인해주세요.');
  return;
 }
 if(!Number.isInteger(b.slot)||b.slot<0||b.slot>5)throw resultError(400,'지원 정보를 확인해주세요.');
 const old=await db.prepare('SELECT rows FROM applications WHERE student=?').bind(s.id).first();
 const rows=old?JSON.parse(old.rows):[],r=rows[b.slot];
 if(!r?.univ||!r[b.phase+'Date']||b.phase==='first'&&r.direct)throw resultError(404,'발표 일정을 찾을 수 없습니다.');
 if(JSON.stringify(r)!==JSON.stringify(b.expectedRow))throw resultError(409,'지원 정보가 변경되었습니다. 새로고침 후 확인해주세요.');
 if(b.phase==='final'&&r.firstResult==='불합격')throw resultError(400,'1차 불합격 상태에서는 최종 결과를 입력할 수 없습니다.');
 r[b.phase+'Result']=b.result;if(b.phase==='first'&&b.result==='불합격')r.finalResult='';
 const result=await db.prepare('UPDATE applications SET rows=? WHERE student=? AND rows=?').bind(JSON.stringify(rows),s.id,old.rows).run();
 if(result.meta.changes!==1)throw resultError(409,'지원 정보가 변경되었습니다. 새로고침 후 확인해주세요.');
}
