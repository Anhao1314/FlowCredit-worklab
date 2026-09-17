FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
WORKDIR /app
COPY package.json package-lock.json core.lock.json ./
COPY scripts/setup-core.mjs scripts/setup-core.mjs
RUN npm install --global npm@11.11.0 --no-audit --no-fund \
    && npm ci --omit=dev --no-audit --no-fund \
    && mkdir -p /app/.runtime \
    && chown node:node /app/.runtime
COPY apps/runtime apps/runtime
COPY apps/web apps/web
COPY packages packages
COPY fixtures/northstar fixtures/northstar
USER node
ENV NODE_ENV=development
EXPOSE 8800
CMD ["node", "apps/runtime/server.mjs"]
