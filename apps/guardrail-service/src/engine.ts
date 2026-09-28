import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { hotlModeSchema, campaignSchema, checkoutSchema, commerceEventSchema, configPatchSchema, fromMinor, listingSchema, marginCheckSchema, pauseSchema, refundSchema, resolveSchema, runEventSchema, spendCheckSchema, spendCommitSchema, supplierOrderSchema, toMinor, type Actor, type AuditEntry, type CommerceOrder } from '@hotl/schemas';
import { seedState } from './seed.js';
import { addConstitution } from './constitution.js';
import { autonomyDomains, constitutionSchema, constitutionPatchSchema, pilotApprovalRequestSchema, pilotEconomicsCalculationIssues, productCreateSchema, productUpdateSchema, campaignPauseSchema, type AutonomyDomain, type BusinessConstitution, type OwnerInterrupt } from '@hotl/schemas';
import type { EngineState, KillState } from './types.js';
import type { RuntimeStateStore } from './stores/types.js';
import { priceRequest, priceCancellation, priceInvestigation, shopifyData, ownVariant, sameObservation, validateShopifyCommerceState, type PriceRequest, type PriceOperation, type PriceReceipt } from './shopify-state.js';
import type { ShopifyPricePort } from './shopify-provider.js';
import { assertShopifyInstallation, validateShopifyOAuthState } from './shopify-oauth.js';

export class GuardrailError extends Error {
  constructor(public code:string,message:string,public statusCode=400,public details:Record<string,unknown>={}) { super(message); }
}
export type EngineOptions = {filePath?:string;store?:RuntimeStateStore;initializeEmptyStore?:boolean;initializeEmptyFile?:boolean;seed?:boolean;mode?:'simulation'|'live';killSwitchReader?:()=>Promise<KillState>;now?:()=>Date;shopifyStagingShops?:readonly string[]};
export type Result = Record<string,unknown>;
const stable = (value:unknown):string => JSON.stringify(value,(_key,item) => item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
const digest = (value:unknown) => createHash('sha256').update(stable(value)).digest('hex');
const deny = (reason:string,extra:Result={}):Result => ({decision:'deny',reason,...extra});
const DAY = (date:Date) => date.toISOString().slice(0,10);
function shopifyReferenceIssue(state:EngineState):string|null {
  const commerceRaw=state.extensions?.shopifyCommerce;
  if(commerceRaw===undefined)return null;
  const commerce=commerceRaw as {variants:{installationId:string;ownerId:string}[];snapshots:{installationId:string;ownerId:string}[];
    jobs:{installationId:string;ownerId:string}[];inbox:{installationId:string;ownerId:string}[];
    operations:{ownerId:string;input:{installationId:string};receipt?:{workspaceId:string}}[];
    subscriptionAttempts?:{installationId:string;ownerId:string}[]};
  const references=[...commerce.variants,...commerce.snapshots,...commerce.jobs,...commerce.inbox,
    ...(commerce.subscriptionAttempts??[]),...commerce.operations.map(item=>({installationId:item.input.installationId,ownerId:item.ownerId}))];
  if(!references.length)return null;
  const oauth=state.extensions?.shopifyOAuth as {workspaceId:string;installations:{id:string;workspaceId:string;ownerId:string}[]}|undefined;
  if(!oauth)return 'INSTALLATION_STATE_MISSING';
  const installations=new Map(oauth.installations.map(item=>[item.id,item]));
  if(!references.every(reference=>{
    const installation=installations.get(reference.installationId);
    return installation?.workspaceId===oauth.workspaceId&&installation.ownerId===reference.ownerId;
  }))return 'INSTALLATION_REFERENCE_MISMATCH';
  if(!commerce.operations.every(operation=>!operation.receipt||
    installations.get(operation.input.installationId)?.workspaceId===operation.receipt.workspaceId))return 'RECEIPT_WORKSPACE_MISMATCH';
  return null;
}

export class GuardrailEngine {
  private state:EngineState;
  private persistedStateObserved=false;
  private tail:Promise<unknown> = Promise.resolve();
  private options:EngineOptions;
  constructor(options:EngineOptions={}) {
    if(options.filePath&&options.store)throw new GuardrailError('STATE_CONFIG_INVALID','Choose one persistence backend; file fallback is not supported.',503);
    const parsedMode=hotlModeSchema.safeParse(options.mode??'simulation');
    if(!parsedMode.success)throw new GuardrailError('INVALID_MODE','HOTL_MODE must be simulation or live; refusing to start.',503);
    this.options={...options,mode:parsedMode.data};this.state=seedState(options.seed!==false);
  }
  private now() { return this.options.now?.() ?? new Date(); }
  get mode() { return this.options.mode ?? 'simulation'; }
  async initialize() {
    let loaded=false;
    if(this.options.store) {
      const initialized=await this.options.store.transaction(async current=>{
        if(current) {this.verify(current);return {state:current,result:null};}
        if(!this.options.initializeEmptyStore)throw new GuardrailError('STATE_MISSING','The database workspace has no ledger. Explicit first-time initialization is required; existing data is never reset.',503);
        const state=structuredClone(this.state);
        this.bootstrap(state);
        this.verify(state);
        return {state,result:null};
      });
      this.state=initialized.state;this.persistedStateObserved=true;loaded=true;
    }
    if(this.options.filePath) {
      await mkdir(dirname(this.options.filePath),{recursive:true});
      try { const marker=await readFile(`${this.options.filePath}.initialized`,'utf8');if(marker!=='HOTL_LEDGER_INITIALIZED_V1\n')throw new GuardrailError('STATE_INVALID','Ledger initialization marker is invalid.',503);this.persistedStateObserved=true; }
      catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      try { const next=JSON.parse(await readFile(this.options.filePath,'utf8')) as EngineState;this.verify(next);this.state=next;loaded=true;this.persistedStateObserved=true;await this.markFileInitialized(); }
      catch(error) {this.checkMissingState(error);if(this.mode==='live'&&!this.options.initializeEmptyFile)throw new GuardrailError('STATE_MISSING','Explicit first-time file initialization is required. Restore an existing ledger instead of reinitializing.',503);}
    }
    if(!loaded&&this.state.audit.length===0) {
      this.bootstrap(this.state);
    }
    this.verify(this.state);
    if(!loaded&&this.options.filePath) {
      // Persist even an untouched new workspace. A marker survives a failed first
      // snapshot so the next process refuses to silently recreate its history.
      await this.markFileInitialized();
      await this.transaction('workspace.file-initialized',{version:1},{type:'system',id:'bootstrap'},'hotl:file-initialized:v1',()=>({initialized:true}));
    }
    if(!this.state.schemaVersion) await this.transaction('workspace.migrate-constitution',{migration:2},{type:'system',id:'schema-migration'},'hotl:constitution-migration:v2',state=>{if(!state.schemaVersion)addConstitution(state,this.now().toISOString(),true);return {status:'migrated',schemaVersion:2};});
    return this;
  }
  private bootstrap(state:EngineState) {
    this.audit(state,{type:'system',id:'bootstrap'},this.mode==='simulation'?'simulation.initialized':'workspace.initialized',{mode:this.mode},this.mode==='simulation'?'Simulation workspace initialized':'Empty workspace initialized; live execution remains disabled');
    if(this.mode==='simulation'&&state.products.length) {
      this.audit(state,{type:'agent',id:'order_agent'},'simulation.inventory_synced',{products:state.products.length},`Inventory reconciled across ${state.products.length} demo products`);
      this.audit(state,{type:'agent',id:'sourcing_agent'},'simulation.margin_denied',{sku:'AURA-06',margin:0.3095},'Aura diffuser held below the 40% margin floor');
      this.audit(state,{type:'agent',id:'support_agent'},'simulation.refund_escalated',{orderId:'ORD-1029',amount:42},'$42 refund sent to your approval queue');
    }
  }
  private verify(state:EngineState) {
    if(!state||state.version!==1 || !Array.isArray(state.audit)||state.audit.length===0) throw new GuardrailError('STATE_INVALID','Unrecognized or empty persistent audit state; refusing writes.',503);
    if(state.extensions!==undefined&&(!state.extensions||typeof state.extensions!=='object'||Array.isArray(state.extensions)))throw new GuardrailError('STATE_INVALID','Persistent extension state is malformed; refusing writes.',503);
    if(state.extensions?.shopifyCommerce!==undefined&&!validateShopifyCommerceState(state.extensions.shopifyCommerce))throw new GuardrailError('SHOPIFY_STATE_INVALID','Persisted Shopify commerce state is invalid; restore it before continuing.',503);
    if(state.extensions?.shopifyOAuth!==undefined&&!validateShopifyOAuthState(state.extensions.shopifyOAuth))throw new GuardrailError('SHOPIFY_STATE_INVALID','Persisted Shopify installation state is invalid; restore it before continuing.',503);
    const shopifyReferenceError=shopifyReferenceIssue(state);
    if(shopifyReferenceError)throw new GuardrailError('SHOPIFY_STATE_INVALID',`Shopify commerce records failed ${shopifyReferenceError}; restore them before continuing.`,503,{reason:shopifyReferenceError});
    let previous:string|null=null;
    for(const entry of state.audit) {
      const {hash,...record}=entry;
      if(record.prevHash!==previous || digest(record)!==hash) throw new GuardrailError('AUDIT_INTEGRITY_FAILED','Audit chain integrity check failed; refusing writes.',503);
      previous=hash;
    }
    if(state.schemaVersion===2) {
      const parsed=constitutionSchema.safeParse(state.constitution);
      if(!parsed.success||!state.constitutionHistory?.length)throw new GuardrailError('STATE_INVALID','Constitution state is invalid; refusing writes.',503);
      if(state.config.dailyAdSpendCeiling!==parsed.data.dailyAdSpendCeiling||state.config.marginFloor!==parsed.data.marginFloor||state.config.autoRefundThreshold!==parsed.data.autoRefundThreshold)throw new GuardrailError('STATE_INVALID','Legacy configuration and constitution disagree.',503);
    }
  }
  private checkMissingState(error:unknown) {
    if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;
    if(this.persistedStateObserved) throw new GuardrailError('STATE_MISSING','Persistent guardrail state is missing; refusing to reuse cached state.',503);
  }
  private async markFileInitialized() {
    if(!this.options.filePath)return;
    const path=`${this.options.filePath}.initialized`;
    try {const marker=await open(path,'wx',0o600);try {await marker.writeFile('HOTL_LEDGER_INITIALIZED_V1\n');await marker.sync();}finally{await marker.close();}}
    catch(error) {if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(await readFile(path,'utf8')!=='HOTL_LEDGER_INITIALIZED_V1\n')throw new GuardrailError('STATE_INVALID','Ledger initialization marker is invalid.',503);}
  }
  private audit(state:EngineState,actor:Actor,eventType:string,payload:Result,summary:string) {
    const record:Omit<AuditEntry,'hash'>={id:randomUUID(),actorType:actor.type,actorId:actor.id,eventType,payload:structuredClone(payload),prevHash:state.audit.at(-1)?.hash??null,createdAt:this.now().toISOString(),summary};
    state.audit.push({...record,hash:digest(record)});
  }
  async killState():Promise<KillState> {
    if(!this.options.killSwitchReader) return {engaged:false}; // Only test/in-process simulation. HTTP server always injects a reader.
    try {const state=await this.options.killSwitchReader();if(typeof state.engaged!=='boolean') throw new Error('Invalid kill state');return state;}
    catch {throw new GuardrailError('KILL_SWITCH_UNAVAILABLE','Cannot verify the independent emergency stop; new actions are denied.',503);}
  }
  async snapshot():Promise<EngineState> {
    if(this.options.store) {
      const next=await this.options.store.read();
      if(!next)throw new GuardrailError('STATE_MISSING','Persistent guardrail state is missing; refusing to reuse cached state.',503);
      this.verify(next);this.state=next;this.persistedStateObserved=true;
    }
    if(this.options.filePath) {
      try {const next=JSON.parse(await readFile(this.options.filePath,'utf8')) as EngineState;this.verify(next);this.state=next;this.persistedStateObserved=true;}
      catch(error) {this.checkMissingState(error);}
    }
    this.verify(this.state);
    return structuredClone(this.state);
  }
  private async applyTransaction(state:EngineState,operation:string,payload:unknown,actor:Actor,key:string,action:(state:EngineState)=>Promise<Result>|Result) {
    const fingerprint=digest({operation,payload,actor,mode:this.mode});
    const ledgerKey=`id:${key}`;
    const existing=Object.hasOwn(state.idempotency,ledgerKey)?state.idempotency[ledgerKey]:undefined;
    if(existing) {
      if(existing.fingerprint!==fingerprint)throw new GuardrailError('IDEMPOTENCY_CONFLICT','This key was already used with a different actor or request.',409);
      return structuredClone(existing.result);
    }
    const result=await action(state);
    this.verify(state);
    this.audit(state,actor,operation,{request:payload,result,mode:this.mode},this.summary(operation,result));
    state.idempotency[ledgerKey]={fingerprint,result:structuredClone(result)};
    return result;
  }
  private async transaction(operation:string,payload:unknown,actor:Actor,key:string,action:(state:EngineState)=>Promise<Result>|Result):Promise<Result> {
    if(!key || key.length>200) throw new GuardrailError('IDEMPOTENCY_KEY_REQUIRED','A nonempty Idempotency-Key of at most 200 characters is required.');
    const work=async()=>{
      if(this.options.store) {
        const committed=await this.options.store.transaction(async state=>{
          if(!state)throw new GuardrailError('STATE_MISSING','Persistent guardrail state is missing; execution is denied.',503);
          this.verify(state);
          return {state,result:await this.applyTransaction(state,operation,payload,actor,key,action)};
        });
        this.state=committed.state;this.persistedStateObserved=true;
        return structuredClone(committed.result);
      }
      let handle:Awaited<ReturnType<typeof open>>|undefined;
      const lockPath=this.options.filePath ? `${this.options.filePath}.lock` : undefined;
      if(lockPath) {
        try {handle=await open(lockPath,'wx');}
        catch(error) {
          const code=(error as NodeJS.ErrnoException).code;
          // Windows may report a sharing/delete-pending lock as a permission error.
          // All acquisition failures deny execution; these can be retried with the same key.
          if(code==='EEXIST'||process.platform==='win32'&&['EPERM','EACCES','EBUSY'].includes(code??'')) throw new GuardrailError('STATE_BUSY','The guardrail state lock is unavailable; retry with the same key.',503);
          throw error;
        }
      }
      try {
        const state=await this.snapshot();
        const auditLength=state.audit.length;
        const result=await this.applyTransaction(state,operation,payload,actor,key,action);
        if(state.audit.length===auditLength)return structuredClone(result);
        if(this.options.filePath) {
          const temporary=`${this.options.filePath}.${randomUUID()}.tmp`;
          try {
            const snapshotHandle=await open(temporary,'wx');
            try {await snapshotHandle.writeFile(JSON.stringify(state,null,2),'utf8');await snapshotHandle.sync();}
            finally {await snapshotHandle.close();}
            for(let attempt=0;;attempt++) {
              try {await rename(temporary,this.options.filePath);break;}
              catch(error) {
                const code=(error as NodeJS.ErrnoException).code;
                if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(code??''))throw error;
                if(attempt>=9)throw new GuardrailError('STATE_BUSY','Persistent state is temporarily locked by a reader; retry with the same key.',503);
                await new Promise(resolve=>setTimeout(resolve,10*(attempt+1)));
              }
            }
            this.persistedStateObserved=true;
            await this.markFileInitialized();
          } catch(error) {await unlink(temporary).catch(()=>{});throw error;}
        }
        this.state=state;
        return structuredClone(result);
      } finally {if(handle) await handle.close();if(lockPath&&handle) await unlink(lockPath);}
    };
    const pending=this.tail.then(work,work);this.tail=pending.catch(()=>{});return pending;
  }
  private summary(operation:string,result:Result):string {
    const names:Record<string,string>={'spend.check':'Campaign budget checked','spend.commit':'Reserved campaign spend committed','listing.publish':'Product listing evaluated','campaign.launch':'Campaign launch evaluated','refunds.evaluate':'Refund request evaluated','pause.engage':'All agent actions paused','pause.release':'Agent actions resumed','guardrails.config':'Guardrail configuration updated','commerce.checkout':'Simulation order created','commerce.event':'Commerce event recorded','interrupt.resolve':'Owner decision recorded','supplier.order':'Supplier order evaluated'};
    return `${names[operation]??operation}${result.reason?`: ${result.reason}`:''}`;
  }
  async extensionTransaction(operation:string,payload:unknown,actor:Actor,key:string,callback:(state:EngineState)=>Result|Promise<Result>) {
    this.owner(actor);
    if(!/^(integration|workspace)\.[a-z][a-z0-9_.-]*$/.test(operation))throw new GuardrailError('EXTENSION_OPERATION_DENIED','Unsupported extension operation.',403);
    return this.transaction(operation,payload,actor,key,callback);
  }
  /** Provider configuration writes use the same live, durable, emergency and owner boundary as staging price dispatch. */
  async assertShopifyWebhookWrite(state:EngineState,installationId:string,actor:Actor,revision:number) {
    this.owner(actor);
    const installation=assertShopifyInstallation(state,installationId,actor,revision);
    if(this.mode!=='live'||!this.options.shopifyStagingShops?.includes(installation.shop))throw new GuardrailError('SHOPIFY_STAGING_CAPABILITY_DISABLED','Shopify staging is not enabled for this shop.',403);
    if(!this.options.filePath&&!this.options.store)throw new GuardrailError('DURABLE_STATE_REQUIRED','Provider writes require a durable ledger.',503);
    if(!this.options.killSwitchReader)throw new GuardrailError('KILL_SWITCH_UNAVAILABLE','Independent emergency state is required.',503);
    if((await this.killState()).engaged)throw new GuardrailError('KILL_SWITCH_ENGAGED','Emergency stop is engaged.',403);
    if(state.paused||this.constitution(state).domains.catalog.paused)throw new GuardrailError('SYSTEM_PAUSED','Catalog action is paused.',403);
    return installation;
  }
  private pilotApprovalFailure(constitution:BusinessConstitution):string|null {
    const envelope=constitution.pilot;
    if(!envelope)return 'PILOT_ENVELOPE_REQUIRED';
    const approval=envelope.approval;
    if(!approval||approval.constitutionVersion!==constitution.version||approval.draftDigest!==digest(envelope.draft))return 'PILOT_APPROVAL_REQUIRED';
    return null;
  }
  private pilotDraftFailure(constitution:BusinessConstitution):string|null {
    const draft=constitution.pilot?.draft;
    if(!draft)return 'PILOT_ENVELOPE_REQUIRED';
    for(const field of Object.values(draft.profile))if(field.value===null||field.provenance==='ESTIMATED')return 'PILOT_PROFILE_INCOMPLETE';
    if(draft.profile.currency.value!=='USD')return 'PILOT_CURRENCY_UNSUPPORTED';
    for(const [name,field] of Object.entries(draft.economics)) {
      if(field.value===null||field.provenance==='ESTIMATED')return 'PILOT_ECONOMICS_INCOMPLETE';
      if(!['targetContribution','breakEvenCac','breakEvenRoas'].includes(name)&&field.provenance==='CALCULATED')return 'PILOT_ECONOMICS_SOURCE_REQUIRED';
    }
    if(pilotEconomicsCalculationIssues(draft as Parameters<typeof pilotEconomicsCalculationIssues>[0]).length)return 'PILOT_ECONOMICS_CALCULATION_INVALID';
    for(const field of Object.values(draft.capital))if(field.value===null||field.provenance!=='OWNER_ENTERED')return 'PILOT_OWNER_LIMITS_REQUIRED';
    const cap=draft.capital;
    const v=(field:typeof cap.maxPilotCapital)=>Number(field.value);
    const deployable=v(cap.maxPilotCapital)-v(cap.protectedReserve);
    if(deployable<=0||v(cap.maxDailySpend)>v(cap.maxWeeklySpend)||v(cap.maxWeeklySpend)>v(cap.maxMonthlySpend)
      ||[cap.maxDailySpend,cap.maxMonthlySpend,cap.maxAdvertisingExposure,cap.maxSupplierExposure,cap.maxInventoryExposure,cap.maxExperimentLoss,cap.maxRefundAuthority,cap.maxSingleAutonomousTransaction].some(field=>v(field)>deployable))return 'PILOT_LIMITS_CONFLICT';
    if(constitution.dailyAdSpendCeiling>v(cap.maxDailySpend)||constitution.monthlyAdSpendCeiling>v(cap.maxMonthlySpend)
      ||constitution.maxSupplierPurchase>v(cap.maxSupplierExposure)||constitution.maxAutonomousTransaction>v(cap.maxSingleAutonomousTransaction)
      ||constitution.autoRefundThreshold>v(cap.maxRefundAuthority))return 'PILOT_CONSTITUTION_LIMITS_CONFLICT';
    const required=['UNCERTAIN_PROVIDER_OPERATIONS','PROVIDER_RECONCILIATION_FAILURES'];
    if(required.some(metric=>!draft.stopRules.some(rule=>rule.metric===metric&&rule.enabled&&rule.threshold>=1)))return 'PILOT_STOP_RULES_REQUIRED';
    if(new Set(draft.stopRules.map(rule=>rule.metric)).size!==draft.stopRules.length)return 'PILOT_STOP_RULES_DUPLICATED';
    if(draft.stopRules.some(rule=>rule.enabled&&!required.includes(rule.metric)))return 'PILOT_STOP_SIGNAL_UNAVAILABLE';
    return null;
  }
  private pilotStopFailure(state:EngineState,input:PriceRequest,operationId?:string):string|null {
    const rules=this.constitution(state).pilot?.draft.stopRules??[];
    // The existing per-resource lock gives the specific denial for this variant.
    // Global pilot stop rules cover other unresolved resources in the workspace.
    const operations=shopifyData(state).operations.filter(item=>item.id!==operationId&&
      (item.input.installationId!==input.installationId||item.input.variantId!==input.variantId));
    for(const rule of rules) {
      if(!rule.enabled)continue;
      const observed=rule.metric==='UNCERTAIN_PROVIDER_OPERATIONS'
        ?operations.filter(item=>['DISPATCHING','UNKNOWN','DRIFT'].includes(item.status)).length
        :rule.metric==='PROVIDER_RECONCILIATION_FAILURES'
          ?operations.filter(item=>item.status==='DRIFT').length:undefined;
      if(observed===undefined)return 'PILOT_STOP_SIGNAL_UNAVAILABLE';
      if(observed>=rule.threshold)return `PILOT_STOP_${rule.metric}`;
    }
    return null;
  }
  private async shopifyPricePolicy(state:EngineState,input:PriceRequest,actor:Actor,operationId?:string):Promise<Result|null> {
    this.owner(actor);
    const installation=assertShopifyInstallation(state,input.installationId,actor);
    if(this.mode!=='live'||!this.options.shopifyStagingShops?.includes(installation.shop))return deny('SHOPIFY_STAGING_CAPABILITY_DISABLED');
    if(!this.options.filePath&&!this.options.store)return deny('DURABLE_STATE_REQUIRED');
    if(!this.options.killSwitchReader)return deny('KILL_SWITCH_UNAVAILABLE');
    try {if((await this.killState()).engaged)return deny('KILL_SWITCH_ENGAGED');} catch{return deny('KILL_SWITCH_UNAVAILABLE');}
    if(state.paused)return deny('SYSTEM_PAUSED');
    const c=this.constitution(state);
    if(c.version!==input.expectedConstitutionVersion)return deny('CONSTITUTION_CHANGED');
    const pilotFailure=this.pilotApprovalFailure(c);if(pilotFailure)return deny(pilotFailure);
    if(c.pilot!.draft.profile.salesChannel.value!=='SHOPIFY_DEVELOPMENT_STORE'||c.pilot!.draft.profile.currency.value!=='USD')return deny('PILOT_CHANNEL_OR_CURRENCY_MISMATCH');
    const stopFailure=this.pilotStopFailure(state,input,operationId);if(stopFailure)return deny(stopFailure);
    if(c.domains.pricing.paused||c.domains.catalog.paused)return deny('DOMAIN_PAUSED');
    if(!installation.scopes.includes('write_products'))return deny('PROVIDER_SCOPE_REQUIRED');
    const variant=ownVariant(state,input,actor);
    if(!variant)return deny('MERCHANT_VARIANT_NOT_FOUND');
    if(variant.revision!==input.expectedRevision)return deny('RESOURCE_CHANGED');
    const age=this.now().getTime()-Date.parse(variant.observedAt);
    if(!Number.isFinite(age)||age<0||age>120000)return deny('STALE_PROVIDER_STATE');
    if(variant.currency!=='USD')return deny('UNSUPPORTED_CURRENCY');
    const economics=variant.economics;
    if(!economics||!Number.isFinite(Date.parse(economics.validUntil))||Date.parse(economics.validUntil)<=this.now().getTime())return deny('COST_EVIDENCE_REQUIRED');
    const restriction=this.productRestriction(state,economics);if(restriction)return restriction;
    const price=Number(input.price);
    if(price<=0)return deny('INVALID_PRICE');
    const margin=this.margin(state,{sku:variant.sku??variant.variantId,sellingPrice:price,landedCost:economics.landedCost,estimatedCac:economics.estimatedCac,currency:'USD'});
    if(margin.decision!=='allow')return margin;
    if(Math.abs(toMinor(price)-toMinor(Number(variant.price)))*100>toMinor(Number(variant.price))*c.maxPriceChangePct)return deny('PRICE_CHANGE_LIMIT_EXCEEDED');
    if(input.compensationFor) {
      const original=shopifyData(state).operations.find(op=>op.id===input.compensationFor&&op.ownerId===actor.id);
      if(!original||original.status!=='CONFIRMED'||!original.receipt?.after||original.input.installationId!==input.installationId||!sameObservation(original.receipt.after,variant)||input.price!==original.before.price)return deny('COMPENSATION_STALE');
    }
    return null;
  }
  /** A proposal creates durable intent, never reusable permission for a provider call. */
  async prepareShopifyPrice(raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=priceRequest.parse(raw);
    return this.transaction('shopify.price.proposed',input,actor,key,async state=>{
      const blocked=await this.shopifyPricePolicy(state,input,actor);if(blocked)return blocked;
      const data=shopifyData(state);
      if(data.operations.some(op=>op.input.installationId===input.installationId&&op.input.variantId===input.variantId&&['PENDING','DISPATCHING','UNKNOWN','DRIFT'].includes(op.status)))return deny('PROVIDER_OPERATION_UNRESOLVED');
      const operation:PriceOperation={id:randomUUID(),ownerId:actor.id,installationRevision:assertShopifyInstallation(state,input.installationId,actor).revision,input,before:structuredClone(ownVariant(state,input,actor)!),createdAt:this.now().toISOString(),status:'PENDING'};
      data.operations.push(operation);
      return {decision:'allow',operationId:operation.id,status:operation.status};
    });
  }
  /** Withdrawal never grants provider authority and cannot clear an uncertain dispatch. */
  async cancelShopifyPrice(id:string,raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=priceCancellation.parse(raw);
    return this.transaction('shopify.price.cancelled',{id,...input},actor,key,state=>{
      const operation=shopifyData(state).operations.find(op=>op.id===id&&op.ownerId===actor.id);
      if(!operation)throw new GuardrailError('OPERATION_NOT_FOUND','The operation was not found.',404);
      if(operation.status!=='PENDING')throw new GuardrailError('OPERATION_NOT_CANCELLABLE','Only an unclaimed pending proposal can be cancelled. Preserve dispatched operations for reconciliation.',409);
      operation.status='CANCELLED';
      operation.cancellation={reason:input.reason,at:this.now().toISOString(),actorId:actor.id};
      return {decision:'allow',operationId:id,status:operation.status};
    });
  }
  /** Owner investigation is evidence annotation only; it cannot clear a dispatch lock or authorize a fresh write. */
  async recordShopifyPriceInvestigation(id:string,raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=priceInvestigation.parse(raw);
    return this.transaction('shopify.price.investigation-recorded',{id,reviewDigest:digest(input)},actor,key,state=>{
      const operation=shopifyData(state).operations.find(op=>op.id===id&&op.ownerId===actor.id);
      if(!operation)throw new GuardrailError('OPERATION_NOT_FOUND','The operation was not found.',404);
      if(operation.status!==input.expectedStatus||!['DISPATCHING','UNKNOWN','DRIFT'].includes(operation.status))throw new GuardrailError('INVESTIGATION_STATE_CHANGED','Refresh the unresolved operation before recording a review.',409);
      const observedRevision=operation.reconciliation?(operation.reconciliation.revision??1):null;
      if((operation.reconciliation?.at??null)!==input.expectedReconciliationAt||observedRevision!==input.expectedReconciliationRevision)throw new GuardrailError('INVESTIGATION_EVIDENCE_CHANGED','Provider reconciliation changed. Refresh its evidence before recording a review.',409);
      operation.investigations??=[];
      if(operation.investigations.length>=100)throw new GuardrailError('INVESTIGATION_LIMIT','The review history limit was reached; preserve this incident and investigate externally.',409);
      const review={...input,id:randomUUID(),at:this.now().toISOString(),reviewerId:actor.id,reconciliation:operation.reconciliation?structuredClone(operation.reconciliation):null,verifiedProviderEvidence:false as const};
      operation.investigations.push(review);
      return {decision:'allow',operationId:id,reviewId:review.id,status:operation.status,lockRetained:true,verifiedProviderEvidence:false};
    });
  }
  /** Unique claims are durable BEFORE dispatch. A restarted claimant reconciles; it never resends. */
  async claimShopifyPrice(id:string,actor:Actor) {
    this.owner(actor);const claim=randomUUID();
    return this.transaction('shopify.price.claimed',{id,claim},actor,`shopify-claim:${claim}`,state=>{
      const operation=shopifyData(state).operations.find(op=>op.id===id&&op.ownerId===actor.id);
      if(!operation)throw new GuardrailError('OPERATION_NOT_FOUND','The operation was not found.',404);
      if(operation.status!=='PENDING')return {claimed:false,operationId:id,status:operation.status};
      operation.status='DISPATCHING';operation.claim=claim;
      return {claimed:true,claim,operationId:id};
    });
  }
  async dispatchShopifyPrice(id:string,claim:string,actor:Actor,credentialRevision:number,port:ShopifyPricePort) {
    this.owner(actor);
    return this.transaction('shopify.price.executed',{id,claim},actor,`shopify-execute:${id}`,async state=>{
      const operation=shopifyData(state).operations.find(op=>op.id===id&&op.ownerId===actor.id);
      if(!operation||operation.status!=='DISPATCHING'||operation.claim!==claim)throw new GuardrailError('DISPATCH_CLAIM_INVALID','The operation is not dispatchable.',409);
      const reject=(result:Result)=>{operation.status='DENIED';operation.reason=String(result.reason);delete operation.claim;return {...result,operationId:id,status:operation.status};};
      try {assertShopifyInstallation(state,operation.input.installationId,actor,credentialRevision);if(operation.installationRevision!==credentialRevision)return reject(deny('INSTALLATION_CHANGED'));} catch{return reject(deny('INSTALLATION_CHANGED'));}
      const blocked=await this.shopifyPricePolicy(state,operation.input,actor,id);if(blocked)return reject(blocked);
      let before;
      try {before=await port.read(operation.input.variantId);} catch(error){return reject(deny(error instanceof Error&&'code' in error&&error.code==='AUTHENTICATION_FAILED'?'SHOPIFY_AUTH_REQUIRED':'PROVIDER_PREFLIGHT_FAILED'));}
      if(before.developmentStore!==true)return reject(deny('DEVELOPMENT_STORE_REQUIRED'));
      if(!sameObservation(before,operation.before))return reject(deny('PROVIDER_RESOURCE_CHANGED'));
      // A policy check can take time while the merchant edits the provider. Re-read before the
      // write and reject any changed external pre-state; Shopify offers no conditional price CAS.
      const intermediateBlock=await this.shopifyPricePolicy(state,operation.input,actor,id);if(intermediateBlock)return reject(intermediateBlock);
      let latest;
      try {latest=await port.read(operation.input.variantId);} catch(error){return reject(deny(error instanceof Error&&'code' in error&&error.code==='AUTHENTICATION_FAILED'?'SHOPIFY_AUTH_REQUIRED':'PROVIDER_PREFLIGHT_FAILED'));}
      if(latest.developmentStore!==true)return reject(deny('DEVELOPMENT_STORE_REQUIRED'));
      if(!sameObservation(latest,before))return reject(deny('PROVIDER_RESOURCE_CHANGED'));
      before=latest;
      // The ledger lock serializes local owner edits. Recheck emergency and owner policy after
      // the last provider read so a kill or Constitution change during it still denies dispatch.
      const finalBlock=await this.shopifyPricePolicy(state,operation.input,actor,id);if(finalBlock)return reject(finalBlock);
      const receipt:PriceReceipt={provider:'shopify',environment:'staging',operationId:id,workspaceId:assertShopifyInstallation(state,operation.input.installationId,actor).workspaceId,actorId:actor.id,authorization:{constitutionVersion:operation.input.expectedConstitutionVersion,resourceRevision:operation.input.expectedRevision,installationRevision:credentialRevision},dispatchedAt:this.now().toISOString(),completedAt:this.now().toISOString(),requestId:null,before,requestedPrice:operation.input.price,outcome:'UNKNOWN'};
      try {
        const response=await port.write(before.productId,before.variantId,operation.input.price);receipt.requestId=response.requestId;
        const after=await port.read(before.variantId);receipt.after=after;
        receipt.outcome=after.variantId===before.variantId&&after.productId===before.productId&&after.currency===before.currency&&after.price===operation.input.price?'CONFIRMED':'DRIFT';
      } catch(error) {
        // Even HTTP errors/timeouts can hide a completed provider action. Never infer nonexecution.
        receipt.errorCode=error instanceof Error&&'code' in error?String(error.code).replace(/[^A-Z_]/g,'').slice(0,80):'PROVIDER_OUTCOME_UNKNOWN';
      }
      receipt.completedAt=this.now().toISOString();operation.receipt=receipt;operation.status=receipt.outcome;delete operation.claim;
      if(receipt.outcome==='CONFIRMED'&&receipt.after) {
        const variant=ownVariant(state,operation.input,actor)!;
        Object.assign(variant,receipt.after,{revision:variant.revision+1,observedAt:receipt.completedAt});
      }
      return {decision:receipt.outcome==='CONFIRMED'?'allow':'unknown',operationId:id,status:operation.status,receipt};
    });
  }
  private async block(state:EngineState):Promise<Result|null> {
    let kill:KillState;
    try {kill=await this.killState();} catch(error) {return deny((error as GuardrailError).code);}
    if(kill.engaged) return deny('KILL_SWITCH_ENGAGED');
    if(state.paused) return deny('SYSTEM_PAUSED');
    if(this.mode==='live') return deny('LIVE_ADAPTERS_UNAVAILABLE',{message:'This build supports simulation execution only. Live provider writes are disabled.'});
    return null;
  }
  private spendUsage(state:EngineState) {
    const now=this.now(),day=DAY(now);
    return (state.seedSpendDay===day?state.seedSpendMinor:0)+state.reservations.filter(item=>item.day===day&&(item.status==='committed'||item.status==='reserved'&&new Date(item.expiresAt)>now)).reduce((sum,item)=>sum+item.amountMinor,0);
  }
  private constitution(state:EngineState):BusinessConstitution {if(!state.constitution)throw new GuardrailError('STATE_INVALID','Constitution migration is required.',503);return state.constitution;}
  private monthlySpend(state:EngineState) {
    const month=DAY(this.now()).slice(0,7),now=this.now();
    return (state.seedSpendDay.startsWith(month)?state.seedSpendMinor:0)+state.reservations.filter(r=>r.day.startsWith(month)&&(r.status==='committed'||r.status==='reserved'&&new Date(r.expiresAt)>now)).reduce((sum,r)=>sum+r.amountMinor,0);
  }
  private productRestriction(state:EngineState,product:{category:string;countryOfOrigin?:string}):Result|null {
    const c=this.constitution(state);
    if(c.prohibitedCategories.some(category=>category.toLowerCase()===product.category.toLowerCase()))return deny('PROHIBITED_CATEGORY');
    if(c.permittedCountries.length||c.prohibitedCountries.length) {
      if(!product.countryOfOrigin)return deny('COUNTRY_EVIDENCE_REQUIRED');
      if(c.prohibitedCountries.includes(product.countryOfOrigin)||c.permittedCountries.length&&!c.permittedCountries.includes(product.countryOfOrigin))return deny('COUNTRY_NOT_PERMITTED');
    }
    return null;
  }
  private resourceContext(state:EngineState,input:Result,operation:string):Result|null {
    if(input.productId) {
      const product=state.products.find(p=>p.id===input.productId);if(!product)return deny('PRODUCT_NOT_FOUND');
      if(input.expectedRevision!==undefined&&input.expectedRevision!==product.revision)return deny('RESOURCE_CHANGED',{replan:true,currentRevision:product.revision});
    } else if(input.orderId) {
      const order=state.orders.find(o=>o.id===input.orderId);if(!order)return deny('ORDER_NOT_FOUND');
      if(input.expectedRevision!==undefined&&input.expectedRevision!==order.revision)return deny('RESOURCE_CHANGED',{replan:true,currentRevision:order.revision});
    } else if(input.campaignId) {
      const campaign=state.campaigns.find(c=>c.campaignId===input.campaignId);
      const revision=campaign?.revision??0;
      if(input.expectedRevision!==undefined&&input.expectedRevision!==revision)return deny('RESOURCE_CHANGED',{replan:true,currentRevision:revision});
    } else if(input.reservationId) {
      const reservation=state.reservations.find(r=>r.id===input.reservationId);if(!reservation)return deny('RESERVATION_NOT_FOUND');
      if(input.expectedRevision!==undefined&&input.expectedRevision!==(reservation.revision??1))return deny('RESOURCE_CHANGED',{replan:true,currentRevision:reservation.revision??1});
    }
    if(input.productId&&input.orderId) {
      const order=state.orders.find(o=>o.id===input.orderId);if(!order)return deny('ORDER_NOT_FOUND');
      if(input.expectedOrderRevision!==undefined&&input.expectedOrderRevision!==order.revision)return deny('RESOURCE_CHANGED',{replan:true,currentOrderRevision:order.revision});
    }
    return null;
  }
  private scope(operation:string,actor:Actor):Result|null {
    if(actor.type!=='agent')return null;
    const allowed:Record<string,string[]>={sourcing_agent:['listing.publish'],marketing_agent:['spend.check','spend.commit','campaign.launch','campaign.pause'],support_agent:['refunds.evaluate'],order_agent:['supplier.order']};
    return allowed[actor.id]?.includes(operation)?null:deny('AGENT_SCOPE_REQUIRED');
  }
  private context(state:EngineState,input:Result,actor:Actor,operation:string):Result|null {
    const c=this.constitution(state);
    if(actor.type==='agent'&&(input.expectedConstitutionVersion===undefined||((input.productId||input.orderId||input.campaignId||input.reservationId)&&input.expectedRevision===undefined)||(input.productId&&input.orderId&&input.expectedOrderRevision===undefined)))return deny('AGENT_CONTEXT_REQUIRED',{replan:true,currentConstitutionVersion:c.version});
    if(input.expectedConstitutionVersion!==undefined&&input.expectedConstitutionVersion!==c.version)return deny('CONSTITUTION_CHANGED',{replan:true,currentConstitutionVersion:c.version});
    return this.resourceContext(state,input,operation);
  }
  private proposal(state:EngineState,operation:string,input:Result,actor:Actor,domain:AutonomyDomain,reason:string):Result {
    const signature=digest({operation,input,actor});
    const existing=state.interrupts.find(p=>p.status==='pending'&&p.payload.proposalFingerprint===signature);
    if(existing)return {decision:'escalated',interruptId:existing.id,reason,mode:this.mode};
    const id=randomUUID(),runId=String(input.runId??`run-${id}`),constitution=this.constitution(state);
    const request:Result={...input,expectedConstitutionVersion:constitution.version};
    if(request.expectedRevision===undefined&&request.orderId)request.expectedRevision=state.orders.find(o=>o.id===request.orderId)?.revision;
    if(request.expectedRevision===undefined&&request.productId)request.expectedRevision=state.products.find(p=>p.id===request.productId)?.revision;
    const payload={operation,request:structuredClone(request),actor:structuredClone(actor),domain,constitutionVersion:constitution.version,resourceRevision:request.expectedRevision??null,proposalFingerprint:signature,policy:structuredClone(constitution.domains[domain])};
    state.interrupts.push({id,runId,threadId:runId,category:operation==='refunds.evaluate'?'refund_escrow':'other',title:`${domain[0]!.toUpperCase()+domain.slice(1)} action needs approval`,summary:`${operation} requires your decision: ${reason}.`,agentName:actor.id,priority:'medium',payload,status:'pending',createdAt:this.now().toISOString(),expiresAt:null,requiredAction:'approve|reject|modify'});
    return {decision:'escalated',interruptId:id,reason,constitutionVersion:constitution.version,mode:this.mode};
  }
  private autonomy(state:EngineState,operation:string,input:Result,actor:Actor,domains:AutonomyDomain[],amount:number,approved=false):Result|null {
    const scope=this.scope(operation,actor);if(scope)return scope;
    const context=this.context(state,input,actor,operation);if(context)return context;
    if(actor.type!=='agent')return null;
    const c=this.constitution(state);
    for(const domain of domains) {
      const policy=c.domains[domain];
      if(policy.paused)return deny('DOMAIN_PAUSED',{domain});
      if(policy.mode==='MANUAL')return deny('MANUAL_CONTROL',{domain});
    }
    for(const domain of domains) {
      const policy=c.domains[domain];
      if(approved)continue;
      if(c.hardRules.length||policy.mode==='COPILOT'||amount>c.maxAutonomousTransaction||(policy.mode==='SUPERVISED'&&(amount>policy.maxAutoActionAmount||operation==='listing.publish'))||amount>policy.maxAutoActionAmount)
        return this.proposal(state,operation,input,actor,domain,policy.mode==='COPILOT'?'COPILOT_APPROVAL_REQUIRED':'AUTONOMY_APPROVAL_REQUIRED');
    }
    return null;
  }
  private supersede(state:EngineState,resourceId:string,exceptId?:string) {
    for(const item of state.interrupts) {
      const request=(item.payload.request??item.payload) as Result;
      if(item.status==='pending'&&item.id!==exceptId&&(request.productId===resourceId||request.orderId===resourceId||request.campaignId===resourceId)){
        item.status='expired';item.resolutionNote='Resource changed; prepare a new proposal from current context.';item.resolvedAt=this.now().toISOString();
      }
    }
  }
  private async execute(state:EngineState,operation:string,input:Result,actor:Actor,approved=false):Promise<Result> {
    const blocked=await this.block(state);if(blocked)return blocked;
    if(actor.type==='agent'&&((input.agentId&&input.agentId!==actor.id)||(input.requestedBy&&input.requestedBy!==actor.id)))return deny('ACTOR_MISMATCH');
    const scope=this.scope(operation,actor);if(scope)return scope;
    const context=this.context(state,input,actor,operation);if(context)return context;
    const c=this.constitution(state);
    if(operation==='spend.check'||operation==='campaign.launch') {
      const request=campaignSchema.parse(input);
      const remaining=Math.max(0,toMinor(c.dailyAdSpendCeiling)-this.spendUsage(state));
      if(toMinor(request.requestedAmount)>remaining)return deny('DAILY_CEILING_EXCEEDED',{remainingDailyBudget:fromMinor(remaining),ceiling:c.dailyAdSpendCeiling});
      if(this.monthlySpend(state)+toMinor(request.requestedAmount)>toMinor(c.monthlyAdSpendCeiling))return deny('MONTHLY_CEILING_EXCEEDED');
      if(operation==='campaign.launch'&&state.campaigns.some(item=>item.campaignId===request.campaignId))return deny('CAMPAIGN_ALREADY_LAUNCHED');
      const gate=this.autonomy(state,operation,input,actor,['advertising'],request.requestedAmount,approved);if(gate)return gate;
      return operation==='spend.check'?this.reserve(state,request,actor):this.launch(state,request,actor);
    }
    if(operation==='listing.publish') {
      const request=listingSchema.parse(input),product=state.products.find(p=>p.id===request.productId);if(!product)return deny('PRODUCT_NOT_FOUND');
      const restricted=this.productRestriction(state,product);if(restricted)return restricted;
      const price=request.sellingPrice??product.price;
      const margin=this.margin(state,{sku:product.sku,sellingPrice:price,landedCost:product.landedCost,estimatedCac:product.estimatedCac,currency:'USD'});if(margin.decision!=='allow')return margin;
      if(Math.abs(toMinor(price)-toMinor(product.price))*100>toMinor(product.price)*c.maxPriceChangePct)return deny('PRICE_CHANGE_LIMIT_EXCEEDED');
      const gate=this.autonomy(state,operation,input,actor,price===product.price?['catalog']:['catalog','pricing'],0,approved);if(gate)return gate;
      const result=this.publish(state,request.productId,request.sellingPrice);if(result.decision==='allow')this.supersede(state,product.id);return result;
    }
    if(operation==='refunds.evaluate') {
      const request=refundSchema.parse(input),order=state.orders.find(o=>o.id===request.orderId);if(!order)return deny('ORDER_NOT_FOUND');
      if(order.status==='payment_failed')return deny('ORDER_NOT_REFUNDABLE');
      if(toMinor(request.amount)+toMinor(order.refunded)>toMinor(order.total))return deny('REFUND_EXCEEDS_ORDER_BALANCE');
      const gate=this.autonomy(state,operation,input,actor,['refunds'],request.amount,approved);if(gate)return gate;
      if(!approved) {
        const pending=state.interrupts.find(item=>item.status==='pending'&&item.category==='refund_escrow'&&((item.payload.request??item.payload) as Result).orderId===request.orderId);
        if(pending) {
          const prior=(pending.payload.request??pending.payload) as Result;
          if(prior.amount!==request.amount||request.runId&&pending.runId!==request.runId)return deny('REFUND_ALREADY_PENDING',{interruptId:pending.id,runId:pending.runId});
          return {decision:'escalated',interruptId:pending.id,threshold:c.autoRefundThreshold,mode:this.mode};
        }
        if(toMinor(request.amount)+toMinor(order.refunded)>toMinor(c.autoRefundThreshold))return this.proposal(state,operation,input,actor,'refunds','REFUND_ESCROW_REQUIRED');
      }
      const result=this.refund(state,request.orderId,request.amount);if(result.decision==='allow')this.supersede(state,order.id);return result;
    }
    if(operation==='supplier.order') {
      const request=supplierOrderSchema.parse(input),product=state.products.find(p=>p.id===request.productId),order=state.orders.find(o=>o.id===request.orderId);
      if(!product)return deny('PRODUCT_NOT_FOUND');if(!order)return deny('ORDER_NOT_FOUND');
      const line=order.items.find(item=>item.productId===request.productId);
      if(!line||request.quantity>line.quantity)return deny('SUPPLIER_QUANTITY_EXCEEDS_ORDER');
      if(state.supplierOrders.some(item=>item.orderId===request.orderId&&item.productId===request.productId))return deny('SUPPLIER_ORDER_ALREADY_PLACED');
      if(request.quantity!==line.quantity)return deny('SUPPLIER_PARTIAL_LINE_UNSUPPORTED');
      if(order.status!=='processing')return deny('ORDER_NOT_FULFILLABLE');
      const restricted=this.productRestriction(state,product);if(restricted)return restricted;
      const total=fromMinor(toMinor(product.landedCost)*request.quantity);
      if(toMinor(total)>toMinor(c.maxSupplierPurchase))return deny('SUPPLIER_PURCHASE_LIMIT_EXCEEDED');
      const gate=this.autonomy(state,operation,input,actor,['purchasing','fulfillment'],total,approved);if(gate)return gate;
      const before=structuredClone(order),supplierOrder={id:`sim_po_${randomUUID()}`,orderId:request.orderId,productId:product.id,quantity:request.quantity,total,createdAt:this.now().toISOString()};
      state.supplierOrders.push(supplierOrder);order.revision=(order.revision??1)+1;
      if(order.items.every(item=>state.supplierOrders.some(placed=>placed.orderId===order.id&&placed.productId===item.productId))){order.status='shipped';order.tracking=`SIM-${randomUUID().slice(0,8).toUpperCase()}`;}
      this.supersede(state,order.id);
      return {decision:'allow',supplierOrder,tracking:order.tracking,before,after:structuredClone(order),mode:this.mode};
    }
    if(operation==='campaign.pause') {
      const campaign=state.campaigns.find(item=>item.campaignId===input.campaignId);if(!campaign)return deny('CAMPAIGN_NOT_FOUND');
      const gate=this.autonomy(state,operation,input,actor,['advertising'],0,approved);if(gate)return gate;
      const before=structuredClone(campaign);campaign.status='paused';campaign.revision=Number(campaign.revision??1)+1;this.supersede(state,String(campaign.campaignId));
      return {decision:'allow',status:'paused',before,after:structuredClone(campaign),mode:this.mode};
    }
    if(operation==='spend.commit')return this.commit(state,spendCommitSchema.parse(input),actor,approved);
    return deny('UNSUPPORTED_OPERATION');
  }
  private reserve(state:EngineState,input:ReturnType<typeof spendCheckSchema.parse>,actor:Actor):Result {
    if(actor.type==='agent'&&actor.id!==input.agentId) return deny('ACTOR_MISMATCH');
    const remaining=Math.max(0,toMinor(state.config.dailyAdSpendCeiling)-this.spendUsage(state));
    if(toMinor(input.requestedAmount)>remaining) return deny('DAILY_CEILING_EXCEEDED',{remainingDailyBudget:fromMinor(remaining),ceiling:state.config.dailyAdSpendCeiling});
    if(this.monthlySpend(state)+toMinor(input.requestedAmount)>toMinor(this.constitution(state).monthlyAdSpendCeiling))return deny('MONTHLY_CEILING_EXCEEDED');
    const reservation={id:randomUUID(),campaignId:input.campaignId,amountMinor:toMinor(input.requestedAmount),agentId:input.agentId,day:DAY(this.now()),status:'reserved' as const,revision:1,expiresAt:new Date(this.now().getTime()+15*60000).toISOString()};
    state.reservations.push(reservation);
    return {decision:'allow',reservationId:reservation.id,revision:1,expiresAt:reservation.expiresAt,remainingDailyBudget:fromMinor(remaining-reservation.amountMinor),ceiling:state.config.dailyAdSpendCeiling,mode:this.mode};
  }
  async checkSpend(raw:unknown,actor:Actor,key:string) {
    const input=spendCheckSchema.parse(raw);
    return this.transaction('spend.check',input,actor,key,state=>this.execute(state,'spend.check',input,actor));
  }
  async commitSpend(raw:unknown,actor:Actor,key:string) {
    const input=spendCommitSchema.parse(raw);
    return this.transaction('spend.commit',input,actor,key,state=>this.execute(state,'spend.commit',input,actor));
  }
  private commit(state:EngineState,input:ReturnType<typeof spendCommitSchema.parse>,actor:Actor,approved=false):Result {
      const reservation=state.reservations.find(item=>item.id===input.reservationId);
      if(!reservation) return deny('RESERVATION_NOT_FOUND');
      if(actor.type==='agent'&&actor.id!==reservation.agentId) return deny('ACTOR_MISMATCH');
      if(reservation.status==='committed') {
        if(input.providerReference&&input.providerReference!==reservation.providerReference)return deny('PROVIDER_REFERENCE_CONFLICT');
        return {decision:'allow',status:'already_committed',reservationId:reservation.id,mode:this.mode};
      }
      const gate=this.autonomy(state,'spend.commit',input,actor,['advertising'],fromMinor(reservation.amountMinor),approved);if(gate)return gate;
      if(this.spendUsage(state)>toMinor(state.config.dailyAdSpendCeiling))return deny('DAILY_CEILING_EXCEEDED');
      if(this.monthlySpend(state)>toMinor(this.constitution(state).monthlyAdSpendCeiling))return deny('MONTHLY_CEILING_EXCEEDED');
      if(new Date(reservation.expiresAt)<=this.now()||reservation.day!==DAY(this.now())) {reservation.status='expired';return deny('RESERVATION_EXPIRED');}
      reservation.status='committed';reservation.providerReference=input.providerReference??`sim_${reservation.id}`;reservation.revision=(reservation.revision??1)+1;
      return {decision:'allow',status:'committed',reservationId:reservation.id,amount:fromMinor(reservation.amountMinor),mode:this.mode};
  }
  private margin(state:EngineState,input:ReturnType<typeof marginCheckSchema.parse>):Result {
    const price=toMinor(input.sellingPrice),cost=toMinor(input.landedCost)+toMinor(input.estimatedCac),floorBps=Math.round(state.config.marginFloor*10000);
    const allowed=(price-cost)*10000>=price*floorBps;
    return {decision:allowed?'allow':'deny',...(allowed?{}:{reason:'MARGIN_BELOW_FLOOR'}),marginPct:(price-cost)/price,floor:state.config.marginFloor};
  }
  async checkMargin(raw:unknown) {return this.margin(await this.snapshot(),marginCheckSchema.parse(raw));}
  private publish(state:EngineState,productId:string,sellingPrice?:number):Result {
    const product=state.products.find(item=>item.id===productId);if(!product) return deny('PRODUCT_NOT_FOUND');
    const price=sellingPrice??product.price;
    const restricted=this.productRestriction(state,product);if(restricted)return restricted;
    if(Math.abs(toMinor(price)-toMinor(product.price))*100>toMinor(product.price)*this.constitution(state).maxPriceChangePct)return deny('PRICE_CHANGE_LIMIT_EXCEEDED');
    const decision=this.margin(state,{sku:product.sku,sellingPrice:price,landedCost:product.landedCost,estimatedCac:product.estimatedCac,currency:'USD'});
    if(decision.decision!=='allow') return decision;
    const before=structuredClone(product);product.price=price;product.margin=decision.marginPct as number;product.status='active';product.revision=(product.revision??1)+1;
    return {...decision,product:structuredClone(product),before,after:structuredClone(product),status:'published',mode:this.mode};
  }
  async publishListing(raw:unknown,actor:Actor,key:string) {const input=listingSchema.parse(raw);return this.transaction('listing.publish',input,actor,key,state=>this.execute(state,'listing.publish',input,actor));}
  private launch(state:EngineState,input:ReturnType<typeof campaignSchema.parse>,actor:Actor):Result {
    if(state.campaigns.some(item=>item.campaignId===input.campaignId))return deny('CAMPAIGN_ALREADY_LAUNCHED');
    const reserved=this.reserve(state,input,actor);if(reserved.decision!=='allow')return reserved;
    const reservation=state.reservations.find(item=>item.id===reserved.reservationId)!;
    reservation.status='committed';reservation.providerReference=`sim_campaign_${randomUUID()}`;
    state.campaigns.push({campaignId:input.campaignId,amount:input.requestedAmount,status:'active',revision:1,createdAt:this.now().toISOString(),providerReference:reservation.providerReference});
    return {...reserved,status:'launched',providerReference:reservation.providerReference,mode:this.mode};
  }
  async launchCampaign(raw:unknown,actor:Actor,key:string) {const input=campaignSchema.parse(raw);return this.transaction('campaign.launch',input,actor,key,state=>this.execute(state,'campaign.launch',input,actor));}
  private refund(state:EngineState,orderId:string,amount:number):Result {
    const order=state.orders.find(item=>item.id===orderId);if(!order)return deny('ORDER_NOT_FOUND');
    if(order.status==='payment_failed')return deny('ORDER_NOT_REFUNDABLE');
    const amountMinor=toMinor(amount);
    if(toMinor(order.refunded)+amountMinor>toMinor(order.total))return deny('REFUND_EXCEEDS_ORDER_BALANCE');
    const refundId=`sim_refund_${randomUUID()}`;
    const before=structuredClone(order);state.refunds.push({id:refundId,orderId,amountMinor});order.refunded=fromMinor(toMinor(order.refunded)+amountMinor);order.status=order.refunded===order.total?'refunded':'partially_refunded';order.revision=(order.revision??1)+1;
    return {decision:'allow',refundId,amount,orderId,before,after:structuredClone(order),status:'refunded',mode:this.mode};
  }
  async evaluateRefund(raw:unknown,actor:Actor,key:string) {
    const input=refundSchema.parse(raw);
    return this.transaction('refunds.evaluate',input,actor,key,state=>this.execute(state,'refunds.evaluate',input,actor));
  }
  private owner(actor:Actor) {if(actor.type!=='owner')throw new GuardrailError('OWNER_REQUIRED','This operation requires an authenticated owner.',403);}
  async resolveInterrupt(id:string,raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=resolveSchema.parse(raw);
    if(input.resolvedBy&&input.resolvedBy!==actor.id)throw new GuardrailError('ACTOR_MISMATCH','resolvedBy must match the authenticated owner.',403);
    return this.transaction('interrupt.resolve',{id,...input},actor,key,async state=>{
      const item=state.interrupts.find(entry=>entry.id===id);if(!item)throw new GuardrailError('INTERRUPT_NOT_FOUND','Interrupt does not exist.',404);
      if(item.status!=='pending')return deny('INTERRUPT_ALREADY_RESOLVED');
      let execution:Result={decision:'deny',reason:'OWNER_REJECTED'};
      if(input.decision!=='reject') {
        const blocked=await this.block(state);if(blocked)return blocked;
        if(input.decision==='modify'&&!input.modifiedPayload)throw new GuardrailError('MODIFIED_PAYLOAD_REQUIRED','Supply the modified values.');
        const original=(item.payload.request??item.payload) as Result,changes=input.decision==='modify'?input.modifiedPayload??{}:{};
        for(const field of ['orderId','productId','campaignId','reservationId'])if(changes[field]!==undefined&&changes[field]!==original[field])throw new GuardrailError(field==='orderId'?'ORDER_IMMUTABLE':field==='productId'?'PRODUCT_IMMUTABLE':'RESOURCE_IMMUTABLE','An approval cannot change its target resource.');
        let operation=String(item.payload.operation??''),request:Result,executionActor=actor;
        if(item.payload.legacyReviewRequired) {
          if(!input.reviewLegacy||input.expectedConstitutionVersion===undefined||((original.productId||original.orderId)&&input.expectedRevision===undefined))return deny('LEGACY_REVIEW_REQUIRED',{interruptId:id,reviewRequired:true,currentConstitutionVersion:this.constitution(state).version});
          const context={expectedConstitutionVersion:input.expectedConstitutionVersion,expectedRevision:input.expectedRevision,expectedOrderRevision:input.expectedOrderRevision};
          if(item.category==='refund_escrow'){operation='refunds.evaluate';request=refundSchema.parse({orderId:original.orderId,amount:original.amount,currency:original.currency,reasonCode:original.reasonCode,requestedBy:'support_agent',...context});}
          else if(item.category==='spend'){operation='campaign.launch';request=campaignSchema.parse({agentId:'marketing_agent',campaignId:original.campaignId,requestedAmount:original.requestedAmount,currency:original.currency,...context});}
          else if(item.category==='margin'){operation='listing.publish';request=listingSchema.parse({productId:original.productId,sellingPrice:original.sellingPrice,...context});}
          else return deny('LEGACY_ACTION_UNSUPPORTED');
        } else {
          if(item.payload.constitutionVersion!==this.constitution(state).version)return deny('CONSTITUTION_CHANGED',{replan:true,currentConstitutionVersion:this.constitution(state).version,interruptId:id});
          request=structuredClone(original);executionActor=item.payload.actor as Actor;
          if(!executionActor||!['agent','owner'].includes(executionActor.type))return deny('PROPOSAL_INVALID');
        }
        const mutable:Record<string,string[]>={'refunds.evaluate':['amount','reasonCode'],'listing.publish':['sellingPrice'],'campaign.launch':['requestedAmount'],'spend.check':['requestedAmount'],'supplier.order':['quantity'],'spend.commit':[],'campaign.pause':[]};
        const unexpected=Object.keys(changes).filter(field=>!mutable[operation]?.includes(field)&&!['orderId','productId','campaignId','reservationId'].includes(field));
        if(unexpected.length)throw new GuardrailError('APPROVAL_FIELDS_IMMUTABLE','Only operation-specific action values may be modified.',400,{fields:unexpected});
        request={...request,...changes};
        execution=await this.execute(state,operation,request,executionActor,true);
        if(execution.decision!=='allow')return {...execution,interruptId:id,status:'pending'};
      }
      item.status=input.decision==='approve'?'approved':input.decision==='reject'?'rejected':'modified';item.resolvedAt=this.now().toISOString();item.resolvedBy=actor.id;item.resolutionNote=input.note;item.execution=execution;
      if(input.decision==='modify')item.payload={...item.payload,...input.modifiedPayload};
      return {status:'resolved',interruptId:id,threadId:item.threadId,resumedThreadId:item.threadId,ownerDecision:input.decision,execution,mode:this.mode};
    });
  }
  async setPause(paused:boolean,raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=pauseSchema.parse(raw??{});
    return this.transaction(paused?'pause.engage':'pause.release',input,actor,key,async state=>{
      if(!paused) {let kill:KillState;try {kill=await this.killState();} catch(error) {return deny((error as GuardrailError).code);}if(kill.engaged)return deny('KILL_SWITCH_ENGAGED');}
      state.paused=paused;state.pauseReason=paused?(input.reason??'Paused by the owner'):null;
      return {status:paused?'paused':'running',paused,mode:this.mode};
    });
  }
  async updateConfig(raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=configPatchSchema.parse(raw);
    return this.transaction('guardrails.config',input,actor,key,state=>{
      if(input.dailyAdSpendCeiling!==undefined&&toMinor(input.dailyAdSpendCeiling)<this.spendUsage(state))return deny('CEILING_BELOW_COMMITTED_AND_RESERVED_SPEND');
      const before=structuredClone(this.constitution(state));
      const {currency:_currency,...values}=input;
      const next=constitutionSchema.parse({...before,...values,version:before.version+1,updatedAt:this.now().toISOString()});
      this.saveConstitution(state,next,actor,'Owner updated legacy guardrail controls');
      return {config:state.config,constitution:next,before,after:next,status:'updated',mode:this.mode};
    });
  }
  private saveConstitution(state:EngineState,next:BusinessConstitution,actor:Actor,reason:string,preservePilotApproval=false) {
    if(next.pilot?.approval&&!preservePilotApproval)delete next.pilot.approval;
    state.constitution=next;state.config={dailyAdSpendCeiling:next.dailyAdSpendCeiling,marginFloor:next.marginFloor,autoRefundThreshold:next.autoRefundThreshold,currency:'USD'};
    (state.constitutionHistory??=[]).push({version:next.version,constitution:structuredClone(next),changedAt:next.updatedAt,changedBy:actor.id,reason});
    for(const item of state.interrupts)if(item.status==='pending'&&!item.payload.legacyReviewRequired){item.status='expired';item.resolvedAt=this.now().toISOString();item.resolutionNote='Business Constitution changed; prepare a new proposal under the current version.';}
  }
  async updateConstitution(raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=constitutionPatchSchema.parse(raw);
    return this.transaction('constitution.update',input,actor,key,state=>{
      const before=structuredClone(this.constitution(state));
      if(input.expectedVersion!==before.version)return deny('CONSTITUTION_CHANGED',{replan:true,currentConstitutionVersion:before.version});
      const {expectedVersion:_expectedVersion,reason,domains:domainChanges,pilotDraft,...fields}=input;
      const domains=structuredClone(before.domains);
      if(fields.mode&&fields.mode!=='CUSTOM')for(const domain of autonomyDomains)domains[domain].mode=fields.mode;
      for(const domain of autonomyDomains)if(domainChanges?.[domain])domains[domain]={...domains[domain],...domainChanges[domain]};
      const next=constitutionSchema.parse({...before,...fields,domains,pilot:pilotDraft?{draft:pilotDraft}:before.pilot,
        version:before.version+1,updatedAt:this.now().toISOString()});
      if(domainChanges&&!fields.mode)next.mode='CUSTOM';
      if(next.mode!=='CUSTOM'&&autonomyDomains.some(domain=>next.domains[domain].mode!==next.mode))next.mode='CUSTOM';
      if(toMinor(next.dailyAdSpendCeiling)<this.spendUsage(state))return deny('CEILING_BELOW_COMMITTED_AND_RESERVED_SPEND');
      if(toMinor(next.monthlyAdSpendCeiling)<this.monthlySpend(state))return deny('MONTHLY_CEILING_BELOW_COMMITTED_AND_RESERVED_SPEND');
      if(next.permittedCountries.some(country=>next.prohibitedCountries.includes(country)))return deny('COUNTRY_POLICY_CONFLICT');
      this.saveConstitution(state,next,actor,reason);
      return {decision:'allow',status:'updated',constitution:next,before,after:next,mode:this.mode};
    });
  }
  async approvePilot(raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=pilotApprovalRequestSchema.parse(raw);
    return this.transaction('constitution.pilot-approved',input,actor,key,state=>{
      const before=structuredClone(this.constitution(state));
      if(input.expectedVersion!==before.version)return deny('CONSTITUTION_CHANGED',{replan:true,currentConstitutionVersion:before.version});
      const failure=this.pilotDraftFailure(before);if(failure)return deny(failure);
      const next=constitutionSchema.parse({...before,version:before.version+1,updatedAt:this.now().toISOString(),
        pilot:{draft:before.pilot!.draft,approval:{approvedBy:actor.id,approvedAt:this.now().toISOString(),
          constitutionVersion:before.version+1,draftDigest:digest(before.pilot!.draft)}}});
      this.saveConstitution(state,next,actor,input.reason,true);
      return {decision:'allow',status:'approved',constitution:next,before,after:next};
    });
  }
  async createProduct(raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=productCreateSchema.parse(raw);
    return this.transaction('product.create',input,actor,key,async state=>{
      const blocked=await this.block(state);if(blocked)return blocked;
      const context=this.context(state,input,actor,'product.create');if(context)return context;
      if(state.products.some(p=>p.sku.toLowerCase()===input.sku.toLowerCase()))return deny('SKU_ALREADY_EXISTS');
      const restricted=this.productRestriction(state,input);if(restricted)return restricted;
      const margin=this.margin(state,{sku:input.sku,sellingPrice:input.price,landedCost:input.landedCost,estimatedCac:input.estimatedCac,currency:'USD'});
      if(input.status==='active'&&margin.decision!=='allow')return margin;
      const {expectedConstitutionVersion:_version,reason:_reason,...fields}=input;
      const product={...fields,id:`prod-${randomUUID()}`,revision:1,margin:margin.marginPct as number,image:'/products/organizer.svg',color:'#dce4dc',orders:0,revenue:0};
      state.products.push(product);
      return {decision:'allow',status:'created',product,before:null,after:product,mode:this.mode};
    });
  }
  async updateProduct(id:string,raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=productUpdateSchema.parse(raw);
    return this.transaction('product.update',{id,...input},actor,key,async state=>{
      const blocked=await this.block(state);if(blocked)return blocked;
      const context=this.context(state,{...input,productId:id},actor,'product.update');if(context)return context;
      const product=state.products.find(p=>p.id===id)!;
      const {expectedConstitutionVersion:_version,expectedRevision:_revision,reason:_reason,...changes}=input;
      const before=structuredClone(product),next={...product,...changes,revision:(product.revision??1)+1};
      const restriction=this.productRestriction(state,next);if(restriction)return restriction;
      if(Math.abs(toMinor(next.price)-toMinor(product.price))*100>toMinor(product.price)*this.constitution(state).maxPriceChangePct)return deny('PRICE_CHANGE_LIMIT_EXCEEDED');
      const margin=this.margin(state,{sku:next.sku,sellingPrice:next.price,landedCost:next.landedCost,estimatedCac:next.estimatedCac,currency:'USD'});
      if(next.status==='active'&&margin.decision!=='allow')return margin;
      next.margin=margin.marginPct as number;Object.assign(product,next);this.supersede(state,id);
      return {decision:'allow',status:'updated',product,before,after:structuredClone(product),mode:this.mode};
    });
  }
  async pauseCampaign(id:string,raw:unknown,actor:Actor,key:string) {
    this.owner(actor);const input=campaignPauseSchema.parse(raw);
    return this.transaction('campaign.pause',{campaignId:id,...input},actor,key,state=>this.execute(state,'campaign.pause',{campaignId:id,...input},actor));
  }
  async operatingState() {
    const state=await this.snapshot();
    return {constitution:state.constitution,proposals:state.interrupts,resourceRevisions:{products:Object.fromEntries(state.products.map(p=>[p.id,p.revision])),orders:Object.fromEntries(state.orders.map(o=>[o.id,o.revision])),campaigns:Object.fromEntries(state.campaigns.map(c=>[String(c.campaignId),c.revision]))},mode:this.mode,paused:state.paused,campaigns:state.campaigns};
  }
  async placeSupplierOrder(raw:unknown,actor:Actor,key:string) {
    const input=supplierOrderSchema.parse(raw);
    return this.transaction('supplier.order',input,actor,key,state=>this.execute(state,'supplier.order',input,actor));
  }
  async checkout(raw:unknown,actor:Actor,key:string) {
    const input=checkoutSchema.parse(raw);
    return this.transaction('commerce.checkout',input,actor,key,async state=>{
      const blocked=await this.block(state);if(blocked)return blocked;
      const c=this.constitution(state);
      if(c.permittedCountries.length||c.prohibitedCountries.length){if(!input.destinationCountry)return deny('DESTINATION_COUNTRY_REQUIRED');if(c.prohibitedCountries.includes(input.destinationCountry)||c.permittedCountries.length&&!c.permittedCountries.includes(input.destinationCountry))return deny('COUNTRY_NOT_PERMITTED');}
      const quantities=new Map<string,number>();for(const line of input.items)quantities.set(line.productId,(quantities.get(line.productId)??0)+line.quantity);
      const items:CommerceOrder['items']=[];
      for(const [id,quantity] of quantities) {
        if(quantity>20)return deny('ITEM_QUANTITY_LIMIT_EXCEEDED',{productId:id,maximum:20});
        const product=state.products.find(item=>item.id===id&&item.status==='active');if(!product)return deny('PRODUCT_NOT_AVAILABLE',{productId:id});
        const restricted=this.productRestriction(state,product);if(restricted)return restricted;
        if(quantity>product.inventory)return deny('INSUFFICIENT_INVENTORY',{productId:id});
        const margin=this.margin(state,{sku:product.sku,sellingPrice:product.price,landedCost:product.landedCost,estimatedCac:product.estimatedCac,currency:'USD'});if(margin.decision!=='allow')return margin;
        items.push({productId:id,name:product.name,quantity,price:product.price});
      }
      const total=fromMinor(items.reduce((sum,item)=>sum+toMinor(item.price)*item.quantity,0));
      const order:CommerceOrder={id:`ORD-${randomUUID().slice(0,8).toUpperCase()}`,revision:1,customer:input.customer,items,total,refunded:0,status:'processing',createdAt:this.now().toISOString(),tracking:null};
      for(const line of items) {const product=state.products.find(item=>item.id===line.productId)!;product.inventory-=line.quantity;product.orders+=line.quantity;product.revision=(product.revision??1)+1;product.revenue=fromMinor(toMinor(product.revenue)+toMinor(line.price)*line.quantity);this.supersede(state,product.id);}
      state.orders.unshift(order);state.baseRevenue=fromMinor(toMinor(state.baseRevenue)+toMinor(total));state.baseOrders++;
      return {decision:'allow',order,mode:this.mode,paymentStatus:'simulated',message:'Simulation order created. No payment was charged.'};
    });
  }
  async commerceEvent(raw:unknown,actor:Actor,key:string) {
    const input=commerceEventSchema.parse(raw);
    return this.transaction('commerce.event',input,actor,key,async state=>{
      const blocked=await this.block(state);if(blocked)return blocked;
      const order=state.orders.find(item=>item.id===input.orderId);if(!order)return deny('ORDER_NOT_FOUND');
      if(state.commerceEvents.includes(input.eventId)) {
        const previous=state.audit.find(entry=>entry.eventType==='commerce.event'&&(entry.payload.request as {eventId?:string}|undefined)?.eventId===input.eventId);
        if(!previous||digest(previous.payload.request)!==digest(input))return deny('COMMERCE_EVENT_CONFLICT');
        return {status:'already_processed',eventId:input.eventId,mode:this.mode};
      }
      if(input.type==='payment.confirmed') {
        if(!['processing','payment_failed'].includes(order.status))return deny('ORDER_TRANSITION_DENIED');
        order.status='processing';
      }
      if(input.type==='payment.failed') {
        if(!['processing','payment_failed'].includes(order.status)||state.supplierOrders.some(item=>item.orderId===order.id))return deny('ORDER_TRANSITION_DENIED');
        order.status='payment_failed';
      }
      if(input.type==='fulfillment.updated') {
        if(!['processing','shipped'].includes(order.status))return deny('ORDER_TRANSITION_DENIED');
        order.status='shipped';order.tracking=input.tracking??order.tracking;
      }
      order.revision=(order.revision??1)+1;this.supersede(state,order.id);
      state.commerceEvents.push(input.eventId);return {status:'processed',orderId:order.id,eventId:input.eventId,mode:this.mode};
    });
  }
  async recordRunEvent(raw:unknown,actor:Actor,key:string) {
    const input=runEventSchema.parse(raw);
    return this.transaction('run.event',input,actor,key,state=>{
      if(actor.type==='agent'&&input.agentId&&input.agentId!==actor.id)return deny('ACTOR_MISMATCH');
      const runs=state.runs??=[];
      let run=runs.find(item=>item.runId===input.runId);
      if(!run) {run={runId:input.runId,threadId:input.runId,cycle:input.cycle,startedAt:this.now().toISOString()};runs.unshift(run);}
      Object.assign(run,{status:input.status,summary:input.summary??'',updatedAt:this.now().toISOString()});
      if(['completed','halted','failed'].includes(input.status))run.endedAt=this.now().toISOString();
      if(input.agentId) {const agent=state.agents.find(item=>item.id===input.agentId);if(agent) {agent.lastActive=this.now().toISOString();agent.actionsToday++;agent.currentTask=input.summary??agent.currentTask;agent.status=input.status==='running'?'working':input.status==='interrupted'?'waiting':'idle';}}
      if(['completed','halted','failed'].includes(input.status))for(const agent of state.agents)if(agent.status==='working'){agent.status='idle';agent.currentTask='Available for an owner-started operating cycle';}
      return {status:'recorded',runId:input.runId,mode:this.mode};
    });
  }
  async telemetry() {
    const state=await this.snapshot();let kill:KillState;let killReachable=true;
    try {kill=await this.killState();} catch {kill={engaged:false};killReachable=false;}
    const status=kill.engaged?'killed':state.paused?'paused':killReachable?'running':'unavailable';
    const spend=fromMinor(this.spendUsage(state));
    const weights=[0.61,0.52,0.68,0.59,0.8,0.71,0.94,0.83,0.91,0.74,0.96,0.87,1.12,1.01];
    const chart=weights.map((weight,index)=>{const date=new Date(this.now().getTime()-(13-index)*86400000);return {date:DAY(date),label:date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),revenue:Math.round(1840*weight),spend:Math.round(67*weight)};});
    const activeRun=state.runs?.some(run=>run.status==='running'&&this.now().getTime()-new Date(String(run.updatedAt)).getTime()<120_000);
    const agents=state.agents.map(item=>({...item,status:status!=='running'?'paused':item.status==='working'&&!activeRun?'idle':item.status,currentTask:item.status==='working'&&!activeRun?'No currently active run':item.currentTask}));
    return {mode:this.mode,status,paused:state.paused,pauseReason:state.pauseReason,killSwitch:{...kill,reachable:killReachable},metrics:{revenue:state.baseRevenue,revenueChange:18.6,orders:state.baseOrders,ordersChange:12.4,margin:0.462,marginChange:0.024,adSpend:spend,adSpendCeiling:state.config.dailyAdSpendCeiling,activeAgents:agents.filter(item=>item.status==='working').length,pendingInterrupts:state.interrupts.filter(item=>item.status==='pending').length},chart,agents,products:state.products,orders:state.orders,activity:state.audit.slice(-30).reverse(),config:state.config,constitution:state.constitution,interrupts:state.interrupts,updatedAt:this.now().toISOString()};
  }
}
export async function createEngine(options:EngineOptions={}) {return new GuardrailEngine(options).initialize();}
