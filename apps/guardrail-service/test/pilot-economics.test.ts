import { describe, expect, it } from 'vitest';
import { derivePilotEconomics, fractionSchema, pilotDraftSchema, ratioSchema } from '@hotl/schemas';
import { completePilotDraft } from './pilot-fixture.js';

describe('Gate A unit economics', () => {
  it('keeps monetary amounts, ratios, and fractions in distinct domains', () => {
    expect(ratioSchema.parse(1.9608)).toBe(1.9608);
    expect(ratioSchema.safeParse(1.96081).success).toBe(false);
    expect(fractionSchema.parse(0.2)).toBe(0.2);
    expect(fractionSchema.safeParse(20).success).toBe(false);
    expect(fractionSchema.safeParse(0.20001).success).toBe(false);
  });

  it('derives target contribution, break-even CAC, and rounded break-even ROAS deterministically', () => {
    const draft = completePilotDraft();
    expect(derivePilotEconomics(draft)).toEqual({ targetContribution: 46, breakEvenCac: 51, breakEvenRoas: 1.9608 });
    expect(pilotDraftSchema.safeParse(draft).success).toBe(true);
    draft.profile.expectedOrderValue = { value: 99.99, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner worksheet' };
    draft.economics.advertisingAcquisition = { value: 5.01, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner worksheet' };
    draft.economics.targetContribution = { value: 45.98, provenance: 'CALCULATED', evidenceRef: 'HOTL-PILOT-UNIT-ECONOMICS-v1' };
    draft.economics.breakEvenCac = { value: 50.99, provenance: 'CALCULATED', evidenceRef: 'HOTL-PILOT-UNIT-ECONOMICS-v1' };
    draft.economics.breakEvenRoas = { value: 1.961, provenance: 'CALCULATED', evidenceRef: 'HOTL-PILOT-UNIT-ECONOMICS-v1' };
    expect(derivePilotEconomics(draft)).toEqual({ targetContribution: 45.98, breakEvenCac: 50.99, breakEvenRoas: 1.961 });
    expect(pilotDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('rejects calculated values that do not match the recorded formula', () => {
    const draft = completePilotDraft();
    draft.economics.targetContribution = { value: 47, provenance: 'CALCULATED', evidenceRef: 'HOTL-PILOT-UNIT-ECONOMICS-v1' };
    expect(pilotDraftSchema.safeParse(draft).success).toBe(false);
    draft.economics.targetContribution = { value: 46, provenance: 'CALCULATED', evidenceRef: 'Owner spreadsheet' };
    expect(pilotDraftSchema.safeParse(draft).success).toBe(false);
    draft.economics.targetContribution = { value: 47, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner worksheet' };
    expect(pilotDraftSchema.safeParse(draft).success).toBe(false);
    draft.economics.targetContribution = { value: 46, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner worksheet' };
    expect(pilotDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('keeps derived outputs unavailable when inputs are unknown or the CAC denominator is nonpositive', () => {
    const unknown = completePilotDraft();
    unknown.economics.taxAndDutyPerOrder = { value: null, provenance: 'UNKNOWN' };
    expect(derivePilotEconomics(unknown)).toBeNull();
    expect(pilotDraftSchema.safeParse(unknown).success).toBe(false);
    unknown.economics.targetContribution = { value: 46, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner worksheet' };
    expect(pilotDraftSchema.safeParse(unknown).success).toBe(false);

    const zero = completePilotDraft();
    zero.economics.supplierProductCost = { value: 81, provenance: 'CONTRACTUAL', evidenceRef: 'Supplier rate card' };
    expect(derivePilotEconomics(zero)).toBeNull();
    expect(pilotDraftSchema.safeParse(zero).success).toBe(false);
  });

  it('flags an impossible negative contribution even if the input field cannot represent it', () => {
    const draft = completePilotDraft();
    draft.economics.advertisingAcquisition = { value: 52, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner worksheet' };
    expect(derivePilotEconomics(draft)?.targetContribution).toBe(-1);
    expect(pilotDraftSchema.safeParse(draft).success).toBe(false);
  });
});
