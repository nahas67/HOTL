import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';

export interface AuthConfig {
  mode: 'simulation' | 'live';
  ownerToken: string;
  readToken: string;
  demoPassword: string;
  proofSecret: string;
  supabaseUrl?: string;
  ownerIds: string[];
}

export function equalSecret(value: string, expected: string) {
  if (!value || !expected) return false;
  return timingSafeEqual(createHash('sha256').update(value).digest(), createHash('sha256').update(expected).digest());
}

export function recentAuthentication(payload: JWTPayload, now = Math.floor(Date.now() / 1000)) {
  const amr = payload.amr;
  return Array.isArray(amr) && amr.some((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const { timestamp, method } = item as { timestamp?: unknown; method?: unknown };
    return typeof timestamp === 'number' && typeof method === 'string' &&
      ['password', 'otp', 'totp', 'mfa', 'webauthn'].includes(method) && now - timestamp <= 300 && timestamp <= now + 30;
  });
}

export function createAuth(config: AuthConfig) {
  if (config.mode === 'live' && (!config.supabaseUrl || !config.ownerIds.length || config.readToken.length < 32)) {
    throw new Error('Live kill switch requires independent Supabase URL, pinned owner IDs, and a strong read token');
  }
  const jwks = config.supabaseUrl ? createRemoteJWKSet(new URL(`${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`)) : null;
  const proofKey = new TextEncoder().encode(config.proofSecret || randomBytes(32).toString('hex'));
  return {
    read(token: string) { return equalSecret(token, config.readToken); },
    async issueProof(token: string, password: string) {
      if (config.mode !== 'simulation' || !equalSecret(token, config.ownerToken) || !equalSecret(password, config.demoPassword)) throw new Error('Reauthentication failed');
      return new SignJWT({ reauthenticated: true }).setProtectedHeader({ alg: 'HS256' }).setSubject('local-owner')
        .setAudience('hotl-kill-switch').setIssuedAt().setExpirationTime('5m').sign(proofKey);
    },
    async owner(token: string, proof: string | undefined, reauthenticate = true) {
      if (config.mode === 'simulation') {
        if (!equalSecret(token, config.ownerToken)) throw new Error('Owner authorization required');
        if (reauthenticate) {
          if (!proof) throw new Error('Recent reauthentication required');
          const { payload } = await jwtVerify(proof, proofKey, { algorithms: ['HS256'], audience: 'hotl-kill-switch', subject: 'local-owner' });
          if (payload.reauthenticated !== true) throw new Error('Recent reauthentication required');
        }
        return 'local-owner';
      }
      if (!jwks || !config.supabaseUrl) throw new Error('Live owner authentication unavailable');
      const { payload } = await jwtVerify(token, jwks, { issuer: `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1`, audience: 'authenticated', algorithms: ['ES256', 'RS256'] });
      const metadata = payload.app_metadata as { role?: string } | undefined;
      if (!payload.sub || !config.ownerIds.includes(payload.sub) || metadata?.role !== 'owner') throw new Error('Pinned owner authorization required');
      if (reauthenticate && !recentAuthentication(payload)) throw new Error('Recent reauthentication required');
      return payload.sub;
    },
  };
}
