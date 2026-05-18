FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package.json package-lock.json* ./
RUN npm install
COPY src ./src
CMD ["npm", "start"]
