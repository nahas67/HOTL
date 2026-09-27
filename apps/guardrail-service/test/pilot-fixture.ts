import { emptyPilotDraft, type PilotDraft } from '@hotl/schemas';

const owner = <T extends string | number>(value: T) => ({ value, provenance: 'OWNER_ENTERED' as const, evidenceRef: 'Owner pilot worksheet, signed review' });
const contractual = <T extends string | number>(value: T) => ({ value, provenance: 'CONTRACTUAL' as const, evidenceRef: 'Supplier contract and rate card' });
const calculated = (value: number) => ({ value, provenance: 'CALCULATED' as const, evidenceRef: 'Owner reviewed unit economics worksheet' });

/** Complete synthetic owner inputs for tests only. No business values are seeded in production. */
export function completePilotDraft(): PilotDraft {
  const draft = emptyPilotDraft();
  draft.profile = { country: owner('US'), salesChannel: owner('SHOPIFY_DEVELOPMENT_STORE'),
    customerProfile: owner('Development store test customer'), productCategory: owner('Home'),
    supplierModel: owner('Contracted supplier'), fulfillmentModel: owner('Merchant fulfilled'),
    currency: owner('USD'), returnModel: owner('Owner managed returns'), expectedOrderValue: owner(100), initialSalesTarget: owner(1000) };
  draft.economics = { supplierProductCost: contractual(30), inboundFreight: contractual(2), outboundShipping: contractual(4),
    packaging: contractual(1), storeFees: contractual(2), paymentFees: contractual(3), advertisingAcquisition: owner(5),
    refundAllowance: owner(2), returnAllowance: owner(2), fulfillmentExpense: contractual(3),
    taxHandling: owner('Owner will review tax handling before any sale'), targetContribution: calculated(20),
    breakEvenCac: calculated(30), breakEvenRoas: calculated(3.5) };
  draft.capital = { maxPilotCapital: owner(10000), protectedReserve: owner(1000), maxDailySpend: owner(1000),
    maxWeeklySpend: owner(3000), maxMonthlySpend: owner(5000), maxAdvertisingExposure: owner(5000),
    maxSupplierExposure: owner(2000), maxInventoryExposure: owner(2000), maxExperimentLoss: owner(500),
    maxRefundAuthority: owner(100), maxSingleAutonomousTransaction: owner(200) };
  draft.stopRules = [
    { metric: 'UNCERTAIN_PROVIDER_OPERATIONS', unit: 'COUNT', threshold: 1, action: 'BLOCK_NEW_ACTIONS', enabled: true },
    { metric: 'PROVIDER_RECONCILIATION_FAILURES', unit: 'COUNT', threshold: 1, action: 'BLOCK_NEW_ACTIONS', enabled: true },
  ];
  return draft;
}
