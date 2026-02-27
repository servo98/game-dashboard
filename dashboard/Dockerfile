FROM node:20-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

ARG CACHE_BUST
COPY . .
RUN npm run build

# Serve the static build with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
