# Use the official Node.js image via Amazon ECR Public, not Docker Hub.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app

# Kept's migrations and API run TypeScript through the tsx loader.
# Install workspace dependencies (including tsx) before copying source.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/commitment-catalogue/package.json packages/commitment-catalogue/package.json
RUN npm ci --include=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "run", "api:start"]
