export interface StagingReadinessReport {
  schemaVersion: number;
  staticConfiguration: {
    status: "BLOCKED" | "VERIFIED";
    evidenceScope: "STATIC_CONFIGURATION_ONLY";
    missing: Array<{ field: string; reason: string }>;
  };
  workerReadiness: {
    ingress: string;
    worker: string;
    reconciliation: string;
    mode: string;
  };
  activeProbes: {
    status: string;
    required: string[];
    notProbed: string[];
    missing?: string[];
    results: Array<{
      name: string;
      status: string;
      httpStatus?: number;
      mode?: string;
      worker?: string;
      reason?: string;
    }>;
  };
  externalStagingVerified: false;
  readyForOperatorReview: boolean;
  failures: Array<{ field: string; reason: string }>;
}

export function checkStagingReadiness(
  env: Record<string, string | undefined>,
): StagingReadinessReport;

export function runActiveStagingProbes(
  env: Record<string, string | undefined>,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<StagingReadinessReport["activeProbes"]>;
