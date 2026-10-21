FROM node:20-alpine

# Install git, which is required to fetch git-based npm dependencies (like Baileys)
RUN apk add --no-cache git

# Suppress npm update notice
ENV NO_UPDATE_NOTIFIER=1
ENV npm_config_update_notifier=false

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3002

CMD ["node", "src/app.js"]
