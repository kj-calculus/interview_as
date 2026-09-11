const app=require('./backend.cjs').createApp();
app.ready.then(()=>app.server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log(`http://127.0.0.1:${Number(process.env.PORT)||4173}`))).catch(e=>{console.error(e.message);process.exitCode=1;});
