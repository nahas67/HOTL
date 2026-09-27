import { autonomyDomains, constitutionSchema, emptyPilotDraft, type BusinessConstitution, type GuardrailConfig } from '@hotl/schemas';
import type { EngineState } from './types.js';

export function defaultConstitution(config:GuardrailConfig,now:string,legacy=false):BusinessConstitution {
  return constitutionSchema.parse({version:1,updatedAt:now,projectName:'HOTL',goals:['Grow contribution profit while preserving owner control'],mode:legacy?'MANUAL':'SUPERVISED',
    domains:Object.fromEntries(autonomyDomains.map(id=>[id,{mode:legacy?'MANUAL':'SUPERVISED',paused:false,maxAutoActionAmount:25}])),
    dailyAdSpendCeiling:config.dailyAdSpendCeiling,monthlyAdSpendCeiling:Math.min(1_000_000,config.dailyAdSpendCeiling*30),maxSupplierPurchase:500,maxAutonomousTransaction:100,
    autoRefundThreshold:config.autoRefundThreshold,marginFloor:config.marginFloor,maxPriceChangePct:25,permittedCountries:[],prohibitedCountries:[],prohibitedCategories:[],
    hardRules:[],advisory:{interpretation:'Free-form goals, hardRules, and advisory text require human review; only typed policy fields are executable constraints.',countryRestrictions:'Countries are checked only against known product origin and explicit checkout destination. Missing origin or destination denies when country restrictions are configured; this is not jurisdiction compliance certification.'},
    pilot:{draft:emptyPilotDraft()}});
}
export function addConstitution(state:EngineState,now:string,legacy:boolean) {
  state.schemaVersion=2;state.extensions??={};state.constitution=defaultConstitution(state.config,now,legacy);
  state.constitutionHistory=[{version:1,constitution:structuredClone(state.constitution),changedAt:now,changedBy:'schema-migration',reason:legacy?'Additive migration; automation defaults to MANUAL until owner reviews policy.':'Initial supervised operating policy.'}];
  state.products.forEach(p=>{p.revision??=1;});state.orders.forEach(o=>{o.revision??=1;});state.campaigns.forEach(c=>{c.revision??=1;});
  state.reservations.forEach(r=>{r.revision??=1;});
  if(legacy)for(const agent of state.agents){agent.status='idle';agent.currentTask='Migration completed; owner review required before autonomous execution';agent.actionsToday=0;agent.tokenUsage=0;}
  if(legacy) for(const item of state.interrupts)if(item.status==='pending')item.payload={...item.payload,legacyReviewRequired:true};
}
