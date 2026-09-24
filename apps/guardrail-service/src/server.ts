import Fastify, { type FastifyRequest } from 'fastify';
import { ZodError, hotlModeSchema, type Actor } from '@hotl/schemas';
import { createEngine, GuardrailError, type GuardrailEngine, type Result } from './engine.js';
import { registerOperatingRoutes } from './operating-routes.js';
import { PostgresRuntimeStateStore, RuntimeStoreError } from './stores/postgres.js';
import { createIdentity, type IdentityOptions, type Principal } from './identity.js';
import { registerShopifyRoutes } from './shopify-routes.js';

export type ServerOptions = Omit<IdentityOptions,'mode'> & {engine?:GuardrailEngine;mode?:'simulation'|'live';logger?:boolean};
const readHeader=(request:FastifyRequest,name:string)=>{const value=request.headers[name];return typeof value==='string'?value:'';};

export async function createServer(options:ServerOptions={}) {
  const parsedMode=hotlModeSchema.safeParse(options.mode??process.env.HOTL_MODE??'simulation');
  if(!parsedMode.success)throw new GuardrailError('INVALID_MODE','HOTL_MODE must be simulation or live; refusing to start.',503);
  const mode=parsedMode.data;
  if(options.engine&&options.engine.mode!==mode)throw new GuardrailError('MODE_MISMATCH','HTTP authentication mode and engine execution mode must match.',503);
  const identity=createIdentity({...options,mode});
  const databaseUrl=options.engine?undefined:process.env.GUARDRAIL_DATABASE_URL;
  if(databaseUrl&&identity.workspaceId!==process.env.GUARDRAIL_WORKSPACE_ID)throw new GuardrailError('WORKSPACE_MISMATCH','Authentication and ledger workspace bindings must match.',503);
  const store=databaseUrl?new PostgresRuntimeStateStore({connectionString:databaseUrl,workspaceId:process.env.GUARDRAIL_WORKSPACE_ID??'',statementTimeoutMillis:30000}):undefined;
  let engine:GuardrailEngine;
  try {engine=options.engine??await createEngine({...(store?{store,initializeEmptyStore:process.env.GUARDRAIL_INITIALIZE_EMPTY_DATABASE==='true'}:{filePath:process.env.GUARDRAIL_STATE_PATH??'.data/guardrails.json',initializeEmptyFile:process.env.GUARDRAIL_INITIALIZE_EMPTY_FILE==='true'}),mode,seed:mode==='simulation',shopifyStagingShops:(process.env.SHOPIFY_STAGING_SHOPS??'').split(',').map(shop=>shop.trim()).filter(Boolean),killSwitchReader:async()=>{
    const response=await fetch(`${process.env.KILL_SWITCH_URL??'http://127.0.0.1:4200'}/state`,{headers:{Authorization:`Bearer ${process.env.KILL_SWITCH_READ_TOKEN??'hotl-demo-kill-read-token'}`},signal:AbortSignal.timeout(2500)});
    if(!response.ok)throw new Error('Emergency stop unavailable');return response.json() as Promise<{engaged:boolean}>;
  }});} catch(error) {await store?.close();throw error;}
  const app=Fastify({logger:options.logger?{serializers:{req:request=>({method:request.method,url:request.url?.split('?')[0]})},redact:['req.headers.authorization','req.headers.cookie','req.headers["x-hotl-internal-token"]','req.headers["x-shopify-hmac-sha256"]','res.headers["set-cookie"]']}:false,bodyLimit:128*1024});
  if(store)app.addHook('onClose',async()=>{await store.close();});
  const principals=new WeakMap<FastifyRequest,Principal>();
  async function authenticate(request:FastifyRequest):Promise<Principal> {
    const cached=principals.get(request);if(cached)return cached;
    const principal=await identity.authenticate(request.headers);
    principals.set(request,principal);return principal;
  }
  async function requireAccess(request:FastifyRequest,scope:string,ownerOnly=false) {
    const principal=await authenticate(request);
    if(ownerOnly&&principal.actor.type!=='owner')throw new GuardrailError('OWNER_REQUIRED','This operation requires an authenticated owner.',403);
    if(!principal.scopes.has('*')&&!principal.scopes.has(scope))throw new GuardrailError('SCOPE_REQUIRED',`The ${scope} scope is required.`,403);
    return principal.actor;
  }
  const key=(request:FastifyRequest)=>readHeader(request,'idempotency-key');
  app.setErrorHandler((error,_request,reply)=>{
    if(error instanceof ZodError)return reply.status(400).send({error:{code:'VALIDATION_ERROR',message:'Request validation failed.',details:{issues:error.issues}}});
    if(error instanceof GuardrailError)return reply.status(error.statusCode).send({error:{code:error.code,message:error.message,details:error.details}});
    if(error instanceof RuntimeStoreError)return reply.status(503).send({error:{code:error.code,message:error.message,details:{}}});
    const typed=error as Error&{statusCode?:number};
    if(typed.statusCode&&typed.statusCode>=400&&typed.statusCode<500)return reply.status(typed.statusCode).send({error:{code:'INVALID_REQUEST',message:typed.message,details:{}}});
    requestLog(error);return reply.status(500).send({error:{code:'INTERNAL_ERROR',message:'The operation could not be completed safely.',details:{}}});
  });
  const requestLog=(_error:unknown)=>app.log.error({code:'INTERNAL_ERROR'},'Guardrail operation failed; inspect durable operation state.');
  app.get('/health',async()=>({status:'ok',service:'guardrail-service',mode}));
  app.get('/api/identity',async request=>({actor:await requireAccess(request,'owner',true),mode}));
  app.get('/api/catalog',async()=>({products:(await engine.snapshot()).products.filter(item=>item.status==='active').map(({landedCost:_landedCost,estimatedCac:_estimatedCac,...product})=>product),mode}));
  const base='/api/guardrails/v1';
  for(const path of ['/api/agent-context',`${base}/agent-context`])app.get(path,async request=>{
    const actor=await requireAccess(request,'context');
    const state=await engine.snapshot();
    const owns=actor.type==='owner',sourcing=actor.id==='sourcing_agent',operations=actor.id==='order_agent',support=actor.id==='support_agent';
    const products=owns||sourcing||operations?state.products:state.products.filter(item=>item.status==='active').map(({landedCost:_landedCost,estimatedCac:_estimatedCac,...product})=>product);
    const orders=owns||support?state.orders:operations?state.orders.map(({customer:_customer,...order})=>order):[];
    const interrupts=owns?state.interrupts:support?state.interrupts.filter(item=>item.category==='refund_escrow'):[];
    return {mode,agentId:actor.id,config:state.config,constitution:state.constitution,products,orders,interrupts,campaigns:owns||actor.id==='marketing_agent'?state.campaigns:[],reservations:owns?state.reservations:state.reservations.filter(r=>r.agentId===actor.id),supplierOrders:owns||operations?state.supplierOrders:[]};
  });
  for(const path of ['/api/overview','/api/telemetry',`${base}/telemetry`])app.get(path,async request=>{await requireAccess(request,'owner',true);return engine.telemetry();});
  for(const path of ['/api/status',`${base}/status`])app.get(path,async request=>{await authenticate(request);const telemetry=await engine.telemetry();return {status:telemetry.status,paused:telemetry.paused,killSwitch:telemetry.killSwitch,mode};});
  for(const path of ['/api/products',`${base}/products`])app.get(path,async request=>{await requireAccess(request,'owner',true);return {products:(await engine.snapshot()).products};});
  for(const path of ['/api/orders',`${base}/orders`])app.get(path,async request=>{await requireAccess(request,'owner',true);return {orders:(await engine.snapshot()).orders};});
  for(const path of ['/api/agents',`${base}/agents`])app.get(path,async request=>{await requireAccess(request,'owner',true);return {agents:(await engine.telemetry()).agents};});
  for(const path of ['/api/runs',`${base}/runs`])app.get(path,async request=>{await requireAccess(request,'owner',true);return {runs:(await engine.snapshot()).runs??[]};});
  for(const path of ['/api/interrupts',`${base}/interrupts`])app.get(path,async request=>{await requireAccess(request,'owner',true);return {interrupts:(await engine.snapshot()).interrupts};});
  for(const path of ['/api/audit-log',`${base}/audit-log`])app.get(path,async request=>{await requireAccess(request,'owner',true);return {entries:(await engine.snapshot()).audit.slice().reverse(),integrity:'verified'};});
  app.get(`${base}/guardrails/config`,async request=>{await requireAccess(request,'owner',true);return {config:(await engine.snapshot()).config};});
  for(const path of ['/api/constitution',`${base}/constitution`])app.get(path,async request=>{await requireAccess(request,'owner',true);const state=await engine.snapshot();return {constitution:state.constitution,history:state.constitutionHistory,mode};});
  app.get('/api/operating-state',async request=>{await requireAccess(request,'owner',true);return engine.operatingState();});
  app.get('/api/campaigns',async request=>{await requireAccess(request,'owner',true);return {campaigns:(await engine.snapshot()).campaigns,mode};});
  const mutation=(path:string,scope:string,callback:(request:FastifyRequest,actor:Actor)=>Promise<Result>,owner=false)=>app.post(`${base}${path}`,async request=>callback(request,await requireAccess(request,scope,owner)));
  mutation('/spend/check','spend',(request,actor)=>engine.checkSpend(request.body,actor,key(request)));
  mutation('/spend/commit','spend',(request,actor)=>engine.commitSpend(request.body,actor,key(request)));
  app.post(`${base}/listing/margin-check`,async request=>{await requireAccess(request,'listing');return engine.checkMargin(request.body);});
  mutation('/listing/publish','listing',(request,actor)=>engine.publishListing(request.body,actor,key(request)));
  mutation('/campaigns/launch','campaign',(request,actor)=>engine.launchCampaign(request.body,actor,key(request)));
  mutation('/supplier-orders','supplier',(request,actor)=>engine.placeSupplierOrder(request.body,actor,key(request)));
  mutation('/refunds/evaluate','refund',(request,actor)=>engine.evaluateRefund(request.body,actor,key(request)));
  mutation('/interrupts/:id/resolve','owner',(request,actor)=>engine.resolveInterrupt((request.params as {id:string}).id,request.body,actor,key(request)),true);
  mutation('/pause/engage','owner',(request,actor)=>engine.setPause(true,request.body,actor,key(request)),true);
  mutation('/pause/release','owner',(request,actor)=>engine.setPause(false,request.body,actor,key(request)),true);
  app.patch(`${base}/guardrails/config`,async request=>engine.updateConfig(request.body,await requireAccess(request,'owner',true),key(request)));
  app.patch(`${base}/constitution`,async request=>engine.updateConstitution(request.body,await requireAccess(request,'owner',true),key(request)));
  mutation('/products/create','owner',(request,actor)=>engine.createProduct(request.body,actor,key(request)),true);
  mutation('/products/:id/update','owner',(request,actor)=>engine.updateProduct((request.params as {id:string}).id,request.body,actor,key(request)),true);
  mutation('/campaigns/:id/pause','owner',(request,actor)=>engine.pauseCampaign((request.params as {id:string}).id,request.body,actor,key(request)),true);
  mutation('/commerce/checkout','commerce',(request,actor)=>engine.checkout(request.body,actor,key(request)));
  mutation('/commerce/events','commerce',(request,actor)=>engine.commerceEvent(request.body,actor,key(request)));
  mutation('/runs/event','runs',(request,actor)=>engine.recordRunEvent(request.body,actor,key(request)));
  registerOperatingRoutes(app,engine,{owner:request=>requireAccess(request,'owner',true),key});
  registerShopifyRoutes(app,engine,{owner:request=>requireAccess(request,'owner',true),key,workspaceId:identity.workspaceId});
  return app;
}
