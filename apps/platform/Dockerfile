FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/pkg ./packages/pkg
COPY apps/platform ./apps/platform
RUN npm ci --workspace=apps/platform
RUN npm run build --workspace=packages/pkg
RUN npm run build --workspace=apps/platform

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/platform/.next/standalone ./
COPY --from=builder /app/apps/platform/.next/static ./apps/platform/.next/static
COPY --from=builder /app/apps/platform/public ./apps/platform/public
EXPOSE 3001
ENV PORT=3001
CMD ["node", "apps/platform/server.js"]
