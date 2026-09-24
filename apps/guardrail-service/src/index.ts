import { createServer } from './server.js';
const server=await createServer({logger:true});
try {await server.listen({host:'127.0.0.1',port:Number(process.env.GUARDRAIL_PORT??4100)});}
catch(error) {server.log.error(error);process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void server.close();});
