import type { AuditEntry, CommerceOrder, GuardrailConfig, OwnerInterrupt, Product, BusinessConstitution, ConstitutionHistory } from '@hotl/schemas';
export type AgentRecord = { id:string;name:string;role:string;status:string;currentTask:string;lastActive:string;actionsToday:number;successRate:number;tokenUsage:number;tokenBudget:number };
export type Reservation = {id:string;campaignId:string;amountMinor:number;agentId:string;day:string;status:'reserved'|'committed'|'expired';expiresAt:string;providerReference?:string;revision?:number};
export type EngineState = {
  version:1;config:GuardrailConfig;paused:boolean;pauseReason:string|null;products:Product[];orders:CommerceOrder[];interrupts:OwnerInterrupt[];agents:AgentRecord[];audit:AuditEntry[];
  idempotency:Record<string,{fingerprint:string;result:Record<string,unknown>}>;reservations:Reservation[];refunds:{id:string;orderId:string;amountMinor:number}[];
  campaigns:Record<string,unknown>[];supplierOrders:Record<string,unknown>[];commerceEvents:string[];runs?:Record<string,unknown>[];seedSpendMinor:number;seedSpendDay:string;baseRevenue:number;baseOrders:number;createdAt:string;
  schemaVersion?:2;constitution?:BusinessConstitution;constitutionHistory?:ConstitutionHistory[];extensions?:Record<string,unknown>;
};
export type KillState = {engaged:boolean;engagedAt?:string|null;reason?:string|null;actions?:unknown[]};
