"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Interrupt } from "@/lib/types";
import {
  canReplanExpiredProposal,
  runContinuationNotice,
} from "@/lib/run-continuation";
import { ActionButton, Notice, type OperatingApi } from "./operating-pages";

export function ExpiredProposalAction({
  item,
  api,
  paused,
  onUpdated,
}: {
  item: Interrupt;
  api: OperatingApi;
  paused: boolean;
  onUpdated: () => Promise<void>;
}) {
  const [run, setRun] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    warning: boolean;
  } | null>(null);
  const path = `runs/${encodeURIComponent(item.runId)}`;
  const refreshRun = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRun(await api(path));
    } catch (error) {
      setRun(null);
      setError(
        error instanceof Error ? error.message : "Unable to read the saved run.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, path]);
  useEffect(() => {
    void refreshRun();
  }, [refreshRun]);

  async function replan() {
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      // No approval is submitted. The manager re-reads the persisted expiry and
      // re-enters the saved stage with fresh guardrail-owned context.
      const result = await api(`${path}/resume`, "POST", {
        interruptId: item.id,
      });
      setRun(result);
      setNotice(runContinuationNotice(result));
      await onUpdated();
    } catch (error) {
      setRun(null);
      setError(
        error instanceof Error
          ? error.message
          : "The replan result could not be confirmed. Check the saved run before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }

  const eligible = canReplanExpiredProposal(item, run);
  return (
    <div className="os-expired-proposal">
      <p>
        This proposal expired after its policy or records changed. Replanning
        reads the latest context; it does not approve this stale proposal.
      </p>
      <div className="os-toolbar-actions">
        <ActionButton
          type="button"
          busy={busy}
          disabled={paused || loading || !eligible}
          onClick={() => void replan()}
        >
          <RefreshCw size={14} /> Replan run
        </ActionButton>
        <ActionButton
          type="button"
          disabled={loading || busy}
          onClick={() => {
            setNotice(null);
            void refreshRun();
          }}
        >
          Check run status
        </ActionButton>
      </div>
      {loading && <p role="status">Reading the saved run…</p>}
      {paused && <p>Platform controls currently prevent replanning.</p>}
      {!loading && run && !eligible && !notice && (
        <p role="status">
          This run is no longer waiting for this expired proposal.{" "}
          {runContinuationNotice(run).text}
        </p>
      )}
      {notice && <Notice error={notice.warning}>{notice.text}</Notice>}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
