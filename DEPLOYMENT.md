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
| Host | `43.154.165.254` |
| SSH port | `2222` |
| User | `deploy` |
| SSH key | `~/.ssh/vasp_deploy` |
| Project dir | `/home/deploy/VASP-Visualizer` |
| Health check | `https://localhost/api/health` → 200 |

## Manual server access

```bash
ssh -i ~/.ssh/vasp_deploy -p 2222 deploy@43.154.165.254
cd /home/deploy/VASP-Visualizer
docker compose logs --tail=50
```
