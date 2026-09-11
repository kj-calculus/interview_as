import fs from 'node:fs';
fs.mkdirSync('vercel-public',{recursive:true});
for(const name of ['index.html','app.js','style.css','exceljs.min.js','exceljs.LICENSE'])fs.copyFileSync('dist/'+name,'vercel-public/'+name);
console.log('Vercel public assets ready. Existing accounts and schedules remain in the online database.');
