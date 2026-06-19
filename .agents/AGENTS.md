# Project Customizations and Agent Instructions

This file instructs AI agents on how to interact with the project repository, deploy, and manage the live server configurations.

## Credentials and Deployments

- **Portainer URL**: `https://portainer.ekonum.fr`
- **Portainer API Access Token**: `<VOTRE_CLEF_API_PORTAINER>` (Ne pas versionner !)
- **Portainer Docker Endpoint ID**: `2`
- **Portainer Stack ID**: `94`
- **Git Push/Fetch Target**: `git@github.com:Lukatrt/idees-app.git`
- **Live App URL**: `https://ideesapp.ekonum.fr`

## Automated Stack Redeployment

When changes are pushed to GitHub, redeploy the stack by sending a PUT request to the Portainer redeployment API endpoint:

```bash
curl -s -k -X PUT "https://portainer.ekonum.fr/api/stacks/94/git/redeploy?endpointId=2" \
  -H "X-API-Key: <VOTRE_CLEF_API_PORTAINER>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## API Endpoints

- **Data Sync**: `/api/data` (GET/POST) - reads and writes `{ ideas, categories }` database JSON.
- **External Adds (iOS Shortcuts)**: `/api/external-add` (POST) - accepts `{"text": "Reel URL/Note", "author": "User"}` and appends to the ideas list.
