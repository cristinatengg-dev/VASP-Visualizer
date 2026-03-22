---
name: vasp-visualizer-deploy
description: Use this skill when deploying the latest VASP Visualizer code to the Tencent production server after local changes have already been committed and pushed to GitHub. This skill contains only the clean, successful deployment workflow: pull the latest main branch on the server, preserve server-local config, run the production deploy script, and verify runtime health.
---

# VASP Visualizer Deploy

Use this skill only for the known-good Tencent production deploy path.

This skill assumes:
- local code has already been pushed to GitHub
- the production server is reachable
- server-local files must survive deploys

Do not use this skill for SSL repair experiments, network troubleshooting, or ad hoc rollback work.

## Repository and branch

Deploy from:

```bash
https://github.com/cristinatengg-dev/VASP-Visualizer.git
```

Deploy branch:

```bash
main
```

Before touching the server, make sure local code is already pushed:

```bash
cd /Users/a1234/VASP-Visualizer
git push origin main
```

## First server bootstrap

Use this only when the server is not yet managed from the GitHub repo or needs to be re-seeded from a fresh clone:

```bash
cd /home/deploy/VASP-Visualizer
bash scripts/bootstrap-server-from-remote.sh https://github.com/cristinatengg-dev/VASP-Visualizer.git /home/deploy/VASP-Visualizer main
```

This path:
- backs up the current deploy directory
- clones the latest repository
- restores preserved server-local files
- runs `deploy_to_tencent.sh`

## Routine deploy

For normal updates on a server that is already Git-managed:

```bash
cd /home/deploy/VASP-Visualizer
bash scripts/pull-and-deploy.sh origin main
```

This path:
- fetches the latest `origin/main`
- fast-forwards the working tree
- runs `deploy_to_tencent.sh`

## Preserved server-local files

The deploy flow must preserve:
- `server/.env`
- `server/.env.local` when present
- `server/db.json` when present
- `ssl/`

Do not replace these with repository defaults.

## Verification

After deploy, verify:

```bash
docker compose ps
curl -i http://localhost/api/runtime-demo/health
curl -i "http://localhost/api/runtime-demo/skills?domain=modeling"
```

Successful deploy indicators:
- `frontend`, `backend`, and `mongo` are `Up`
- `runtime-demo/health` returns `200`
- `runtime-demo/skills?domain=modeling` returns JSON instead of `404`

## Reporting

When using this skill, always report:
- whether the GitHub sync succeeded
- whether preserved server files remained in place
- whether `deploy_to_tencent.sh` completed
- whether runtime health checks passed
