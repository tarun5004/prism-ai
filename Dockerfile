FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json ./
COPY client/package*.json ./client/
RUN npm ci --prefix client
COPY client ./client
RUN npm run build --prefix client

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix server && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=5000
WORKDIR /app
COPY --chown=node:node --from=dependencies /app/server/node_modules ./server/node_modules
COPY --chown=node:node server/package.json ./server/package.json
COPY --chown=node:node server/src ./server/src
COPY --chown=node:node server/scripts ./server/scripts
COPY --chown=node:node --from=frontend /app/client/dist ./client/dist
COPY --chown=node:node docs/beta/evaluation-cases.json docs/beta/evaluation-live-dev.json ./docs/beta/
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/server.js"]
