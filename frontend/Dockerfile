# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Build Next.js
RUN npm run build

# Expose Next.js port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]