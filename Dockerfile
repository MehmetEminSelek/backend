# Backend Dockerfile - Production Ready
FROM node:20-alpine AS base

# Install dependencies for building
RUN apk add --no-cache libc6-compat wget

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY . .

# Build Next.js application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy built application
COPY --from=base /app/package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/.next ./.next
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/pages ./pages
COPY --from=base /app/lib ./lib
COPY --from=base /app/middleware ./middleware
COPY --from=base /app/src ./src
COPY --from=base /app/veriler ./veriler
COPY --from=base /app/server.js ./server.js
COPY --from=base /app/next.config.js ./next.config.js

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S backend -u 1001
RUN chown -R backend:nodejs /app

USER backend

EXPOSE 3000

# Environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/dropdown || exit 1

CMD ["npm", "run", "start"] 