# Build and publish this image only through kill-switch-ci.yml.
#
# ---------------------------------------------------------------------------
# BASE IMAGE REGISTRY — read this before "simplifying" it back to Docker Hub.
# ---------------------------------------------------------------------------
# Both FROM lines below read from public.ecr.aws, not from Docker Hub. That is
# deliberate and it is not cosmetic.
#
# On 2026-10-10 every container step on the repair branch failed while
# authenticating to Docker Hub, in this order:
#
#     429 Too Many Requests
#     504 Gateway Timeout
#     context deadline exceeded      (against auth.docker.io)
#
# Every code-level step in the same runs was green. The failure was runner-side
# registry rate-limiting, not a defect in this repository, and the checks were
# deliberately left in the pipeline rather than deleted.
#
# public.ecr.aws/docker/library/* is Amazon's byte-identical mirror of the
# official Docker Hub images, so the substitution changes the registry and
# nothing else. Verified by resolving both references and comparing:
#
#     docker buildx imagetools inspect node:22-alpine
#     docker buildx imagetools inspect public.ecr.aws/docker/library/node:22-alpine
#     -> both sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
#
# The digest is pinned as well as the tag, so the build is reproducible and a
# moved or re-published tag cannot silently change what the emergency plane is
# built from. The tag is retained for readability only; the digest is the pin.
#
# Do not replace these references with `node:22-alpine`. If Docker Hub stops
# rate-limiting runners, that change is harmless -- but keeping the mirror means
# the next outage does not return, and the digest comparison above is the
# evidence that the mirror is the same image.
#
# ---------------------------------------------------------------------------
# CREDENTIALS
# ---------------------------------------------------------------------------
# No ARG or ENV in this file may ever carry a credential, token, or secret, and
# the only workflow permitted to build this image (kill-switch-ci.yml) passes no
# --build-arg and no --secret. The emergency plane is a one-way latch; a
# credential baked into one of its layers would be permanent.
FROM public.ecr.aws/docker/library/node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /kill-switch
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json && npm prune --omit=dev

# Same registry and digest as the build stage, for the reason documented above.
FROM public.ecr.aws/docker/library/node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
ENV NODE_ENV=production HOTL_MODE=live KILL_SWITCH_HOST=0.0.0.0 KILL_SWITCH_PORT=4200 KILL_SWITCH_JOURNAL=/state/events.jsonl
WORKDIR /kill-switch
COPY --from=build /kill-switch/dist ./dist
COPY --from=build /kill-switch/node_modules ./node_modules
COPY package.json ./package.json
RUN mkdir /state && chown node:node /state
USER node
VOLUME ["/state"]
EXPOSE 4200
HEALTHCHECK --interval=20s --timeout=3s CMD node -e "fetch('http://127.0.0.1:4200/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
