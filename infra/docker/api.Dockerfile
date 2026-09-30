# syntax=docker/dockerfile:1.7

FROM node:26-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apk add --no-cache dumb-init libc6-compat \
    && corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @our-tomorrow/api prisma:generate \
    && pnpm --filter @our-tomorrow/api... build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=build --chown=node:node /workspace/apps/api /workspace/apps/api
COPY --from=build --chown=node:node /workspace/packages /workspace/packages
WORKDIR /workspace/apps/api
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
