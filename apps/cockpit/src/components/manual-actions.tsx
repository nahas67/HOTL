"use client";

import { useState, type FormEvent } from "react";
import { productCreateSchema, productUpdateSchema } from "@hotl/schemas";
import type { Order, Product } from "@/lib/types";
import {
  ActionButton,
  Notice,
  usd,
  useOperatingResource,
  type ConstitutionResponse,
  type OperatingApi,
} from "./operating-pages";

export function ProductEditor({
  product,
  api,
  onSaved,
  onCancel,
}: {
  product?: Product;
  api: OperatingApi;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const policy = useOperatingResource<ConstitutionResponse>(
    api,
    "constitution",
  );
  const [values, setValues] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "Home",
    price: product?.price ?? 0,
    landedCost: product?.landedCost ?? 0,
    estimatedCac: product?.estimatedCac ?? 0,
    inventory: product?.inventory ?? 0,
    status: product?.status ?? "draft",
    countryOfOrigin: "",
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!policy.data) return;
    setBusy(true);
    setError("");
    setErrorCode("");
    try {
      const context = {
        expectedConstitutionVersion: policy.data.constitution.version,
        reason,
      };
      const body = product
        ? productUpdateSchema.parse({
            ...context,
            expectedRevision: product.revision,
            name: values.name,
            description: values.description,
            price: values.price,
            inventory: values.inventory,
            status: values.status,
          })
        : productCreateSchema.parse({
            ...context,
            ...values,
            countryOfOrigin: values.countryOfOrigin || undefined,
          });
      await api(
        product ? `products/${product.id}/update` : "products/create",
        "POST",
        body,
      );
      await onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The product could not be saved.",
      );
      // The guardrail's reason code, not its English sentence. `RESOURCE_CHANGED` is a
      // concurrent edit and the owner should reopen the product; `CONSTITUTION_CHANGED` means
      // the policy moved underneath the form, which reopening will not fix.
      setErrorCode(
        error instanceof Error && typeof (error as unknown as { code?: unknown }).code === "string"
          ? (error as unknown as { code: string }).code
          : "",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="modal-body os-manual-form">
        <Notice>
          Owner action · Constitution{" "}
          {policy.data?.constitution.version ?? "loading"}
          {product ? ` · Product revision ${product.revision}` : ""}. Price,
          inventory and publication changes are checked and audited before they
          are saved.
        </Notice>
        {policy.error && <Notice error>{policy.error}</Notice>}
        <label className="form-label">
          Product name
          <input
            required
            minLength={2}
            maxLength={200}
            value={values.name}
            onChange={(event) =>
              setValues({ ...values, name: event.target.value })
            }
          />
        </label>
        <label className="form-label">
          Description
          <textarea
            rows={3}
            maxLength={5000}
            value={values.description}
            onChange={(event) =>
              setValues({ ...values, description: event.target.value })
            }
          />
        </label>
        <div className="os-fields-grid">
          {!product && (
            <>
              <label className="form-label">
                SKU
                <input
                  required
                  maxLength={100}
                  value={values.sku}
                  onChange={(event) =>
                    setValues({ ...values, sku: event.target.value })
                  }
                />
              </label>
              <label className="form-label">
                Category
                <input
                  required
                  maxLength={100}
                  value={values.category}
                  onChange={(event) =>
                    setValues({ ...values, category: event.target.value })
                  }
                />
              </label>
              <label className="form-label">
                Country of origin <span>Optional two-letter code</span>
                <input
                  maxLength={2}
                  pattern="[A-Z]{2}"
                  value={values.countryOfOrigin}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      countryOfOrigin: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
            </>
          )}
          {(
            [
              "price",
              ...(!product ? ["landedCost", "estimatedCac"] : []),
              "inventory",
            ] as ("price" | "landedCost" | "estimatedCac" | "inventory")[]
          ).map((key) => (
            <label key={key} className="form-label">
              {
                {
                  price: "Selling price · USD",
                  landedCost: "Landed cost · USD",
                  estimatedCac: "Estimated acquisition cost · USD",
                  inventory: "Available inventory",
                }[key]
              }
              <input
                type="number"
                required
                min={key === "price" ? "0.01" : "0"}
                max="1000000"
                step={key === "inventory" ? "1" : "0.01"}
                value={values[key]}
                onChange={(event) =>
                  setValues({ ...values, [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
          <label className="form-label">
            Publication status
            <select
              value={values.status}
              onChange={(event) =>
                setValues({ ...values, status: event.target.value })
              }
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="held">Held</option>
            </select>
          </label>
        </div>
        <label className="form-label">
          Reason for change
          <input
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error && (
          <Notice error>
            {error} Your input is preserved.
            {/* Keyed on the guardrail's reason code, not on the message text. The proxy
                emits "…changed after this form or proposal…" for BOTH RESOURCE_CHANGED and
                CONSTITUTION_CHANGED, so a substring match told the owner a concurrent edit
                had caused a plain policy denial. Only RESOURCE_CHANGED is fixed by reopening
                the product; a stale Constitution needs the policy reviewed, not the form. */}
            {errorCode === "RESOURCE_CHANGED" &&
              " Close and reopen this product to review its latest version after a conflict."}
          </Notice>
        )}
      </div>
      <div className="modal-footer">
        <ActionButton type="button" onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton
          className="primary"
          type="submit"
          busy={busy}
          disabled={
            !policy.data || !!policy.error || (product && !product.revision)
          }
        >
          {product ? "Save product changes" : "Create product"}
        </ActionButton>
      </div>
    </form>
  );
}

export function RefundEditor({
  order,
  api,
  onSaved,
  onCancel,
}: {
  order: Order;
  api: OperatingApi;
  onSaved: (result: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const policy = useOperatingResource<ConstitutionResponse>(
    api,
    "constitution",
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!policy.data) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("refunds/evaluate", "POST", {
        orderId: order.id,
        amount: Number(amount),
        reasonCode: reason,
        expectedConstitutionVersion: policy.data.constitution.version,
        expectedRevision: order.revision,
      });
      await onSaved(result);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The refund could not be evaluated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <p className="detail-intro">
          Order {order.id} · {order.customer.name}
        </p>
        <div className="detail-facts">
          <div>
            <span>Order total</span>
            <strong>{usd(order.total)}</strong>
          </div>
          <div>
            <span>Refunded to date</span>
            <strong>{usd(order.refunded ?? 0)}</strong>
          </div>
        </div>
        <Notice>
          Refunds beyond the cumulative automatic threshold create a separate
          approval request. This submission does not override that review.
        </Notice>
        {policy.error && <Notice error>{policy.error}</Notice>}
        <label className="form-label">
          Refund amount · USD
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            max={Math.max(0, order.total - (order.refunded ?? 0))}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="form-label">
          Refund reason
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error && <Notice error>{error}</Notice>}
      </div>
      <div className="modal-footer">
        <ActionButton type="button" onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton
          type="submit"
          className="primary"
          busy={busy}
          disabled={
            !policy.data || !!policy.error || order.revision === undefined
          }
        >
          Evaluate refund
        </ActionButton>
      </div>
    </form>
  );
}
