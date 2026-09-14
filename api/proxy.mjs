// Vercel serves the UI and API gateway; the existing authenticated service keeps its D1 data.
const backend='https://interview-on-school.tkagmd1.chatgpt.site';
const allowed=/^(?:login|logout|me|password|state|important-events(?:\/[a-f0-9-]+)?|lesson-progress|applications|results|availability|resources(?:\/(?:files\/)?[a-f0-9-]+)?|accounts(?:\/(?:validate|reset-password|classes|delete))?|events(?:\/[a-zA-Z0-9-]+)?)$/;
export async function handle(request,send=fetch){
 const url=new URL(request.url);
 const path=url.searchParams.get('path')||url.pathname.replace(/^\/api\//,'');
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const error=(status,message)=>Response.json({error:message},{status,headers});
 if(!allowed.test(path))return error(404,'요청한 기능을 찾을 수 없습니다.');
 if(!['GET','POST','PUT','DELETE'].includes(request.method))return error(405,'허용되지 않은 요청입니다.');
 if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return error(403,'허용되지 않은 요청 출처입니다.');
 if(request.headers.get('sec-fetch-site')==='cross-site')return error(403,'허용되지 않은 요청입니다.');
 const outgoing=new Headers();
 const session=(request.headers.get('cookie')||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('interview_session='));
 if(session)outgoing.set('cookie',session);
 let body;
 if(request.method!=='GET'){
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||request.headers.get('x-interview-request')!=='1')return error(415,'올바른 요청 형식이 아닙니다.');
  outgoing.set('content-type','application/json');outgoing.set('x-interview-request','1');
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>(path.startsWith('resources')?3*1048576:1048576)){await reader.cancel();return error(413,'요청이 너무 큽니다.');}chunks.push(chunk.value);}
  body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
 }
 try{
  const response=await send(`${backend}/api/${path}`,{method:request.method,headers:outgoing,body,redirect:'manual',signal:AbortSignal.timeout(55000)});
  if(request.method==='GET'&&/^resources\/files\/[a-f0-9-]+$/.test(path)&&response.ok){return new Response(response.body,{status:200,headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':response.headers.get('content-disposition')||'attachment','Content-Security-Policy':"default-src 'none'; sandbox"}});}
  if(!response.headers.get('content-type')?.includes('application/json'))return error(502,'저장 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');
  const resultHeaders=new Headers({...headers,'Content-Type':'application/json; charset=utf-8'});
  for(const value of response.headers.getSetCookie())if(value.startsWith('interview_session='))resultHeaders.append('Set-Cookie',value);
  return new Response(response.body,{status:response.status,headers:resultHeaders});
 }catch{return error(502,'저장 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');}
}
export default {fetch:request=>handle(request)};
