# Stage 1: Build
FROM node:22.22-alpine3.23 AS builder

RUN npm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build for production
ARG VITE_PHONE_AUTH_ENABLED=true
ENV VITE_PHONE_AUTH_ENABLED=${VITE_PHONE_AUTH_ENABLED}
RUN npm run build

# Stage 2: Serve
FROM nginx:1.31.4-alpine3.24

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
