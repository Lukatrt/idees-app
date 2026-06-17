# ── Étape 1 : Build de l'application
FROM node:22-alpine AS builder
WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm ci

# Copie du code source et compilation
COPY . .
RUN npm run build

# ── Étape 2 : Serveur de production Nginx
FROM nginx:stable-alpine
WORKDIR /usr/share/nginx/html

# Copie des fichiers compilés
COPY --from=builder /app/dist .

# Configuration Nginx personnalisée pour la PWA
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
