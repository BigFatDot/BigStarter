FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/pkg ./packages/pkg
COPY packages/agents ./packages/agents
COPY apps/worker ./apps/worker
RUN npm ci --workspace=apps/worker
RUN npm run build --workspace=packages/pkg
RUN npm run build --workspace=packages/agents
RUN npm run build --workspace=apps/worker
CMD ["node", "apps/worker/dist/index.js"]
