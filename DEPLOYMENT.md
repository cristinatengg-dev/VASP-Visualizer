# Deployment

## Quick Deploy

```bash
bash deploy.sh
```

This runs all 4 steps automatically:
1. `git push origin main` — push code to GitHub
2. SSH to server → `git pull origin main` — pull latest code
3. `docker build` — rebuild backend + frontend images
4. `docker compose up` — restart containers + health check

## Deploy without push

If code is already pushed (e.g. pushed from another machine):

```bash
bash deploy.sh --no-push
```

## Server details

| Item | Value |
|---|---|
| Host | `118.25.15.120` |
| SSH port | `22` |
| User | `deploy` |
| SSH key | `~/.ssh/id_ed25519` |
| Project dir | `/home/deploy/VASP-Visualizer` |
| Health check | `https://localhost/api/health` → 200 |

## Manual server access

```bash
ssh -i ~/.ssh/id_ed25519 deploy@118.25.15.120
cd /home/deploy/VASP-Visualizer
docker compose logs --tail=50
```
