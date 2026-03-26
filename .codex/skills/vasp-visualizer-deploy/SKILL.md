---
name: vasp-visualizer-deploy
description: Use this skill when deploying the latest VASP Visualizer code to the Tencent production server through the known-good GitHub to server workflow. Prefer routine pull-and-deploy on the server after pushing local commits; use bootstrap only when the server directory is not yet Git-managed.
---

# VASP Visualizer Deploy

Use this skill only for the known-good Tencent production deploy path that has already been verified in production.

This skill assumes:
- local changes are committed on `/Users/a1234/VASP-Visualizer`
- GitHub is the source of truth
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

Successful push should update `origin/main` before any server work begins.

## Routine deploy

This is the default deployment path once the server directory is already Git-managed:

```bash
cd /home/deploy/VASP-Visualizer
bash scripts/pull-and-deploy.sh origin main
```

This path:
- fetches the latest `origin/main`
- fast-forwards the working tree
- runs `deploy_to_tencent.sh`

## First server bootstrap or re-seed

Use this only when `/home/deploy/VASP-Visualizer` is not yet a Git checkout or must be re-seeded from GitHub:

```bash
cd /home/deploy/VASP-Visualizer
bash scripts/bootstrap-server-from-remote.sh https://github.com/cristinatengg-dev/VASP-Visualizer.git /home/deploy/VASP-Visualizer main
```

This path:
- backs up the current deploy directory
- clones the latest repository
- restores preserved server-local files
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
git rev-parse --is-inside-work-tree
docker compose ps
curl -i http://localhost/api/runtime-demo/health
curl -i "http://localhost/api/runtime-demo/skills?domain=modeling"
```

Successful deploy indicators:
- `git rev-parse --is-inside-work-tree` returns `true`
- `frontend`, `backend`, and `mongo` are `Up`
- `runtime-demo/health` returns `200`
- `runtime-demo/health` includes `runtimeDemo: true`
- `runtime-demo/skills?domain=modeling` returns JSON instead of `404`

## Reporting

When using this skill, always report:
- whether the GitHub sync succeeded
- whether routine deploy or bootstrap was used
- whether preserved server-local files remained in place
- whether `deploy_to_tencent.sh` completed
- whether runtime health and skills checks passed
