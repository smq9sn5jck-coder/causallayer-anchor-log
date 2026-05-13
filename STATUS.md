# Public Moat Status

> Honest, single-page status of the CausalLayer cryptographic accountability infrastructure.
> Updated when material state changes. The commit history of this file is itself part of the
> public audit trail.

---

## Infrastructure components

| Component | Status | Public artifact |
|---|---|---|
| Public signing key | **Published** (production key, rotated from bootstrap on 2026-05-13) | [`public-key.pem`](./public-key.pem), [`public-key.jwk.json`](./public-key.jwk.json) |
| Public key fingerprint | **Published** (`1a2f8420…ac8a954`) | [`fingerprint.txt`](./fingerprint.txt) |
| Standalone verifier (zero-deps) | **Published** | [`scripts/verify-anchor.js`](./scripts/verify-anchor.js) |
| Independent verifier package | **Published** | [`causallayer-verifier`](https://github.com/smq9sn5jck-coder/causallayer-verifier) |
| Genesis declaration | **Published** | [`GENESIS.md`](./GENESIS.md) |
| First authoritative anchor | **Pending operational readiness** | will appear at `anchors/YYYY-MM-DD.json` |
| Continuous daily anchors | **Pending genesis** | one per operational day, forever after |
| OpenTimestamps witness | **Pending genesis** | `.ots` proof alongside each anchor |
| Independent repository mirror | **Pending** | external mirror to remove GitHub-as-single-point-of-failure |
| Automated verification CI | **Published** | [`.github/workflows/verify.yml`](./.github/workflows/verify.yml) |

---

## What is verifiable today

Even without a signed anchor, the following claims are already independently verifiable:

1. **A public Ed25519 key was published before any signed record existed.**
   Verifiable from the GitHub commit history of this repository. The key was
   rotated once on 2026-05-13, prior to any signed record being committed,
   per the pre-genesis rotation notice in [`README.md`](./README.md). This
   rotation event is itself a permanent commit in the repository.
2. **A standalone, zero-dependency verifier was published before any record needed verifying.**
   Verifiable by reading [`scripts/verify-anchor.js`](./scripts/verify-anchor.js) — it has no
   imports beyond Node standard library and makes no network calls back to CausalLayer.
3. **The genesis declaration was committed before any anchor was committed.**
   Verifiable from the chronological order of commits in this repository.

These three claims, alone, defeat the most common adversarial argument against any
vendor-published accuracy ledger: that the entire history was retroactively manufactured.

---

## What is NOT verifiable today

This document does not let you verify any of the following, because the corresponding artifacts
do not yet exist:

- The accuracy of any specific CausalLayer liability attribution on any specific date.
- The integrity of the daily accuracy ledger inside the engine's production database.
- The Merkle root of any specific ledger snapshot.

These become verifiable from the genesis anchor onward.

---

## What changes when the genesis anchor lands

The moment the first signed anchor JSON appears in [`anchors/`](./anchors/), three things become
true at once:

1. The accuracy record for that date is **independently verifiable** by anyone, using only this
   repository and the Bitcoin blockchain.
2. The engine's accuracy claims become **legally defensible** as electronic evidence under
   FRE 902(13)/(14) in the United States, eIDAS in the European Union, and the parallel
   frameworks in the UK, Australia, and other UNCITRAL-compatible jurisdictions.
3. The cost for any future adversary to manufacture a counter-history becomes **at least the
   cost of rewriting the Bitcoin blockchain from the relevant block forward** — which is, by the
   security assumption of Bitcoin, computationally infeasible.

---

## Why this status page exists

Most companies hide the gaps between what they have built and what they claim. We publish the
gaps because the gaps themselves are part of the trust architecture. A vendor who hides what is
not yet operational is a vendor whose operational claims you cannot trust.

If you are evaluating CausalLayer for a regulated, audited, or adversarial use case, this page
is the single most important document in either repository to read first.

---

## Reporting issues

Found something here that is inaccurate, misleading, or out of date?
Open a public issue at <https://github.com/smq9sn5jck-coder/causallayer-anchor-log/issues>.
Issues are answered in public.

---

*Last material change tracked via GitHub commit history of this file.*
