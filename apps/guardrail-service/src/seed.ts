import type { AgentRecord, EngineState } from './types.js';
import type { CommerceOrder, OwnerInterrupt, Product } from '@hotl/schemas';
import { addConstitution } from './constitution.js';

export function seedState(populated = true): EngineState {
  const now = Date.now();
  const ago = (minutes: number) => new Date(now-minutes*60000).toISOString();
  const products: Product[] = [
    { id:'prod-01',sku:'LUMA-01',name:'Luma portable lamp',category:'Home & living',price:49,landedCost:17.5,estimatedCac:6,margin:0.5204,inventory:128,status:'active',image:'/products/lamp.svg',color:'#f1c488',orders:86,revenue:4214,description:'A little light, wherever life happens. A warm rechargeable table lamp with three brightness settings.' },
    { id:'prod-02',sku:'FLOW-02',name:'Flow insulated bottle',category:'Everyday essentials',price:34,landedCost:10,estimatedCac:5,margin:0.5588,inventory:246,status:'active',image:'/products/bottle.svg',color:'#8ca69d',orders:112,revenue:3808,description:'Stay in your flow. Double-wall insulation keeps your daily hydration just the way you like it.' },
    { id:'prod-03',sku:'ARC-03',name:'Arc desk organizer',category:'Workspace',price:39,landedCost:13,estimatedCac:6,margin:0.5128,inventory:74,status:'active',image:'/products/organizer.svg',color:'#c5afa0',orders:67,revenue:2613,description:'Make room for a clearer mind. A sculptural catch-all for the small things that keep your day moving.' },
    { id:'prod-04',sku:'DRIFT-04',name:'Drift canvas tote',category:'Everyday essentials',price:28,landedCost:9,estimatedCac:4,margin:0.5357,inventory:185,status:'active',image:'/products/tote.svg',color:'#dccb9f',orders:54,revenue:1512,description:'Your everyday carry, considered. Durable natural canvas with generous space and a handy inner pocket.' },
    { id:'prod-05',sku:'NEST-05',name:'Nest ceramic planter',category:'Home & living',price:32,landedCost:12,estimatedCac:5,margin:0.4688,inventory:92,status:'active',image:'/products/planter.svg',color:'#c99476',orders:43,revenue:1376,description:'Give your green friends a beautiful home. A warm ceramic planter with a matching drainage tray.' },
    { id:'prod-06',sku:'AURA-06',name:'Aura aroma diffuser',category:'Home & living',price:42,landedCost:22,estimatedCac:7,margin:0.3095,inventory:60,status:'held',image:'/products/diffuser.svg',color:'#b7b0cb',orders:0,revenue:0,description:'A quiet moment for your space. A compact diffuser designed to soften the everyday.' },
  ];
  const orders: CommerceOrder[] = [
    { id:'ORD-1029',customer:{name:'Olivia Martin',email:'olivia@example.com'},items:[{productId:'prod-01',name:'Luma portable lamp',quantity:1,price:49}],total:49,refunded:0,status:'delivered',createdAt:ago(165),tracking:'SIM-TRK-1029' },
    { id:'ORD-1030',customer:{name:'James Wilson',email:'james@example.com'},items:[{productId:'prod-02',name:'Flow insulated bottle',quantity:2,price:34}],total:68,refunded:0,status:'processing',createdAt:ago(4),tracking:null },
    { id:'ORD-1031',customer:{name:'Emma Chen',email:'emma@example.com'},items:[{productId:'prod-03',name:'Arc desk organizer',quantity:1,price:39}],total:39,refunded:0,status:'shipped',createdAt:ago(13),tracking:'SIM-TRK-1031' },
    { id:'ORD-1032',customer:{name:'Noah Williams',email:'noah@example.com'},items:[{productId:'prod-04',name:'Drift canvas tote',quantity:1,price:28},{productId:'prod-05',name:'Nest ceramic planter',quantity:1,price:32}],total:60,refunded:0,status:'processing',createdAt:ago(28),tracking:null },
    { id:'ORD-1033',customer:{name:'Sophia Davis',email:'sophia@example.com'},items:[{productId:'prod-01',name:'Luma portable lamp',quantity:1,price:49},{productId:'prod-02',name:'Flow insulated bottle',quantity:1,price:34}],total:83,refunded:0,status:'delivered',createdAt:ago(41),tracking:'SIM-TRK-1033' },
    { id:'ORD-1034',customer:{name:'Liam Patel',email:'liam@example.com'},items:[{productId:'prod-05',name:'Nest ceramic planter',quantity:1,price:32}],total:32,refunded:0,status:'shipped',createdAt:ago(52),tracking:'SIM-TRK-1034' },
  ];
  const interrupts: OwnerInterrupt[] = [
    {id:'int-refund-1029',runId:'run-support-01',threadId:'run-support-01',category:'refund_escrow',title:'Refund needs your approval',summary:'Olivia requested $42.00 for order #1029. This exceeds the $25 automatic refund limit.',agentName:'Support agent',priority:'high',payload:{orderId:'ORD-1029',amount:42,currency:'USD',reasonCode:'item_not_as_described',customerName:'Olivia Martin',recommendation:'Approve refund — customer supplied a photo of the damaged lamp.'},status:'pending',createdAt:ago(8),expiresAt:null,requiredAction:'approve|reject|modify'},
    {id:'int-spend-01',runId:'run-marketing-01',threadId:'run-marketing-01',category:'spend',title:'Campaign budget at the ceiling',summary:'The Luma retargeting campaign requests $50.00. Only $35.80 remains in today’s budget.',agentName:'Marketing agent',priority:'medium',payload:{campaignId:'camp-luma-retarget',requestedAmount:50,currency:'USD',agentId:'marketing_agent',recommendation:'Adjust the campaign to $30 to remain within today’s limit.'},status:'pending',createdAt:ago(16),expiresAt:null,requiredAction:'approve|reject|modify'},
    {id:'int-margin-01',runId:'run-sourcing-01',threadId:'run-sourcing-01',category:'margin',title:'New product below margin floor',summary:'Aura aroma diffuser has a 30.95% margin, below your 40% floor. Listing is held for review.',agentName:'Sourcing agent',priority:'medium',payload:{productId:'prod-06',sku:'AURA-06',sellingPrice:42,landedCost:22,estimatedCac:7,currency:'USD',recommendation:'Set the selling price to $49 to reach a 40.82% margin.'},status:'pending',createdAt:ago(34),expiresAt:null,requiredAction:'approve|reject|modify'},
  ];
  const agents: AgentRecord[] = [
    {id:'sourcing_agent',name:'Sourcing',role:'Product discovery',status:'working',currentTask:'Reviewing 12 supplier candidates',lastActive:ago(1),actionsToday:47,successRate:98.2,tokenUsage:18400,tokenBudget:50000},
    {id:'marketing_agent',name:'Marketing',role:'Campaign optimization',status:'working',currentTask:'Optimizing Luma retargeting campaign',lastActive:ago(0),actionsToday:32,successRate:96.8,tokenUsage:22600,tokenBudget:60000},
    {id:'order_agent',name:'Operations',role:'Orders & inventory',status:'working',currentTask:'Tracking 8 shipments in transit',lastActive:ago(1),actionsToday:126,successRate:100,tokenUsage:8600,tokenBudget:30000},
    {id:'support_agent',name:'Support',role:'Customer care',status:'waiting',currentTask:'Waiting for refund approval',lastActive:ago(2),actionsToday:64,successRate:98.4,tokenUsage:15200,tokenBudget:40000},
  ];
  const state:EngineState={version:1,config:{dailyAdSpendCeiling:100,marginFloor:0.4,autoRefundThreshold:25,currency:'USD'},paused:false,pauseReason:null,products:populated?products:[],orders:populated?orders:[],interrupts:populated?interrupts:[],agents:populated?agents:[],audit:[],idempotency:{},reservations:[],refunds:[],campaigns:[],supplierOrders:[],commerceEvents:[],seedSpendMinor:populated?6420:0,seedSpendDay:new Date(now).toISOString().slice(0,10),baseRevenue:populated?24781.5:0,baseOrders:populated?342:0,createdAt:ago(0)};
  addConstitution(state,new Date(now).toISOString(),false);
  for(const item of state.interrupts)item.payload.legacyReviewRequired=true;
  for(const agent of state.agents){agent.status='idle';agent.currentTask='Available for an owner-started operating cycle';agent.actionsToday=0;agent.tokenUsage=0;}
  return state;
}
