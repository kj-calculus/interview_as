export function decodeAttachment(data){const binary=atob(data),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
const transferError=(status,message)=>Object.assign(new Error(message),{status});
const transferKey=(id,index)=>id+'-'+index;
async function removeTransfer(db,bucket,row){await db.prepare('DELETE FROM upload_batches WHERE id=?').bind(row.id).run();for(let i=0;i<row.parts;i++)try{await bucket.delete(transferKey(row.id,i));}catch{}}
export async function uploadRoute(request,u,db,bucket,readBody){
 if(!bucket)throw transferError(503,'파일 저장소에 연결하지 못했습니다.');
 const path=new URL(request.url).pathname,b=await readBody(request),json=(s,d)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
 if(path==='/api/uploads'&&request.method==='POST'){
  const allowed=u.role==='학생'?b.path==='/api/submissions'&&b.method==='POST':b.path==='/api/resources'&&b.method==='POST'||b.path==='/api/submissions/assignments'&&b.method==='POST'||/^\/api\/submissions\/assignments\/[a-f0-9-]+$/.test(b.path)&&b.method==='PUT';
  if(!allowed||!Number.isInteger(b.parts)||b.parts<1||b.parts>32)throw transferError(400,'업로드 요청을 확인해주세요.');
  const expired=(await db.prepare('SELECT * FROM upload_batches WHERE expires<? LIMIT 6').bind(Date.now()).all()).results;for(const row of expired)await removeTransfer(db,bucket,row);
  const rows=(await db.prepare('SELECT * FROM upload_batches WHERE owner=?').bind(u.id).all()).results;
  for(const row of rows.filter(r=>r.expires<Date.now()))await removeTransfer(db,bucket,row);
  if(rows.filter(r=>r.expires>=Date.now()).length>=3)throw transferError(429,'진행 중인 업로드를 마치거나 잠시 후 다시 시도해주세요.');
  const id=crypto.randomUUID();await db.prepare('INSERT INTO upload_batches(id,owner,path,method,parts,received,expires) VALUES(?,?,?,?,?,0,?)').bind(id,u.id,b.path,b.method,b.parts,Date.now()+30*60*1000).run();return json(201,{id});
 }
 const match=path.match(/^\/api\/uploads\/([a-f0-9-]+)$/),row=match?await db.prepare('SELECT * FROM upload_batches WHERE id=? AND owner=?').bind(match[1],u.id).first():null;
 if(!row)throw transferError(404,'업로드를 찾을 수 없습니다.');
 if(request.method==='DELETE'){await removeTransfer(db,bucket,row);return json(200,{ok:true});}
 if(request.method!=='PUT'||row.expires<Date.now()||!Number.isInteger(b.index)||b.index!==row.received||b.index>=row.parts||typeof b.chunk!=='string'||!b.chunk.length||new TextEncoder().encode(b.chunk).length>600000)throw transferError(400,'파일 조각을 다시 전송해주세요.');
 await bucket.put(transferKey(row.id,b.index),new TextEncoder().encode(b.chunk));const r=await db.prepare('UPDATE upload_batches SET received=received+1 WHERE id=? AND received=?').bind(row.id,b.index).run();if(r.meta.changes!==1)throw transferError(409,'업로드가 변경되었습니다. 다시 시도해주세요.');return json(200,{ok:true});
}
export async function resolveUpload(body,u,db,bucket,path,method){
 if(!body.upload_id)return body;
 const row=await db.prepare('SELECT * FROM upload_batches WHERE id=? AND owner=?').bind(body.upload_id,u.id).first();
 if(!row||row.path!==path||row.method!==method||row.expires<Date.now()||row.parts!==row.received)throw transferError(400,'완료된 업로드를 찾을 수 없습니다. 다시 첨부해주세요.');
 let text='';for(let i=0;i<row.parts;i++){const part=await bucket.get(transferKey(row.id,i));if(!part)throw transferError(400,'업로드가 불완전합니다. 다시 첨부해주세요.');text+=await new Response(part.body).text();if(text.length>16*1024*1024)throw transferError(413,'첨부 용량을 초과했습니다.');}
 const result=await db.prepare('DELETE FROM upload_batches WHERE id=? AND owner=?').bind(row.id,u.id).run();if(result.meta.changes!==1)throw transferError(409,'이미 처리한 업로드입니다.');for(let i=0;i<row.parts;i++)try{await bucket.delete(transferKey(row.id,i));}catch{}
 try{const parsed=JSON.parse(text);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||parsed.upload_id)throw Error();return parsed;}catch{throw transferError(400,'업로드 내용을 확인해주세요.');}
}
export async function fileDownload(request,bucket,file){
 const raw=new URL(request.url).searchParams.get('offset'),offset=raw===null?null:Number(raw);
 if(offset!==null&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(offset)||offset<0||offset>=file.size))throw transferError(416,'다운로드 범위를 확인해주세요.');
 const length=offset===null?file.size:Math.min(1024*1024,file.size-offset),object=await bucket?.get(file.id,offset===null?undefined:{range:{offset,length}});if(!object)throw transferError(503,'파일을 불러오지 못했습니다. 다시 시도해주세요.');
 return new Response(object.body,{status:offset===null?200:206,headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g,'%27')}`,'Content-Length':String(length),...(offset===null?{}:{'Content-Range':`bytes ${offset}-${offset+length-1}/${file.size}`}), 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
