# ── Étape 1 : Build de l'application React
FROM node:22-alpine AS builder
WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm ci

# Copie du code source et compilation
COPY . .
RUN npm run build

# ── Étape 2 : Serveur de production Node/Express
FROM node:22-alpine
WORKDIR /app

# Copie et installation des dépendances de production uniquement
COPY package*.json ./
RUN npm ci --only=production

# Copie du serveur et des fichiers de build statiques
COPY server.js ./
COPY --from=builder /app/dist ./dist

# Création du dossier data pour le montage de volume
RUN mkdir -p data

EXPOSE 8289

ENV NODE_ENV=production
ENV PORT=8289

CMD ["node", "server.js"]
