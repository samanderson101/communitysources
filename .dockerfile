# Use the official Node.js 16 image as the base
FROM node:16

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json files for root, server, and client
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install root dependencies (if any)
RUN npm install

# Install server dependencies
RUN npm install --prefix server

# Install client dependencies and build the client
RUN npm install --prefix client
RUN npm run build --prefix client

# Copy the rest of your application code
COPY . .

# Expose the port (use the PORT environment variable provided by Railway)
EXPOSE ${PORT}

# Start the server
CMD ["node", "server/src/server.js"]