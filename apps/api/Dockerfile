FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/pkg ./packages/pkg
COPY packages/agents ./packages/agents
COPY packages/orchestrator ./packages/orchestrator
COPY apps/api ./apps/api
RUN npm ci --workspace=apps/api
RUN npm run build --workspace=packages/pkg
RUN npm run build --workspace=packages/agents
RUN npm run build --workspace=packages/orchestrator
RUN npm run build --workspace=apps/api
CMD ["node", "apps/api/dist/index.js"]
