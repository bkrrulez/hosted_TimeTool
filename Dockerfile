# Dockerfile for Next.js Application

# 1. Base Image: Use the official Node.js 20 image.
FROM gitlab.tuwien.ac.at/e210-02/dependency_proxy/containers/node:20-slim AS base

# 2. Set working directory
WORKDIR /app

# 3. Install dependencies
# Use full versions of package.json and package-lock.json for consistent builds
COPY package*.json ./
RUN npm install

# 4. Copy application code
COPY . .

# 5. Build the application
# This command creates a production-optimized build of your Next.js app.
RUN npm run build

# 6. Production Image: Create a smaller, more secure image for production.
FROM gitlab.tuwien.ac.at/e210-02/dependency_proxy/containers/node:20-slim AS production

WORKDIR /app

# Copy over the built application from the 'base' stage
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json

# 7. Expose the port the app runs on
EXPOSE 3000

# 8. Start the application
# This command starts the Next.js production server.
CMD ["npm", "start"]