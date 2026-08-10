# Stage 1: Build
FROM node:18-alpine as builder

RUN npm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build for production
ARG VITE_PHONE_AUTH_ENABLED=false
ENV VITE_PHONE_AUTH_ENABLED=${VITE_PHONE_AUTH_ENABLED}
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
