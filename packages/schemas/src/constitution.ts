import { z } from 'zod';

export const autonomyDomains = ['sourcing','supplier_contact','catalog','pricing','promotions','advertising','content','influencers','seo','email','sms','support','refunds','orders','fulfillment','purchasing','inventory','finance','marketplaces','experimentation'] as const;
export const autonomyModeSchema = z.enum(['MANUAL','COPILOT','SUPERVISED','AUTONOMOUS']);
export const operatingModeSchema = z.enum(['MANUAL','COPILOT','SUPERVISED','AUTONOMOUS','CUSTOM']);
const amount = z.number().finite().min(0).max(1_000_000).refine(v=>Math.abs(v*100-Math.round(v*100))<1e-7,'Use at most two decimal places');
export const moneyAmountSchema=amount.brand<'MoneyAmount'>();
export const ratioSchema=z.number().finite().min(0).max(100_000).refine(v=>Math.abs(v*10_000-Math.round(v*10_000))<1e-7,'Ratios use at most four decimal places').brand<'Ratio'>();
export const fractionSchema=z.number().finite().min(0).max(1)
  .refine(v=>Math.abs(v*10_000-Math.round(v*10_000))<1e-7,'Fractions use at most four decimal places').brand<'Fraction'>();
export type MoneyAmount=z.infer<typeof moneyAmountSchema>;
export type Ratio=z.infer<typeof ratioSchema>;
export type Fraction=z.infer<typeof fractionSchema>;
export const PILOT_ECONOMICS_FORMULA_VERSION='HOTL-PILOT-UNIT-ECONOMICS-v1' as const;
export const domainPolicySchema = z.object({mode:autonomyModeSchema,paused:z.boolean(),maxAutoActionAmount:amount}).strict();
const countries=z.array(z.string().regex(/^[A-Z]{2}$/,'Use ISO two-letter uppercase country codes')).max(250);
const unknown=z.object({value:z.null(),provenance:z.literal('UNKNOWN')}).strict();
const known=<T extends z.ZodTypeAny>(value:T)=>z.object({value,provenance:z.enum(['OWNER_ENTERED','PROVIDER_OBSERVED','CONTRACTUAL','CALCULATED','ESTIMATED']),evidenceRef:z.string().trim().min(3).max(500)}).strict();
const textField=z.union([unknown,known(z.string().trim().min(1).max(500))]);
const moneyField=z.union([unknown,known(moneyAmountSchema)]);
const ratioField=z.union([unknown,known(ratioSchema)]);
const countryField=z.union([unknown,known(z.string().regex(/^[A-Z]{2}$/))]);
const currencyField=z.union([unknown,known(z.string().regex(/^[A-Z]{3}$/))]);
export const pilotProfileSchema=z.object({country:countryField,salesChannel:z.union([unknown,known(z.enum(['SHOPIFY_DEVELOPMENT_STORE','OTHER']))]),customerProfile:textField,productCategory:textField,
  supplierModel:textField,fulfillmentModel:textField,currency:currencyField,returnModel:textField,
  expectedOrderValue:moneyField,initialSalesTarget:moneyField}).strict();
export const pilotEconomicsSchema=z.object({supplierProductCost:moneyField,inboundFreight:moneyField,outboundShipping:moneyField,
  packaging:moneyField,storeFees:moneyField,paymentFees:moneyField,advertisingAcquisition:moneyField,
  refundAllowance:moneyField,returnAllowance:moneyField,fulfillmentExpense:moneyField,taxHandling:textField,
  taxAndDutyPerOrder:moneyField.default({value:null,provenance:'UNKNOWN'}),
  targetContribution:moneyField,breakEvenCac:moneyField,breakEvenRoas:ratioField}).strict();
export const pilotCapitalSchema=z.object({maxPilotCapital:moneyField,protectedReserve:moneyField,maxDailySpend:moneyField,
  maxWeeklySpend:moneyField,maxMonthlySpend:moneyField,maxAdvertisingExposure:moneyField,maxSupplierExposure:moneyField,
  maxInventoryExposure:moneyField,maxExperimentLoss:moneyField,maxRefundAuthority:moneyField,
  maxSingleAutonomousTransaction:moneyField}).strict();
export const pilotStopMetricSchema=z.enum(['CONTRIBUTION_LOSS','REFUND_RATE','CHARGEBACK_RATE','TRACKING_FAILURES',
  'SUPPLIER_SLA_FAILURES','PROVIDER_RECONCILIATION_FAILURES','INVENTORY_INCONSISTENCIES','MISSING_ATTRIBUTION',
  'UNEXPECTED_SPEND','OWNER_INTERVENTIONS','UNCERTAIN_PROVIDER_OPERATIONS']);
export const pilotStopRuleSchema=z.object({metric:pilotStopMetricSchema,unit:z.enum(['COUNT','FRACTION','CURRENCY_AMOUNT']),
  threshold:z.number().finite().min(0).max(1_000_000),action:z.enum(['BLOCK_NEW_ACTIONS','REQUIRE_OWNER_REVIEW']),enabled:z.boolean()}).strict()
  .superRefine((rule,context)=>{
    const expected=['REFUND_RATE','CHARGEBACK_RATE'].includes(rule.metric)?'FRACTION'
      :['CONTRIBUTION_LOSS','UNEXPECTED_SPEND'].includes(rule.metric)?'CURRENCY_AMOUNT':'COUNT';
    if(rule.unit!==expected)context.addIssue({code:z.ZodIssueCode.custom,path:['unit'],message:`${rule.metric} requires ${expected}.`});
    if(rule.unit==='FRACTION'&&!fractionSchema.safeParse(rule.threshold).success)
      context.addIssue({code:z.ZodIssueCode.custom,path:['threshold'],message:'Rates are fractions from 0 to 1 with at most four decimal places.'});
    if(rule.unit==='COUNT'&&!Number.isInteger(rule.threshold))context.addIssue({code:z.ZodIssueCode.custom,path:['threshold'],message:'Counts must be whole numbers.'});
    if(rule.unit==='CURRENCY_AMOUNT'&&Math.abs(rule.threshold*100-Math.round(rule.threshold*100))>=1e-7)
      context.addIssue({code:z.ZodIssueCode.custom,path:['threshold'],message:'Currency amounts use at most two decimal places.'});
  });
type CalcInput={value:number|string|null;provenance:string;evidenceRef?:string};
type CalcDraft={profile:{expectedOrderValue:CalcInput};economics:Record<string,CalcInput>};
export type DerivedPilotEconomics={targetContribution:number;breakEvenCac:number;breakEvenRoas:number};
const derivedEconomicsKeys=['targetContribution','breakEvenCac','breakEvenRoas'] as const;
export function derivePilotEconomics(draft:CalcDraft):DerivedPilotEconomics|null {
  const costKeys=['supplierProductCost','inboundFreight','outboundShipping','packaging','storeFees','paymentFees',
    'refundAllowance','returnAllowance','fulfillmentExpense','taxAndDutyPerOrder','advertisingAcquisition'];
  const dependencies=[draft.profile.expectedOrderValue,...costKeys.map(key=>draft.economics[key])];
  if(dependencies.some(field=>!field||typeof field.value!=='number'||field.provenance==='UNKNOWN'||field.provenance==='ESTIMATED')) return null;
  const cents=(value:number)=>Math.round(value*100);
  const value=(key:string)=>draft.economics[key]!.value as number;
  const orderCents=cents(draft.profile.expectedOrderValue.value as number);
  const nonAdCostCents=costKeys.filter(key=>key!=='advertisingAcquisition').reduce((sum,key)=>sum+cents(value(key)),0);
  const breakEvenCacCents=orderCents-nonAdCostCents;
  // A zero/negative break-even acquisition budget has no finite, meaningful ROAS.
  if(breakEvenCacCents<=0)return null;
  const targetContributionCents=breakEvenCacCents-cents(value('advertisingAcquisition'));
  return {
    targetContribution:targetContributionCents/100,
    breakEvenCac:breakEvenCacCents/100,
    breakEvenRoas:Math.round((orderCents/breakEvenCacCents)*10_000)/10_000,
  };
}
export function pilotEconomicsCalculationIssues(draft:CalcDraft) {
  const present=derivedEconomicsKeys.filter(key=>typeof draft.economics[key]?.value==='number'&&draft.economics[key]?.provenance!=='UNKNOWN');
  if(!present.length)return [];
  const issues:{field:string;message:string}[]=[];
  for(const key of present)if(draft.economics[key]?.provenance==='CALCULATED'&&draft.economics[key]?.evidenceRef!==PILOT_ECONOMICS_FORMULA_VERSION)
    issues.push({field:key,message:`${key} must record ${PILOT_ECONOMICS_FORMULA_VERSION}.`});
  const derived=derivePilotEconomics(draft);
  if(!derived) {
    for(const key of present)issues.push({field:key,message:'Derived economics require every modeled per-order input to be known and non-estimated, and a positive break-even CAC.'});
    return issues;
  }
  for(const key of present) {
    const expected=derived[key],actual=draft.economics[key]?.value;
    if(!Number.isFinite(expected)||expected<0)issues.push({field:key,message:'The inputs do not produce a finite non-negative result for this metric.'});
    else if(typeof actual!=='number'||(key==='breakEvenRoas'?Math.abs(actual-expected)>1e-7:Math.round(actual*100)!==Math.round(expected*100)))
      issues.push({field:key,message:`${key} does not match ${PILOT_ECONOMICS_FORMULA_VERSION} result ${expected}.`});
  }
  return issues;
}
const pilotDraftShape=z.object({profile:pilotProfileSchema,economics:pilotEconomicsSchema,capital:pilotCapitalSchema,
  stopRules:z.array(pilotStopRuleSchema).max(30)}).strict();
export const pilotDraftReadSchema=pilotDraftShape;
export const pilotDraftSchema=pilotDraftShape.superRefine((draft,context)=>{
    for(const issue of pilotEconomicsCalculationIssues(draft))context.addIssue({code:z.ZodIssueCode.custom,path:['economics',issue.field],message:issue.message});
  });
export const pilotApprovalSchema=z.object({approvedBy:z.string().min(1),approvedAt:z.string().datetime(),
  constitutionVersion:z.number().int().positive(),draftDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
// Persisted drafts remain readable across formula revisions; the guardrail still blocks use of inconsistent CALCULATED values.
export const pilotEnvelopeSchema=z.object({draft:pilotDraftShape,approval:pilotApprovalSchema.optional()}).strict();
export const pilotApprovalRequestSchema=z.object({expectedVersion:z.number().int().positive(),reason:z.string().trim().min(3).max(1000)}).strict();
export type PilotDraft=z.input<typeof pilotDraftSchema>;
export function emptyPilotDraft():PilotDraft {
  const missing={value:null,provenance:'UNKNOWN' as const};
  return {profile:{country:missing,salesChannel:missing,customerProfile:missing,productCategory:missing,
    supplierModel:missing,fulfillmentModel:missing,currency:missing,returnModel:missing,
    expectedOrderValue:missing,initialSalesTarget:missing},
    economics:{supplierProductCost:missing,inboundFreight:missing,outboundShipping:missing,packaging:missing,
      storeFees:missing,paymentFees:missing,advertisingAcquisition:missing,refundAllowance:missing,
      returnAllowance:missing,fulfillmentExpense:missing,taxHandling:missing,taxAndDutyPerOrder:missing,targetContribution:missing,
      breakEvenCac:missing,breakEvenRoas:missing},
    capital:{maxPilotCapital:missing,protectedReserve:missing,maxDailySpend:missing,maxWeeklySpend:missing,
      maxMonthlySpend:missing,maxAdvertisingExposure:missing,maxSupplierExposure:missing,
      maxInventoryExposure:missing,maxExperimentLoss:missing,maxRefundAuthority:missing,
      maxSingleAutonomousTransaction:missing},stopRules:[]};
}
export const constitutionFieldsSchema = z.object({
  projectName:z.string().trim().min(2).max(80), goals:z.array(z.string().trim().min(1).max(500)).max(30),
  mode:operatingModeSchema,
  domains:z.object(Object.fromEntries(autonomyDomains.map(d=>[d,domainPolicySchema])) as Record<AutonomyDomain,typeof domainPolicySchema>).strict(),
  dailyAdSpendCeiling:amount.refine(v=>v>0), monthlyAdSpendCeiling:amount.refine(v=>v>0),
  maxSupplierPurchase:amount, maxAutonomousTransaction:amount,
  autoRefundThreshold:amount.refine(v=>v<=25,'Automatic refunds cannot exceed $25'),
  marginFloor:z.number().min(.4).max(.99).refine(v=>Math.abs(v*10000-Math.round(v*10000))<1e-7),
  maxPriceChangePct:z.number().min(0).max(100),
  permittedCountries:countries,prohibitedCountries:countries,
  prohibitedCategories:z.array(z.string().trim().min(1).max(100)).max(100),
  hardRules:z.array(z.string().trim().min(1).max(1000)).max(30),
  advisory:z.record(z.string().max(2000)),
  pilot:pilotEnvelopeSchema.optional(),
}).strict();
export const constitutionSchema=constitutionFieldsSchema.extend({version:z.number().int().positive(),updatedAt:z.string().datetime()});
export const constitutionPatchSchema=constitutionFieldsSchema.partial().omit({domains:true,pilot:true}).extend({
  expectedVersion:z.number().int().positive(),reason:z.string().trim().min(3).max(1000),
  pilotDraft:pilotDraftSchema.optional(),
  domains:z.object(Object.fromEntries(autonomyDomains.map(d=>[d,domainPolicySchema.partial().optional()])) as Record<AutonomyDomain,z.ZodOptional<ReturnType<typeof domainPolicySchema.partial>>>).strict().optional(),
}).strict();
export type AutonomyDomain=typeof autonomyDomains[number];
export type DomainPolicy=z.infer<typeof domainPolicySchema>;
export type BusinessConstitution=z.infer<typeof constitutionSchema>;
export type ConstitutionHistory={version:number;constitution:BusinessConstitution;changedAt:string;changedBy:string;reason:string};
export const productCreateSchema=z.object({expectedConstitutionVersion:z.number().int().positive(),reason:z.string().trim().min(3).max(1000),sku:z.string().trim().min(1).max(100),name:z.string().trim().min(2).max(200),description:z.string().max(5000).default(''),category:z.string().trim().min(1).max(100),price:amount.refine(v=>v>0),landedCost:amount,estimatedCac:amount,inventory:z.number().int().min(0).max(1_000_000),status:z.enum(['active','draft','held']).default('draft'),countryOfOrigin:z.string().regex(/^[A-Z]{2}$/).optional()}).strict();
export const productUpdateSchema=z.object({expectedConstitutionVersion:z.number().int().positive(),expectedRevision:z.number().int().positive(),reason:z.string().trim().min(3).max(1000),price:amount.refine(v=>v>0).optional(),inventory:z.number().int().min(0).max(1_000_000).optional(),name:z.string().trim().min(2).max(200).optional(),description:z.string().max(5000).optional(),status:z.enum(['active','draft','held']).optional()}).strict().refine(v=>['price','inventory','name','description','status'].some(k=>k in v),'Provide a product field');
export const campaignPauseSchema=z.object({expectedConstitutionVersion:z.number().int().positive(),expectedRevision:z.number().int().positive(),reason:z.string().trim().min(3).max(1000)}).strict();
