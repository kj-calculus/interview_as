import fs from 'node:fs';
const names=['index.html','app.js','style.css','exceljs.min.js','exceljs.LICENSE'];
const assets={};for(const name of names)assets['/'+name]={content:fs.readFileSync('dist/'+name,'utf8'),type:name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8'};
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/server/index.js',['applications.mjs','school.mjs','resources.mjs'].map(p=>fs.readFileSync(p,'utf8')).join('\n')+'\n'+fs.readFileSync('cloud/worker.mjs','utf8').replace(/^import .* from '\.\.\/.*';\r?\n/gm,'')+'\nconst assets='+JSON.stringify(assets)+';\nexport default {fetch(request,env){return handle(request,env,assets);}};\n');
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built Cloudflare Worker with bundled application assets.');
