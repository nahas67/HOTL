import { ConnectorError } from './errors.js';
import type { Money, Page, PageRequest } from './types.js';

export function invalid(): never { throw new ConnectorError('INVALID_RESPONSE'); }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export function string(value: unknown): string { if (typeof value !== 'string' || value.length > 20000) invalid(); return value; }
export function nonempty(value: unknown): string { const result = string(value); if (!result) invalid(); return result; }
export function nullableString(value: unknown): string | null { return value == null ? null : string(value); }
export function array(value: unknown): unknown[] { if (!Array.isArray(value) || value.length > 10000) invalid(); return value; }
export function bool(value: unknown): boolean { if (typeof value !== 'boolean') invalid(); return value; }
export function integer(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalid(); return value; }
export function id(value: unknown): string { const num = integer(value); if (num < 0) invalid(); return String(num); }
export function date(value: unknown): string {
  const result = string(value);
  if (!/^\d{4}-\d\d-\d\dT/.test(result) || !Number.isFinite(Date.parse(result))) invalid();
  return new Date(result.endsWith('Z') || /[+-]\d\d:\d\d$/.test(result) ? result : `${result}Z`).toISOString();
}
export function currency(value: unknown): string {
  const result = string(value); if (!/^[A-Z]{3}$/.test(result)) invalid(); return result;
}
export function money(value: unknown, code: unknown): Money {
  const amount = string(value); if (!/^\d+(\.\d{1,12})?$/.test(amount) || amount.length > 40) invalid();
  return { amount, currency: currency(code) };
}
export function pagination(page: PageRequest = {}): { limit: number; cursor: string | null } {
  const limit = page.limit ?? 50;
  const cursor = page.cursor ?? null;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (cursor !== null && (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 2048))) {
    throw new ConnectorError('INVALID_REQUEST');
  }
  return { limit, cursor };
}
export function graphPage<T>(value: unknown, map: (item: unknown) => T, previousCursor: string | null, limit: number): Page<T> {
  const connection = record(value);
  const info = record(connection.pageInfo);
  const more = bool(info.hasNextPage);
  const cursor = nullableString(info.endCursor);
  const nodes = array(connection.nodes);
  if (nodes.length > limit || (cursor !== null && cursor.length > 2048)) invalid();
  const items = nodes.map(map);
  if (more && (!cursor || cursor === previousCursor || items.length === 0)) invalid();
  return { items, nextCursor: more ? cursor : null };
}
export function shopifyId(value: string, resource: 'Product' | 'Order'): string {
  if (typeof value !== 'string' || !new RegExp(`^gid://shopify/${resource}/[1-9][0-9]*$`).test(value)) throw new ConnectorError('INVALID_REQUEST');
  return value;
}
export function wooId(value: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ConnectorError('INVALID_REQUEST');
  return value;
}
