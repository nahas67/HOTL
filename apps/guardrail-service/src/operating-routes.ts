import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Actor } from '@hotl/schemas';
import { ConnectorError } from '@hotl/connector-sdk';
import { GuardrailError, type GuardrailEngine } from './engine.js';
import { IntegrationService } from './integration-service.js';
import { financeOverview } from './finance.js';

type Access = { owner(request: FastifyRequest): Promise<Actor>; key(request: FastifyRequest): string; integrations?: IntegrationService };

export function registerOperatingRoutes(app: FastifyInstance, engine: GuardrailEngine, access: Access) {
  const integrations = access.integrations ?? new IntegrationService(engine);
  const id = (request: FastifyRequest) => z.object({ id: z.string().uuid() }).parse(request.params).id;
  const base = '/api/guardrails/v1';
  async function safe<T>(callback: () => Promise<T>) {
    try { return await callback(); }
    catch (error) {
      if (error instanceof ConnectorError) throw new GuardrailError(error.code, error.message, ['INVALID_CONFIGURATION', 'UNSAFE_DESTINATION', 'INVALID_REQUEST'].includes(error.code) ? 400 : 502);
      throw error;
    }
  }
  app.get('/api/finance', async request => {
    await access.owner(request);
    const { period } = z.object({ period: z.enum(['7d', '30d', 'all']).default('30d') }).strict().parse(request.query);
    return financeOverview(await engine.snapshot(), engine.mode, period);
  });
  app.get('/api/integrations', async request => integrations.list(await access.owner(request)));
  app.get('/api/integration-catalog', async request => {
    const actor = await access.owner(request);
    const { connectionId } = z.object({ connectionId: z.string().uuid().optional() }).strict().parse(request.query);
    return integrations.catalog(actor, connectionId);
  });
  app.post(`${base}/integrations`, async request => { const actor = await access.owner(request); return safe(() => integrations.register(request.body, actor, access.key(request))); });
  app.post(`${base}/integrations/:id/credentials`, async request => { const actor = await access.owner(request); return safe(() => integrations.credentials(id(request), request.body, actor, access.key(request))); });
  app.post(`${base}/integrations/:id/sync`, async request => { const actor = await access.owner(request); return safe(() => integrations.sync(id(request), request.body, actor, access.key(request))); });
  app.post(`${base}/integrations/:id/disconnect`, async request => { const actor = await access.owner(request); return integrations.disconnect(id(request), request.body, actor, access.key(request)); });
}
