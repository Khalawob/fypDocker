# DEV Dockerfile for React app 
FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm install

# Copy the rest
COPY . .

EXPOSE 3000

# CRA: npm start, Vite: npm run dev
CMD ["npm", "start"]