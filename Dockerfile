# Canto Drop — production image
FROM node:22-alpine

WORKDIR /app

# Install deps first (better layer caching). Only production deps.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
