FROM node:24-slim

WORKDIR /app

COPY package*.json ./
COPY dist ./dist

EXPOSE 3000

RUN npm install --omit=dev

CMD ["node", "dist/index.js"]