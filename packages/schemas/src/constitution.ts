import { z } from 'zod';

export const autonomyDomains = ['sourcing','supplier_contact','catalog','pricing','promotions','advertising','content','influencers','seo','email','sms','support','refunds','orders','fulfillment','purchasing','inventory','finance','marketplaces','experimentation'] as const;
export const autonomyModeSchema = z.enum(['MANUAL','COPILOT','SUPERVISED','AUTONOMOUS']);
export const operatingModeSchema = z.enum(['MANUAL','COPILOT','SUPERVISED','AUTONOMOUS','CUSTOM']);
const amount = z.number().finite().min(0).max(1_000_000).refine(v=>Math.abs(v*100-Math.round(v*100))<1e-7,'Use at most two decimal places');
export const domainPolicySchema = z.object({mode:autonomyModeSchema,paused:z.boolean(),maxAutoActionAmount:amount}).strict();
const countries=z.array(z.string().regex(/^[A-Z]{2}$/,'Use ISO two-letter uppercase country codes')).max(250);
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
}).strict();
export const constitutionSchema=constitutionFieldsSchema.extend({version:z.number().int().positive(),updatedAt:z.string().datetime()});
export const constitutionPatchSchema=constitutionFieldsSchema.partial().omit({domains:true}).extend({
  expectedVersion:z.number().int().positive(),reason:z.string().trim().min(3).max(1000),
  domains:z.object(Object.fromEntries(autonomyDomains.map(d=>[d,domainPolicySchema.partial().optional()])) as Record<AutonomyDomain,z.ZodOptional<ReturnType<typeof domainPolicySchema.partial>>>).strict().optional(),
}).strict();
export type AutonomyDomain=typeof autonomyDomains[number];
export type DomainPolicy=z.infer<typeof domainPolicySchema>;
export type BusinessConstitution=z.infer<typeof constitutionSchema>;
export type ConstitutionHistory={version:number;constitution:BusinessConstitution;changedAt:string;changedBy:string;reason:string};
export const productCreateSchema=z.object({expectedConstitutionVersion:z.number().int().positive(),reason:z.string().trim().min(3).max(1000),sku:z.string().trim().min(1).max(100),name:z.string().trim().min(2).max(200),description:z.string().max(5000).default(''),category:z.string().trim().min(1).max(100),price:amount.refine(v=>v>0),landedCost:amount,estimatedCac:amount,inventory:z.number().int().min(0).max(1_000_000),status:z.enum(['active','draft','held']).default('draft'),countryOfOrigin:z.string().regex(/^[A-Z]{2}$/).optional()}).strict();
export const productUpdateSchema=z.object({expectedConstitutionVersion:z.number().int().positive(),expectedRevision:z.number().int().positive(),reason:z.string().trim().min(3).max(1000),price:amount.refine(v=>v>0).optional(),inventory:z.number().int().min(0).max(1_000_000).optional(),name:z.string().trim().min(2).max(200).optional(),description:z.string().max(5000).optional(),status:z.enum(['active','draft','held']).optional()}).strict().refine(v=>['price','inventory','name','description','status'].some(k=>k in v),'Provide a product field');
export const campaignPauseSchema=z.object({expectedConstitutionVersion:z.number().int().positive(),expectedRevision:z.number().int().positive(),reason:z.string().trim().min(3).max(1000)}).strict();
