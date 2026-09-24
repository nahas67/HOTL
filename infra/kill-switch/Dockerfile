# Build and publish this image only through kill-switch-ci.yml.
FROM node:22-alpine AS build
WORKDIR /kill-switch
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json && npm prune --omit=dev

FROM node:22-alpine AS runtime
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
