const fs=require('node:fs'),path=require('node:path');
function adapters(db,dataDir){
 function prepare(sql,args=[]){return {bind(...values){return prepare(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};},sql,args};}
 const DB={prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const dir=path.join(dataDir,'files');fs.mkdirSync(dir,{recursive:true});const file=id=>{if(!/^[a-f0-9-]+$/.test(id))throw Error('Invalid file ID');return path.join(dir,id);};
 const FILES={async put(id,bytes){await fs.promises.writeFile(file(id),bytes);},async get(id){try{return {body:await fs.promises.readFile(file(id))};}catch(e){if(e.code==='ENOENT')return null;throw e;}},async delete(id){await fs.promises.rm(file(id),{force:true});}};
 return {DB,FILES};
}
module.exports={adapters};
