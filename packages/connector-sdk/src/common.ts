import { ConnectorError, normalizeConnectorError } from './errors.js';
import type { CapabilityManifest, ConnectorCapability, ConnectorHealth } from './types.js';

export function requireCapability(manifest: CapabilityManifest, capability: ConnectorCapability): void {
  if (!manifest.capabilities.includes(capability)) throw new ConnectorError('CAPABILITY_UNAVAILABLE');
}
export function validateSecret(secret: string): string {
  if (typeof secret !== 'string' || !secret || secret.length > 8192 || /[\r\n\x00]/.test(secret)) throw new ConnectorError('INVALID_CONFIGURATION');
  return secret;
}
export async function checkHealth(manifest: CapabilityManifest, probe: () => Promise<unknown>): Promise<ConnectorHealth> {
  try {
    await probe();
    return { provider: manifest.provider, status: 'connected', checkedAt: new Date().toISOString(), checkedCapabilities: ['catalog.read'], error: null };
  } catch (error) {
    const safe = normalizeConnectorError(error);
    const status = safe.code === 'AUTHENTICATION_FAILED' ? 'authentication_required'
      : safe.code === 'AUTHORIZATION_FAILED' ? 'permission_required'
      : safe.code === 'RATE_LIMITED' ? 'rate_limited' : 'unavailable';
    return { provider: manifest.provider, status, checkedAt: new Date().toISOString(), checkedCapabilities: [], error: { code: safe.code, message: safe.message, retryable: safe.retryable } };
  }
}
