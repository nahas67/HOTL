# HOTL on ChatGPT Sites

**Reviewed:** 2026-10-08

**Result:** Hybrid deployment — one private, static, read-only owner presentation on ChatGPT Sites; the HOTL commerce runtime remains outside Sites.

**Site:** [HOTL Owner Control](https://hotl-owner-control.jesttest8.chatgpt.site)

**Audience:** private; the verified access policy contains one account viewer, no groups, no editors, and no external visitors.
**Custom domain:** none.

The Site is an interactive owner-facing UI with 16 primary views and three Gate A/B/C detail routes. **Demo** mode uses fictional, self-contained commerce fixtures; **Checkpoint** mode displays the separate repository facts reviewed on 2026-10-03 and shows `Unknown` when a real business feed is absent. This is not a live cockpit connection. It does not report live health, load HOTL data, approve work, pause services, stop the business, contact a provider, or change commerce. The visible demo is explicitly labeled as illustrative and cannot authorize action. The Site hosting URL being deployed does not make the HOTL backend a production system.

## Architecture and current boundary

```text
Owner
  └─ private ChatGPT Site: static owner UI, sample fixtures + recorded checkpoint, no backend requests
       └─ [no connection configured]

Local HOTL / future separately deployed control plane
  ├─ Cockpit and storefront
  ├─ Guardrail API ── provider writes and durable authorization
  ├─ Commerce gateway / Shopify connector / webhook workers
  ├─ LangGraph orchestrator and checkpoints
  ├─ PostgreSQL / optional Redis and BullMQ / LiteLLM
  └─ Independent kill-switch service and revocation authority
```

The Site does not proxy to the local cockpit or general HOTL APIs. Its static Content Security Policy sets `connect-src 'none'` and `form-action 'none'`; there are no app API routes, D1/R2 bindings, or server environment variables configured for this UI. Browser-local presentation preferences are the only saved state. Site access and HOTL business authorization remain separate controls. A future live cockpit connection needs a narrow authenticated read API, explicit owner/workspace binding, bounded data, visible freshness, and independent denial tests before it can display operational records.

## Compatibility matrix

`SITES_NATIVE` means usable directly as a Sites capability. `SITES_ADAPTABLE` means a bounded port is technically suitable. `EXTERNAL_REQUIRED` means HOTL’s state, isolation, or operational contract stays on a protected external runtime. `UNSUPPORTED` means the required pattern is unavailable. `UNKNOWN` means public documentation or project evidence does not establish the behavior. Compatibility describes fit, not whether HOTL has implemented or deployed it.

| Component | Fit | Destination and status | Why, security implications, migration work, blockers |
| --- | --- | --- | --- |
| Owner cockpit | `SITES_ADAPTABLE` | Private Sites deployment: static UI with local sample fixtures and separately recorded checkpoint. Existing live cockpit remains in `apps/cockpit`. | Sites can host a supported web surface, but the current Next.js standalone build and owner-authenticated Node BFF are not directly deployed. The hosted copy has all API calls and mutations removed. A live version needs a verified Worker-compatible port and HOTL owner identity bridge. |
| Storefront | `SITES_ADAPTABLE` for a static catalog; `EXTERNAL_REQUIRED` for live commerce | Deferred; no storefront is deployed. | A static presentation could be ported, but checkout, price/inventory validation, payments, orders, and provider calls belong behind protected commerce services. Do not expose a public shop or process card data through this Site. Public storefront intent remains unapproved. |
| Guardrail API | `EXTERNAL_REQUIRED` | `apps/guardrail-service`; hosted production destination not provisioned. | Its transactional policy, audit-before-success, idempotency, identity binding, provider write credentials, and failure behavior are authoritative. A Site UI or LLM cannot reproduce its policy. |
| Shopify OAuth callback | `EXTERNAL_REQUIRED` | Commerce/guardrail backend; Gate C staging is not configured. | Sites supports web hosting and server-side configuration, but the project has not proved Shopify state/cookie handling, callback identity binding, encrypted token custody, or operational recovery there. Keep callback and token exchange behind HOTL. |
| Shopify webhook receiver | `EXTERNAL_REQUIRED` | `apps/commerce-core` protected ingress. No endpoint is deployed. | No Site evidence proves Shopify raw-body HMAC verification, delivery ID replay checks, strict body limits, durable inbox write-before-ack, or fast reliable acknowledgement. |
| Shopify reconciliation worker | `EXTERNAL_REQUIRED` | Separate persistent worker with the commerce database. No staging worker is deployed. | Reconciliation needs durable jobs, retry/dead-letter/restart behavior, current provider evidence, and lock-aware uncertain-outcome handling; a page request or browser timer is not a substitute. |
| LangGraph orchestrator | `EXTERNAL_REQUIRED` | `apps/orchestrator` and its checkpoint store; currently local. | Long-running graph runs, interrupts, durable checkpoints, and guardrail calls need a server/worker runtime and persistent state. The static Site has neither. |
| PostgreSQL | `EXTERNAL_REQUIRED` | Existing PostgreSQL/Supabase target; no hosted HOTL database has passed deployment/restore proof. | Sites D1 is relational but its 10 GB site limit does not establish HOTL’s PostgreSQL contract: FORCE RLS, role separation, transactions, advisory locking, privilege denial, audit durability, backup, and restore. No migration is planned. |
| Redis / BullMQ | `EXTERNAL_REQUIRED` | Optional Redis queue and isolated workers; not deployed. | Sites documentation does not establish a persistent Redis-compatible queue service or always-running worker contract. Raw TCP is not supported by Sites. |
| LiteLLM | `EXTERNAL_REQUIRED` | Protected model proxy with one virtual key per runtime agent; not hosted in Sites. | Runtime model traffic and proxy administration keys must remain isolated from browser code. The Site has no model key or model endpoint. |
| Independent kill switch | `EXTERNAL_REQUIRED` | `infra/kill-switch`, separate deployment/storage/credentials; current deployment not configured. | It must remain independently reachable and durably latched. Co-hosting it in the ordinary Site would remove failure-domain and credential independence. The Site exposes no stop control. |
| Evidence and audit storage | `SITES_ADAPTABLE` for sanitized presentation copies; `EXTERNAL_REQUIRED` for authority | Evidence remains in repository/evidence packages and protected runtime journals. The Site includes fixed status text plus hard-coded fictional UI fixtures. | D1/R2 could hold non-authoritative presentation data, but a Site copy cannot become the durable audit source, signed provider receipt, backup, or restore record. No business ledger, customer record, or operational event was copied. |
| Scheduled workflows | `EXTERNAL_REQUIRED` | HOTL business schedules/workers remain on a protected control plane; none are running. | Site update automations do not establish an always-on job queue, durable worker, or business retry/recovery contract. No recurring Site update was requested or created. |
| MCP interface | `SITES_ADAPTABLE` | Not implemented; no plugin or MCP tools are enabled. | Sites can host an MCP plugin, but HOTL has no API/identity connector suitable for verified read tools yet. Static data-only tools would add no live value. Begin later with narrow reads and tenant-bound authorization; no unrestricted writes. |

## Current Sites capability findings

Research checked official OpenAI Sites documentation on **2026-10-03**. The public developer guide describes a supported Sites runtime rather than an unrestricted VM. It says HTTP, HTTPS, and WebSockets are supported and raw inbound/outbound TCP is not; it identifies a 10 GB D1 limit and no fixed R2 storage limit. It also warns that some frameworks, private networks, databases, background services, and hosting patterns are unsupported. Sites does not offer data or inference residency at launch. The existing HOTL database, queues, and backend were therefore not moved. [Sites developer guide](https://learn.chatgpt.com/docs/sites)

| Capability | Current finding and HOTL decision |
| --- | --- |
| Node.js | Sites is not a general-purpose persistent Node host. This deployment is static HTML/CSS/JavaScript; no Node server runs in Sites. Public request/CPU duration ceilings were not found in the documentation checked. |
| Next.js and server routes | Sites offers a supported framework/Worker path, including its bundled Vinext starter. The HOTL cockpit uses Next.js standalone and a privileged Node BFF; its exact build and route behavior has not been proven on Sites. We ported a separate static read-only surface instead. |
| Storage and databases | D1: 10 GB per Site; R2: no fixed storage limit in the published table. Neither is configured here. These figures do not establish equivalence to HOTL PostgreSQL transactions, roles, RLS, locks, audit, backup, or restore. |
| Secrets and environment values | Sites settings support hosted environment variables and secrets for server runtime. They must not be put in `hosting.json`, prompts, or client assets. This static Site has zero hosted environment entries and zero hosted secrets. |
| Network and protocols | Official guide: HTTP, HTTPS, WebSockets supported; raw TCP inbound/outbound unsupported. SSE was not established in the documentation checked. This Site’s own CSP blocks all `connect-src` requests. |
| HTTPS routes, OAuth, and webhooks | A published Site has a hosted URL, but that alone does not prove Shopify callback semantics, raw-body signature handling, durable acknowledgements, idempotency, or delivery/recovery guarantees. Those routes remain external. |
| Background work | The documentation warns that some background services/hosting patterns are unsupported. A scheduled Site update is not HOTL’s persistent queue/worker contract. Keep Shopify processing, reconciliation, BullMQ, and LangGraph workers external. |
| MCP and plugins | Sites can host a plugin/MCP experience. Site sharing does not itself grant connected-app access or HOTL business authorization. No HOTL MCP server or plugin is implemented here. [Hosting a plugin with ChatGPT Sites](https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites) |
| Identity and access | Sites offers owner/workspace audience controls and documented Sign in with ChatGPT for identity-aware server features. This static UI uses the Site audience only; it does not impersonate or assert HOTL business-owner authorization. The actual Site access list was verified after the update. [Creating and using ChatGPT Sites](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites) |
| Public/private and beta | Sites is public beta with plan-specific aggregate usage limits. Limits are shown in the account UI; the current account’s numeric quota was not observable here because the account UI opened signed out and Sites APIs expose no quota values. This Site’s create and private deploy succeeded, which confirms availability for this one operation only. |
| Custom domains | No custom domain is attached. OpenAI documents custom-domain availability as plan/workspace dependent and says custom domains were unavailable to Enterprise at launch. No domain was supplied for HOTL. |
| Execution limits and availability | No public request-duration, CPU, concurrency, uptime/SLA, or traffic ceiling was available in the documentation checked. Do not use this static deployment as evidence of capacity for HOTL workers or a production API. |

OpenAI’s help documentation says plan-specific beta usage can limit Site creation, storage, or continued public availability. This Site is private, and its current numeric account allowance remains unknown. The Site UI also has no data/inference residency at launch. Do not put payment-card data or protected health information into Sites. [Sites workspace management](https://help.openai.com/en/articles/20001338-managing-chatgpt-sites-for-your-workspace)

## Access, secrets, data, and cost

- **Authentication:** Sites account access only. Post-deploy `get_site` reported `custom` access with one allowed account user, zero groups, zero editors, and zero external visitors. No Sign in with ChatGPT application login or HOTL session token is used. Keep HOTL workspace/owner authorization mandatory for any future API integration.
- **Secrets:** The deployed source/archive contains no provider, database, queue, model, or emergency credentials. The Site runtime has zero environment entries and zero secret entries. Future Shopify client/token/webhook secrets remain in the protected commerce/guardrail environment; database and Redis credentials remain with their service; LiteLLM virtual/master keys remain in the proxy provisioning boundary; emergency revocation credentials remain with the independent kill deployment. Never put them in the Site or browser bundle.
- **Database and evidence:** No D1, R2, PostgreSQL, or Redis binding is configured. Authoritative HOTL state and audit/kill journals remain in their existing stores. The static UI includes only non-sensitive checkpoint statements and invented demonstration data; it contains no merchant or customer records.
- **Cost:** This Site uses the ChatGPT Sites capacity included with the account’s current plan/beta access; no extra runtime service, custom domain, model key, or database was configured. The account’s quota/plan renewal cost was not visible. A future protected backend may require paid database, queue, hosting, and model capacity; no reliable cost estimate exists until region, volume, retention, and service tiers are selected.

## Deployment and rollback

The reviewed source lives at `sites/hotl-owner-console`; `.openai/hosting.json` records the Sites project identity. Publishing uses an isolated, ignored `.sites-checkout` that copies only the Site package, not HOTL Git history, local business data, the ZIP archives, or environment files. The current deployed version is **version 2**, source commit `22eccdf62be0a292fdad479837438dbc044e26d7`, deployment `appgdep_6ac7526df5088191966fc716e6249af0`. Sites reported `succeeded` at `https://hotl-owner-control.jesttest8.chatgpt.site`; the archive was 29,990 bytes and contains static build output plus the hosting manifest, not the application source tree.

The local preview was built and reviewed at desktop and mobile dimensions before publication. The available Sites connector exposes saved-version and production-deployment operations but no separate preview-deployment operation. Publication used the owner-private deployment path after that local review. A post-deploy `get_site` confirmed active status, owner role, custom/private access, one allowed account, and zero groups, editors, and external visitors. No public deployment or audience change was made.

For an update, edit the tracked Site source; run `node scripts/build.mjs`; synchronize an isolated checkout; build/package that exact source commit; save the version; and deploy through the owner-private operation. Never publish by force-pushing. Preserve prior saved versions. To roll back, deploy a previously saved version to the same verified owner-only Site; do not delete the Site. Restrict its audience immediately if an unexpected viewer or public state is detected.

## Verification and limits

| Check | Result |
| --- | --- |
| Static build | Passed for the updated UI: `node scripts/build.mjs`. |
| JavaScript syntax | Passed: `node --check` for app, data, UI, and view modules. |
| Site tests | Not run for this UI update; the version 1 test record in [`evidence/chatgpt-sites-deployment-2026-10-03/README.md`](../evidence/chatgpt-sites-deployment-2026-10-03/README.md) does not validate version 2. |
| Local HTTP preview | Passed: updated build rendered at `127.0.0.1:4174`; manual browser checks covered demo/checkpoint switching, mobile navigation, product catalog, and the full route list. Desktop viewport measured 1536×1024 with no vertical overflow; 390px mobile had no horizontal overflow; no browser page errors were observed. Screenshots are in the dated evidence package. |
| Site deployment | See the dated evidence package for the exact updated version, source SHA, and terminal deployment result. |
| Site audience | Before the update, `get_site` verified owner role, `custom` access, one allowed account, zero groups, editors, and external visitors. Owner-private deployment is enforced without changing access. |
| Site runtime secrets | No environment variable or secret was added or changed for the UI update. The v1 read reported zero entries; values were not printed. |
| Custom domains | Passed: 0 attached domains. |
| Secret and network boundary | No credential was added. Source inspection found no `fetch`, XHR, WebSocket, EventSource, HTML form, or external service URL; CSP sets `connect-src 'none'` and `form-action 'none'`. The v1 automated secret scan is historical; no new automated secret scan was run for v2. |
| Browser bundle/network | No HOTL or provider endpoint is configured. Browser-local storage contains presentation preferences only. |
| Backend auth, live API, Shopify, MCP, approval and integration tests | Not applicable to this static Site: it has no backend or MCP connection. No Shopify request or commerce action was made. |
| Account usage quotas | Numeric quota not observable; ChatGPT Sites account UI was signed out. Successful private deployment proves only that the current Site operation was allowed. |
| Full repository release suite and Docker/hosted database drills | Not run for this Site-only change. No guardrail, orchestrator, database, or commerce runtime code changed. |

Gate A remains **OWNER INPUT REQUIRED**; AI research is recommendation-only and cannot approve country, product, economics, capital, reserve, exposure, refunds, or stop rules. Gate C remains **BLOCKED**: the authorized Shopify development store/app and trusted HTTPS URLs remain unconfigured; static preflight still lists 19 missing settings; active probes and Shopify operations were not run. No spending, purchases, advertising, payments, or autonomous provider actions are enabled by this deployment.

## Official sources

Documentation checked 2026-10-03:

- [Sites – ChatGPT developer guide](https://learn.chatgpt.com/docs/sites)
- [Creating and using ChatGPT Sites](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites)
- [Managing ChatGPT Sites for your workspace](https://help.openai.com/en/articles/20001338-managing-chatgpt-sites-for-your-workspace)
- [Hosting a plugin with ChatGPT Sites](https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites)
