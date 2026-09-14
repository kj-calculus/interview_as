// Shared validation and schedule projection for local SQLite and hosted D1.
export function validateApplications(rows) {
 const bad=message=>{throw Object.assign(new Error(message),{status:400});};
 if(!Array.isArray(rows)||rows.length!==6)bad('지원 정보는 6개 행으로 저장해주세요.');
 const normalized=rows.map((raw,i)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))bad(`${i+1}행을 확인해주세요.`);
  const r={};
  for(const key of ['univ','admission','major','interviewType','firstDate','interviewDate','finalDate','firstResult','finalResult']){
   const v=raw[key]??'';if(typeof v!=='string'||v.trim().length>100)bad(`${i+1}행 입력을 확인해주세요.`);r[key]=v.trim();
  }
  if(typeof raw.direct!=='boolean'&&raw.direct!==undefined)bad('면접 응시 방식을 확인해주세요.');r.direct=!!raw.direct;
  if(typeof raw.primary!=='boolean'&&raw.primary!==undefined)bad('주요 대학 선택을 확인해주세요.');r.primary=!!raw.primary;
  if(!r.univ){if(Object.values(r).some(Boolean))bad(`${i+1}행 대학명을 입력해주세요. 비우려면 행 비우기를 사용하세요.`);return r;}
  if(!r.admission||!r.major||!['생기부 기반','교과','제시문','인성'].includes(r.interviewType))bad(`${i+1}행의 전형, 학과, 면접유형을 입력해주세요.`);
  for(const k of ['firstResult','finalResult'])if(!['','합격','불합격'].includes(r[k]))bad('합격 여부를 확인해주세요.');
  if(r.direct){r.firstDate='';r.firstResult='';}
  for(const k of ['firstDate','interviewDate','finalDate'])if(r[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(r[k])||!Number.isFinite(Date.parse(r[k]))||new Date(r[k]).toISOString().slice(0,10)!==r[k]||r[k]<'2000-01-01'||r[k]>'2100-12-31'))bad(`${i+1}행 날짜를 확인해주세요.`);
  const dates=[r.firstDate,r.interviewDate,r.finalDate].filter(Boolean);if(dates.some((d,j)=>j&&d<dates[j-1]))bad(`${i+1}행 날짜는 1차 발표 → 면접 → 최종 발표 순서로 입력해주세요.`);
  if(r.firstResult==='불합격')r.finalResult='';
  return r;
 });
 if(normalized.some(r=>r.univ)&&normalized.filter(r=>r.primary).length!==1)bad('주요 대학을 반드시 하나 선택해주세요.');
 return normalized;
}
export function applicationEvents(applications,accounts) {
 return applications.flatMap(({student,rows})=>rows.flatMap((r,slot)=>!r.univ?[]:['first','interview','final'].flatMap(type=>{
  const date=r[type+'Date'];if(!date||type==='first'&&r.direct)return [];
  return [{id:`application-${student}-${slot}-${type}`,application:`${student}:${slot}`,slot,student,class:accounts.find(a=>a.id===student)?.class||'',type,date,time:'',univ:r.univ,major:r.major,admission:r.admission,interviewType:r.interviewType,result:type==='first'?r.firstResult:type==='final'?r.finalResult:'',direct:r.direct,inactive:type!=='first'&&r.firstResult==='불합격',title:'',task:''}];
 })));
}
