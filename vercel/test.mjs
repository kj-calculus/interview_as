import assert from 'node:assert/strict';
import {handle} from '../api/proxy.mjs';
const headers={'Content-Type':'application/json','X-Interview-Request':'1',Origin:'https://interview-as.vercel.app',Cookie:'unrelated=private; interview_session=abc'};
const req=(path='login',extra={})=>new Request(`https://interview-as.vercel.app/api/proxy?path=${path}`,{method:'POST',headers,body:'{}',...extra});
let called=0;
const send=async(url,options)=>{called++;assert.equal(url,'https://interview-on-school.tkagmd1.chatgpt.site/api/login');assert.equal(options.headers.get('cookie'),'interview_session=abc');assert.equal(options.headers.get('origin'),null);assert.equal(new TextDecoder().decode(options.body),'{}');return Response.json({ok:true},{headers:{'Set-Cookie':'interview_session=new; HttpOnly; SameSite=Strict; Secure; Path=/'}});};
const r=await handle(req(),send);assert.equal(r.status,200);assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));assert.equal(r.headers.get('cache-control'),'no-store');
assert.equal((await handle(req('https://evil.example'),send)).status,404);
assert.equal((await handle(req('login',{headers:{...headers,Origin:'https://evil.example'}}),send)).status,403);
assert.equal((await handle(req('login',{headers:{...headers,'X-Interview-Request':'0'}}),send)).status,415);
assert.equal(called,1);
assert.equal((await handle(req(),async()=>new Response('Redirect',{status:302}))).status,502);
assert.equal((await handle(req(),async()=>{throw Error('offline')})).status,502);
assert.equal((await handle(req('state',{method:'GET',body:undefined}),async()=>Response.json({error:'로그인이 필요합니다.'},{status:401}))).status,401);
console.log('PASS: Vercel gateway routing, session cookie, cross-origin rejection, and upstream failures');

assert.equal((await handle(req('applications',{method:'PUT'}),async(url)=>{assert.ok(url.endsWith('/api/applications'));return Response.json({ok:true});})).status,200);

const binary=await handle(req('resources/files/abcdef',{method:'GET',body:undefined}),async()=>new Response(new Uint8Array([0,255,10]),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="test.bin"'}}));assert.equal(binary.status,200);assert.deepEqual(new Uint8Array(await binary.arrayBuffer()),new Uint8Array([0,255,10]));assert.match(binary.headers.get('content-disposition'),/attachment/);

assert.equal((await handle(req('availability',{method:'PUT'}),async url=>{assert.ok(url.endsWith('/api/availability'));return Response.json({ok:true});})).status,200);

assert.equal((await handle(req('results'),async url=>{assert.ok(url.endsWith('/api/results'));return Response.json({ok:true});})).status,200);
