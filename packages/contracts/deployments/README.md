# deployments/

One flat JSON per deployment, written by the scripts in `../script/` (see `docs/runbook/deploy-fuji.md`).

- `fuji.json`: the real Fuji deployment. Committed; server/web/seed read addresses from it.
- `fork.json` and any other name: local or CI dry runs on an Anvil fork. Gitignored.

The scripts pick the file with `DEPLOYMENT=<name>`; there is no default, so a fork run cannot overwrite `fuji.json`.
