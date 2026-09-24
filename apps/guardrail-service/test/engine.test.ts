import { mkdtemp, open, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@hotl/schemas';
import { createLedgerFixture as createEngine } from './policy-fixture.js';
vi.mock('node:fs/promises',async importOriginal=>{
  const actual=await importOriginal<typeof import('node:fs/promises')>();
  return {...actual,open:vi.fn(actual.open)};
});
const owner:Actor={type:'owner',id:'owner-test'};
const marketing:Actor={type:'agent',id:'marketing_agent'};
const support:Actor={type:'agent',id:'support_agent'};
const spend=(amount:number)=>({campaignId:'camp-test',agentId:'marketing_agent',requestedAmount:amount,currency:'USD'});
const directories:string[]=[];
afterEach(async()=>{for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});

describe('deterministic guardrails and atomic ledger',()=>{
  it('rejects owner configuration that weakens the fixed margin or refund safety boundaries',async()=>{
    const engine=await createEngine();
    await expect(engine.updateConfig({marginFloor:0.39},owner,'weaken-margin')).rejects.toThrow();
    await expect(engine.updateConfig({autoRefundThreshold:26},owner,'weaken-refund')).rejects.toThrow();
    expect((await engine.snapshot()).config).toMatchObject({marginFloor:0.4,autoRefundThreshold:25});
  });
  it('reserves budget atomically across racing requests and commits exactly once',async()=>{
    const engine=await createEngine({seed:false});
    const results=await Promise.all(Array.from({length:10},(_,index)=>engine.checkSpend(spend(25),marketing,`race-${index}`)));
    expect(results.filter(item=>item.decision==='allow')).toHaveLength(4);
    expect(results.filter(item=>item.reason==='DAILY_CEILING_EXCEEDED')).toHaveLength(6);
    const reservationId=results.find(item=>item.decision==='allow')!.reservationId;
    const commit=await engine.commitSpend({reservationId},marketing,'commit');
    expect(commit.status).toBe('committed');
    expect(await engine.commitSpend({reservationId},marketing,'commit')).toEqual(commit);
    expect((await engine.commitSpend({reservationId},marketing,'commit-again')).status).toBe('already_committed');
    expect((await engine.telemetry()).metrics.adSpend).toBe(100);
    expect((await engine.snapshot()).reservations.filter(item=>item.status==='committed')).toHaveLength(1);
  });
  it('rejects missing keys, conflicting payloads, and spoofed identities',async()=>{
    const engine=await createEngine({seed:false});
    await expect(engine.checkSpend(spend(10),marketing,'')).rejects.toMatchObject({code:'IDEMPOTENCY_KEY_REQUIRED'});
    await engine.checkSpend(spend(10),marketing,'same');
    await expect(engine.checkSpend(spend(20),marketing,'same')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    expect((await engine.checkSpend(spend(10),support,'spoof')).reason).toBe('ACTOR_MISMATCH');
    const result=await engine.checkSpend(spend(1),marketing,'__proto__');
    expect(await engine.checkSpend(spend(1),marketing,'__proto__')).toEqual(result);
  });
  it('uses cents without fractional input or negative amount bypasses',async()=>{
    const engine=await createEngine({seed:false});
    for(const amount of [-25,NaN,Infinity,0,0.001])await expect(engine.checkSpend(spend(amount),marketing,`invalid-${amount}`)).rejects.toBeDefined();
    expect((await engine.checkSpend(spend(99.99),marketing,'99')).remainingDailyBudget).toBe(0.01);
    expect((await engine.checkSpend(spend(0.01),marketing,'01')).remainingDailyBudget).toBe(0);
    expect((await engine.checkSpend(spend(0.01),marketing,'over')).decision).toBe('deny');
  });
  it('expires uncommitted reservations and prevents yesterday reservations committing today',async()=>{
    let now=new Date('2026-09-07T12:00:00Z');
    const engine=await createEngine({seed:false,now:()=>now});
    const reservation=await engine.checkSpend(spend(100),marketing,'r1');
    now=new Date('2026-09-07T12:16:00Z');
    expect((await engine.commitSpend({reservationId:reservation.reservationId},marketing,'expired')).reason).toBe('RESERVATION_EXPIRED');
    expect((await engine.checkSpend(spend(100),marketing,'r2')).decision).toBe('allow');
  });
  it('enforces the exact 40% margin boundary without rounding toward permission',async()=>{
    const engine=await createEngine();
    const input={sku:'test',sellingPrice:100,landedCost:50,estimatedCac:10,currency:'USD'};
    expect((await engine.checkMargin(input)).decision).toBe('allow');
    expect((await engine.checkMargin({...input,estimatedCac:10.01})).reason).toBe('MARGIN_BELOW_FLOOR');
    expect((await engine.publishListing({productId:'prod-06'},owner,'publish')).reason).toBe('MARGIN_BELOW_FLOOR');
    expect((await engine.snapshot()).products.find(item=>item.id==='prod-06')?.status).toBe('held');
  });
  it('automatically refunds $25, escalates $25.01, and prevents split-refund threshold bypass',async()=>{
    const engine=await createEngine();
    const refund=(amount:number,orderId='ORD-1030')=>({orderId,amount,currency:'USD',reasonCode:'damaged',requestedBy:'support_agent'});
    expect((await engine.evaluateRefund(refund(25),support,'small')).decision).toBe('allow');
    expect((await engine.evaluateRefund(refund(1),support,'split')).decision).toBe('escalated');
    expect((await engine.evaluateRefund(refund(25.01,'ORD-1033'),support,'large')).decision).toBe('escalated');
    expect((await engine.snapshot()).refunds).toHaveLength(1);
  });
  it('executes an owner-approved refund once and rejects changing its order',async()=>{
    const engine=await createEngine();
    await expect(engine.resolveInterrupt('int-refund-1029',{decision:'approve'},support,'not-owner')).rejects.toMatchObject({code:'OWNER_REQUIRED'});
    await expect(engine.resolveInterrupt('int-refund-1029',{decision:'modify',modifiedPayload:{orderId:'ORD-1033'}},owner,'swap')).rejects.toMatchObject({code:'ORDER_IMMUTABLE'});
    const result=await engine.resolveInterrupt('int-refund-1029',{decision:'approve',note:'Verified damage'},owner,'approve');
    expect(result.status).toBe('resolved');
    expect(await engine.resolveInterrupt('int-refund-1029',{decision:'approve',note:'Verified damage'},owner,'approve')).toEqual(result);
    expect((await engine.resolveInterrupt('int-refund-1029',{decision:'approve'},owner,'twice')).reason).toBe('INTERRUPT_ALREADY_RESOLVED');
    expect((await engine.snapshot()).orders.find(item=>item.id==='ORD-1029')?.refunded).toBe(42);
    expect((await engine.evaluateRefund({orderId:'ORD-1029',amount:8,currency:'USD',reasonCode:'damaged'},support,'over-refund')).reason).toBe('REFUND_EXCEEDS_ORDER_BALANCE');
  });
  it('never lets owner approval bypass budget or margin, but permits safe modified values',async()=>{
    const engine=await createEngine();
    expect((await engine.resolveInterrupt('int-spend-01',{decision:'approve'},owner,'spend-approve')).reason).toBe('DAILY_CEILING_EXCEEDED');
    expect((await engine.resolveInterrupt('int-margin-01',{decision:'approve'},owner,'margin-approve')).reason).toBe('MARGIN_BELOW_FLOOR');
    expect((await engine.resolveInterrupt('int-spend-01',{decision:'modify',modifiedPayload:{requestedAmount:30}},owner,'spend-adjust')).status).toBe('resolved');
    expect((await engine.resolveInterrupt('int-margin-01',{decision:'modify',modifiedPayload:{sellingPrice:49}},owner,'margin-adjust')).status).toBe('resolved');
    expect((await engine.telemetry()).metrics.adSpend).toBe(94.2);
  });
  it('halts every execution while paused, when killed, and when emergency status is unavailable',async()=>{
    let killed=false;
    const engine=await createEngine({killSwitchReader:async()=>({engaged:killed})});
    await engine.setPause(true,{reason:'Review'},owner,'pause');
    expect((await engine.launchCampaign(spend(1),marketing,'paused-campaign')).reason).toBe('SYSTEM_PAUSED');
    expect((await engine.publishListing({productId:'prod-01'},owner,'paused-listing')).reason).toBe('SYSTEM_PAUSED');
    expect((await engine.evaluateRefund({orderId:'ORD-1033',amount:5,reasonCode:'test'},support,'paused-refund')).reason).toBe('SYSTEM_PAUSED');
    await engine.setPause(false,{},owner,'resume');killed=true;
    expect((await engine.checkSpend(spend(1),marketing,'killed')).reason).toBe('KILL_SWITCH_ENGAGED');
    expect((await engine.setPause(false,{},owner,'un-kill')).reason).toBe('KILL_SWITCH_ENGAGED');
    const offline=await createEngine({killSwitchReader:async()=>{throw new Error('offline');}});
    expect((await offline.checkSpend(spend(1),marketing,'offline')).reason).toBe('KILL_SWITCH_UNAVAILABLE');
  });
  it('persists idempotency and verifies the append-only hash chain after restart',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'hotl-guardrails-'));directories.push(directory);const filePath=join(directory,'state.json');
    const engine=await createEngine({filePath,seed:false});
    const result=await engine.checkSpend(spend(20),marketing,'persistent-key');
    const restarted=await createEngine({filePath,seed:false});
    expect(await restarted.checkSpend(spend(20),marketing,'persistent-key')).toEqual(result);
    expect((await restarted.snapshot()).audit.map(item=>item.eventType)).toEqual(['simulation.initialized','workspace.file-initialized','constitution.update','spend.check']);
    const saved=JSON.parse(await readFile(filePath,'utf8'));saved.audit[0].payload.mode='tampered';await writeFile(filePath,JSON.stringify(saved));
    await expect(createEngine({filePath})).rejects.toMatchObject({code:'AUDIT_INTEGRITY_FAILED'});
  });
  it.each(['written','initialized','snapshot'] as const)('denies reads, writes, and historical replays after %s state disappears',async source=>{
    const directory=await mkdtemp(join(tmpdir(),'hotl-guardrails-missing-'));directories.push(directory);
    const filePath=join(directory,'state.json');
    const writer=await createEngine({filePath,seed:false});
    const observer=await createEngine({filePath,seed:false});
    await writer.checkSpend(spend(20),marketing,'before-loss');
    const engine=source==='written'?writer:source==='initialized'?await createEngine({filePath,seed:false}):observer;
    if(source==='snapshot')await engine.snapshot();
    await unlink(filePath);
    await expect(engine.snapshot()).rejects.toMatchObject({code:'STATE_MISSING',statusCode:503});
    await expect(engine.checkSpend(spend(20),marketing,'before-loss')).rejects.toMatchObject({code:'STATE_MISSING',statusCode:503});
    await expect(engine.checkSpend(spend(1),marketing,'after-loss')).rejects.toMatchObject({code:'STATE_MISSING',statusCode:503});
    await expect(engine.initialize()).rejects.toMatchObject({code:'STATE_MISSING',statusCode:503});
    await expect(readFile(filePath)).rejects.toMatchObject({code:'ENOENT'});
  });
  it.each(['EEXIST',...(process.platform==='win32'?['EPERM','EACCES','EBUSY']:[])])('denies %s lock contention without changing state or removing the lock',async code=>{
    const directory=await mkdtemp(join(tmpdir(),'hotl-guardrails-lock-'));directories.push(directory);
    const filePath=join(directory,'state.json'),lockPath=`${filePath}.lock`;
    const engine=await createEngine({filePath,seed:false});
    await engine.checkSpend(spend(20),marketing,'before-contention');
    const before=await readFile(filePath,'utf8');
    await writeFile(lockPath,'other-writer');
    vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('Lock unavailable'),{code}));
    await expect(engine.checkSpend(spend(1),marketing,'after-contention')).rejects.toMatchObject({code:'STATE_BUSY',statusCode:503});
    expect(await readFile(filePath,'utf8')).toBe(before);
    expect(await readFile(lockPath,'utf8')).toBe('other-writer');
    await unlink(lockPath);
    expect((await engine.checkSpend(spend(1),marketing,'after-contention')).decision).toBe('allow');
    expect((await engine.telemetry()).metrics.adSpend).toBe(21);
  });
  it('uses catalog prices, handles duplicate cart lines, and prevents double supplier orders',async()=>{
    const engine=await createEngine();
    const cart={items:[{productId:'prod-02',quantity:1},{productId:'prod-02',quantity:2}],customer:{name:'Test Customer',email:'test@example.com'}};
    const result=await engine.checkout(cart,owner,'cart');
    const order=result.order as {id:string;total:number;items:unknown[]};expect(order.total).toBe(102);expect(order.items).toHaveLength(1);
    expect(await engine.checkout(cart,owner,'cart')).toEqual(result);
    expect((await engine.snapshot()).products.find(item=>item.id==='prod-02')?.inventory).toBe(243);
    await expect(engine.checkout({...cart,total:1},owner,'price-tamper')).rejects.toBeDefined();
    const payload={productId:'prod-02',orderId:order.id,quantity:3};
    expect((await engine.placeSupplierOrder(payload,owner,'po')).decision).toBe('allow');
    expect((await engine.placeSupplierOrder(payload,owner,'po-again')).reason).toBe('SUPPLIER_ORDER_ALREADY_PLACED');
  });
  it('fails closed for all live financial mutations even with valid owner authorization',async()=>{
    const engine=await createEngine({mode:'live'});
    expect((await engine.checkSpend(spend(1),owner,'live')).reason).toBe('LIVE_ADAPTERS_UNAVAILABLE');
    expect((await engine.publishListing({productId:'prod-01'},owner,'live-list')).reason).toBe('LIVE_ADAPTERS_UNAVAILABLE');
    expect((await engine.checkout({items:[{productId:'prod-01',quantity:1}],customer:{name:'Test User',email:'test@example.com'}},owner,'live-checkout')).reason).toBe('LIVE_ADAPTERS_UNAVAILABLE');
  });
  it('keeps historic responses and audit payloads immutable after later order mutations',async()=>{
    const engine=await createEngine();
    const cart={items:[{productId:'prod-02',quantity:1}],customer:{name:'Audit Test',email:'audit@example.com'}};
    const placed=await engine.checkout(cart,owner,'immutable-checkout');
    const order=placed.order as {id:string;status:string};
    await engine.placeSupplierOrder({productId:'prod-02',orderId:order.id,quantity:1},owner,'immutable-supplier');
    expect(await engine.checkout(cart,owner,'immutable-checkout')).toEqual(placed);
    const state=await engine.snapshot();expect(state.orders.find(item=>item.id===order.id)?.status).toBe('shipped');
    const historic=state.audit.find(item=>item.eventType==='commerce.checkout')!.payload.result as {order:{status:string}};
    expect(historic.order.status).toBe('processing');
  });
  it('serializes racing refund requests and never duplicates an owner execution',async()=>{
    const engine=await createEngine();
    const request={orderId:'ORD-1030',amount:20,reasonCode:'damage',requestedBy:'support_agent'};
    const results=await Promise.all(Array.from({length:8},(_,index)=>engine.evaluateRefund(request,support,`refund-race-${index}`)));
    expect(results.filter(item=>item.decision==='allow')).toHaveLength(1);
    expect(results.filter(item=>item.reason==='RESOURCE_CHANGED')).toHaveLength(7);
    // Replan from the new order revision after the first refund. Racing proposals
    // with that same current context must share one approval, never execute twice.
    const replanned=await Promise.all(Array.from({length:7},(_,index)=>engine.evaluateRefund(request,support,`replanned-refund-${index}`)));
    expect(replanned.every(item=>item.decision==='escalated')).toBe(true);
    expect(new Set(replanned.map(item=>item.interruptId)).size).toBe(1);
    const interruptId=replanned[0]!.interruptId as string;
    expect((await engine.evaluateRefund({...request,amount:21},support,'conflicting-pending-refund')).reason).toBe('REFUND_ALREADY_PENDING');
    const approvals=await Promise.all(Array.from({length:6},(_,index)=>engine.resolveInterrupt(interruptId,{decision:'approve'},owner,`approve-race-${index}`)));
    expect(approvals.filter(item=>item.status==='resolved')).toHaveLength(1);
    expect((await engine.snapshot()).orders.find(item=>item.id==='ORD-1030')?.refunded).toBe(40);
  });
  it('denies every financial execution during pause, kill, and unavailable emergency state',async()=>{
    for(const reason of ['SYSTEM_PAUSED','KILL_SWITCH_ENGAGED','KILL_SWITCH_UNAVAILABLE']) {
      let stop=false;
      const engine=await createEngine({killSwitchReader:async()=>{if(stop&&reason==='KILL_SWITCH_UNAVAILABLE')throw new Error('offline');return {engaged:stop&&reason==='KILL_SWITCH_ENGAGED'};}});
      const reservation=await engine.checkSpend(spend(1),marketing,'reserve-before-stop');
      if(reason==='SYSTEM_PAUSED')await engine.setPause(true,{},owner,'stop');else stop=true;
      const attempts=[
        ()=>engine.checkSpend(spend(1),marketing,'stopped-spend'),
        ()=>engine.commitSpend({reservationId:reservation.reservationId},marketing,'stopped-commit'),
        ()=>engine.publishListing({productId:'prod-01'},owner,'stopped-listing'),
        ()=>engine.launchCampaign(spend(1),marketing,'stopped-campaign'),
        ()=>engine.placeSupplierOrder({productId:'prod-02',orderId:'ORD-1030',quantity:2},owner,'stopped-po'),
        ()=>engine.checkout({items:[{productId:'prod-01',quantity:1}],customer:{name:'Stop Test',email:'stop@example.com'}},owner,'stopped-checkout'),
        ()=>engine.commerceEvent({eventId:'stopped-event',type:'payment.confirmed',orderId:'ORD-1030'},owner,'stopped-event'),
        ()=>engine.evaluateRefund({orderId:'ORD-1030',amount:1,reasonCode:'test'},support,'stopped-refund'),
        ()=>engine.resolveInterrupt('int-refund-1029',{decision:'approve'},owner,'stopped-approval')
      ];
      const before=await engine.snapshot();
      for(const attempt of attempts)expect((await attempt()).reason).toBe(reason);
      const after=await engine.snapshot();
      for(const field of ['orders','products','reservations','refunds','campaigns','supplierOrders','commerceEvents','interrupts'] as const)expect(after[field]).toEqual(before[field]);
    }
  });
  it('coordinates independent file-backed engines without losing budget reservations',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'hotl-guardrails-writers-'));directories.push(directory);
    const filePath=join(directory,'state.json');
    const engines=[await createEngine({filePath,seed:false}),await createEngine({filePath,seed:false})];
    const settled=await Promise.allSettled(Array.from({length:10},async(_,index)=>{
      const deadline=Date.now()+8000;
      while(Date.now()<deadline) {
        try {return await engines[index%2]!.checkSpend(spend(25),marketing,`writer-${index}`);}
        catch(error) {if((error as {code:string}).code!=='STATE_BUSY')throw error;await new Promise(resolve=>setTimeout(resolve,20+index*3));}
      }
      throw new Error('Writer never acquired state lock');
    }));
    const failed=settled.find(item=>item.status==='rejected');
    if(failed?.status==='rejected')throw failed.reason;
    const results=settled.map(item=>item.status==='fulfilled'?item.value:undefined);
    expect(results.filter(item=>item?.decision==='allow')).toHaveLength(4);
    expect((await engines[0]!.telemetry()).metrics.adSpend).toBe(100);
    const saved=JSON.parse(await readFile(filePath,'utf8'));saved.audit=[];await writeFile(filePath,JSON.stringify(saved));
    await expect(createEngine({filePath,seed:false})).rejects.toMatchObject({code:'STATE_INVALID'});
  },15000);
  it('rejects duplicate launches, conflicting committed references, and reused webhook event IDs',async()=>{
    const engine=await createEngine();
    expect((await engine.launchCampaign(spend(1),marketing,'launch-once')).decision).toBe('allow');
    expect((await engine.launchCampaign(spend(1),marketing,'launch-duplicate')).reason).toBe('CAMPAIGN_ALREADY_LAUNCHED');
    const reservation=await engine.checkSpend({...spend(1),campaignId:'reference-test'},marketing,'reference-reserve');
    await engine.commitSpend({reservationId:reservation.reservationId,providerReference:'provider-one'},marketing,'reference-first');
    expect((await engine.commitSpend({reservationId:reservation.reservationId,providerReference:'provider-two'},marketing,'reference-second')).reason).toBe('PROVIDER_REFERENCE_CONFLICT');
    const event={eventId:'event-test',type:'payment.confirmed',orderId:'ORD-1030'};
    expect((await engine.commerceEvent(event,owner,'event-first')).status).toBe('processed');
    expect((await engine.commerceEvent(event,owner,'event-repeat')).status).toBe('already_processed');
    expect((await engine.commerceEvent({...event,orderId:'ORD-1032'},owner,'event-conflict')).reason).toBe('COMMERCE_EVENT_CONFLICT');
  });
  it('denies unpaid or already-shipped fulfillment and prevents webhook resurrection of refunds',async()=>{
    const engine=await createEngine();
    await engine.commerceEvent({eventId:'failed-pay',type:'payment.failed',orderId:'ORD-1030'},owner,'failed-payment');
    expect((await engine.placeSupplierOrder({productId:'prod-02',orderId:'ORD-1030',quantity:2},owner,'unpaid-fulfill')).reason).toBe('ORDER_NOT_FULFILLABLE');
    expect((await engine.evaluateRefund({orderId:'ORD-1030',amount:10,reasonCode:'test'},support,'unpaid-refund')).reason).toBe('ORDER_NOT_REFUNDABLE');
    expect((await engine.placeSupplierOrder({productId:'prod-03',orderId:'ORD-1031',quantity:1},owner,'shipped-fulfill')).reason).toBe('ORDER_NOT_FULFILLABLE');
    await engine.resolveInterrupt('int-refund-1029',{decision:'approve'},owner,'refund-before-stale-event');
    expect((await engine.commerceEvent({eventId:'stale-event',type:'payment.confirmed',orderId:'ORD-1029'},owner,'stale-payment')).reason).toBe('ORDER_TRANSITION_DENIED');
    expect((await engine.snapshot()).orders.find(item=>item.id==='ORD-1029')?.status).toBe('partially_refunded');
  });
  it('marks multi-line orders shipped only after every line is fulfilled and rejects split-cart bypasses',async()=>{
    const engine=await createEngine();
    const first={productId:'prod-04',orderId:'ORD-1032',quantity:1};
    expect((await engine.placeSupplierOrder(first,owner,'line-one')).decision).toBe('allow');
    expect((await engine.snapshot()).orders.find(item=>item.id==='ORD-1032')?.status).toBe('processing');
    expect((await engine.placeSupplierOrder({...first,productId:'prod-05'},owner,'line-two')).decision).toBe('allow');
    expect((await engine.snapshot()).orders.find(item=>item.id==='ORD-1032')?.status).toBe('shipped');
    expect((await engine.checkout({items:[{productId:'prod-02',quantity:20},{productId:'prod-02',quantity:1}],customer:{name:'Quantity Test',email:'qty@example.com'}},owner,'split-quantity')).reason).toBe('ITEM_QUANTITY_LIMIT_EXCEEDED');
  });
});
