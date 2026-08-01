# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/ui ./packages/ui

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY packages/ui ./packages/ui

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/ui ./packages/ui

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
