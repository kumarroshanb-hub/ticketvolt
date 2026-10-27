# frontend/Dockerfile
FROM node:18-alpine AS build

ENV NO_UPDATE_NOTIFIER=1
ENV npm_config_update_notifier=false
ENV NPM_CONFIG_LOGLEVEL=error
ENV DISABLE_ESLINT_PLUGIN=true
ENV CI=false

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including qrcode.react
RUN npm install --no-fund --no-audit --legacy-peer-deps

# Install qrcode.react explicitly
RUN npm install qrcode.react@3.1.0 --no-fund --no-audit

# Copy source
# NOTE: Do NOT regenerate src/constants/index.js here. The real file
# checked into the repo is the single source of truth. Any echo-generated
# copy will drift out of sync (this is exactly what caused the missing
# EVENT_CATEGORY_ICONS export).
COPY . .

# Build
RUN npm run build --no-fund --no-audit

# Production stage
FROM nginx:alpine

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]