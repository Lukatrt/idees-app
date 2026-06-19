# Guide de Développement et Déploiement - Idées App

Ce projet contient l'application progressive PWA **Idées** construite avec React et Vite. Elle intègre la synchronisation en temps réel, un sélecteur de profils d'utilisateurs et une intégration IA (Gemini).

## ⚙️ Configuration Locale

1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Lancer le serveur de développement local :
   ```bash
   npm run dev
   ```
3. Compiler le bundle de production :
   ```bash
   npm run build
   ```

---

## 🚀 Informations de Déploiement

- **Serveur Portainer** : `https://portainer.ekonum.fr`
- **Jeton d'accès (API Token)** : `ptr_YyQt2GCd1ERBJgvPURF/cayXxl1GStMC9lkFlqMQr58=`
- **ID de l'environnement (Endpoint ID)** : `2`
- **ID de la Stack Portainer** : `94`
- **Dépôt Git distant** : `git@github.com:Lukatrt/idees-app.git`
- **Lien de l'application en ligne** : [ideesapp.ekonum.fr](https://ideesapp.ekonum.fr)

### Procédure de mise en production rapide (Redéploiement)

Lorsque vous poussez des modifications sur la branche `main` de GitHub, vous pouvez déclencher la reconstruction automatique de l'image de production et le redéploiement de la stack Nginx sur Portainer en exécutant la commande curl suivante :

```bash
curl -s -k -X PUT "https://portainer.ekonum.fr/api/stacks/94/git/redeploy?endpointId=2" \
  -H "X-API-Key: ptr_YyQt2GCd1ERBJgvPURF/cayXxl1GStMC9lkFlqMQr58=" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 🔌 API Endpoints du Serveur

- **`GET /api/data`** : Récupère la base de données actuelle des idées et catégories.
- **`POST /api/data`** : Écrit la base de données entière des idées et catégories.
- **`POST /api/external-add`** : Utilisé notamment par les **raccourcis iPhone (iOS Shortcuts)** pour rajouter une note ou un lien à la volée.
  * Exemple de corps de requête :
    ```json
    {
      "text": "Lien de mon Reel Instagram...",
      "author": "Instagram"
    }
    ```
