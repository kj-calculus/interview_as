const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function createApp({dataDir}){
 fs.mkdirSync(dataDir,{recursive:true});const db=new DatabaseSync(path.join(dataDir,'interview.sqlite'));db.exec('PRAGMA foreign_keys=ON');
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get())for(const file of fs.readdirSync(path.join(__dirname,'../drizzle')).filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join(__dirname,'../drizzle',file),'utf8'));
 function prepared(sql,args=[]){return {bind(...next){return prepared(sql,next);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};},sql,args};}
 const DB={prepare:prepared,async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 let worker,env;const ready=(async()=>{worker=await import('./worker.mjs');env={DB,FILES:require('../local-storage.cjs').adapters(db,dataDir).FILES,ADMIN_INITIAL_HASH:await worker.passwordHash('admin123')};})();
 const server=http.createServer(async(req,res)=>{await ready;const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});const result=await worker.handle(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));});
 return {server,db,ready,close:()=>new Promise(r=>{server.close(()=>{db.close();r();});server.closeIdleConnections();})};
}
module.exports={createApp};
