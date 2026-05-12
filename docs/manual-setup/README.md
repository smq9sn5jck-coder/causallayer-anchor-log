# Manual setup: GitHub Actions verify workflow

This folder contains one GitHub Actions workflow file staged as `.txt`
because the integration that authored this PR does not hold the
`workflows` repo permission. Once a maintainer with write access to
`.github/workflows/` adds it, the public-trust infrastructure health
check will run on every push, every pull request, and on a daily cron
at 07:00 UTC.

## One-time setup

```bash
mkdir -p .github/workflows
cp docs/manual-setup/verify.yml.txt .github/workflows/verify.yml
git add .github/workflows/verify.yml
git commit -m "ci: add public-trust infrastructure health check workflow"
git push
```

After this lands, the `STATUS.md` claim that
`.github/workflows/verify.yml` is "Published" becomes accurate for the
first time.

## What it asserts

See `scripts/health-check.js` for the full list of invariants, in
brief:

- **S1–S6**: structural integrity (key validity, JWK/PEM consistency,
  fingerprint binding, zero-deps verifier, offline verifier, genesis
  declaration present)
- **A1–A4**: per-anchor verification (when anchors exist) — JSON shape,
  fingerprint binding, Merkle root, Ed25519 signature
- **F1**: freshness — auto-activates the moment the first
  `anchors/YYYY-MM-DD.json` lands; fails if the most recent anchor is
  more than 26 hours old (24h cadence + 2h grace)

The health check stays silent on freshness while the repo is
pre-genesis, because failing daily about a state that `STATUS.md`
publicly documents as "Pending genesis" would be noise, not signal.

## Why workflows are staged as `.txt`

GitHub Apps require a separate, opt-in `workflows` permission to add
or modify files under `.github/workflows/`. Staging the workflow file
as `.txt` lets the health-check script and its supporting docs ship
now, with the workflow file copied into place by a human or re-pushed
after the permission is granted.
