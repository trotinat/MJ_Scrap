# syntax=docker/dockerfile:1.7
# One Dockerfile, two runtime targets:  --target web  |  --target worker

ARG NODE_IMAGE=node:22-bookworm-slim
# Must match the "playwright" version in apps/worker/package.json.
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.56.1-noble

############################ build ############################
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CI=1
RUN corepack enable
WORKDIR /repo

# Dependency layer (cached while lockfile and manifests are unchanged)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/scraper/package.json packages/scraper/
COPY packages/scoring/package.json packages/scoring/
COPY packages/notifications/package.json packages/notifications/
RUN pnpm install --frozen-lockfile

COPY . .
RUN NEXT_STANDALONE=1 pnpm --filter @mdw/web build \
 && pnpm --filter @mdw/worker build \
 && pnpm --filter @mdw/worker deploy --prod --legacy /out/worker

############################ web ##############################
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

############################ worker ###########################
# Official Playwright image: Chromium + its system libraries, non-root "pwuser".
FROM ${PLAYWRIGHT_IMAGE} AS worker
ENV NODE_ENV=production MIGRATIONS_DIR=/app/drizzle HEALTH_PORT=8081
WORKDIR /app
COPY --from=build --chown=pwuser:pwuser /out/worker/node_modules ./node_modules
COPY --from=build --chown=pwuser:pwuser /out/worker/package.json ./package.json
COPY --from=build --chown=pwuser:pwuser /repo/apps/worker/dist ./dist
COPY --from=build --chown=pwuser:pwuser /repo/packages/database/drizzle ./drizzle
USER pwuser
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8081/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
