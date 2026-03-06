FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src ./src

# Create uploads directory (mounted as a named volume in production)
RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "src/index.js"]
