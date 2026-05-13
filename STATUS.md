# Public Moat Status

> Honest, single-page status of the CausalLayer cryptographic accountability infrastructure.
> Updated when material state changes. The commit history of this file is itself part of the
> public audit trail.

---

## Infrastructure components

| Component | Status | Public artifact |
|---|---|---|
| Public signing key | **Published** (production key, pre-genesis rotation completed 2026-05-14) | [`public-key.pem`](./public-key.pem), [`public-key.jwk.json`](./public-key.jwk.json) |
| Public key fingerprint | **Published** (`5b7fc9b3…82d6e6`) | [`fingerprint.txt`](./fingerprint.txt), [`KEY-ROTATION-2026-05-14.md`](./KEY-ROTATION-2026-05-14.md) |
| Standalone verifier (zero-deps) | **Published** | [`scripts/verify-anchor.js`](./scripts/verify-anchor.js) |
| In-browser verifier (GitHub Pages) | **Published** | <https://smq9sn5jck-coder.github.io/causallayer-anchor-log/> ([`docs/index.html`](./docs/index.html)) |
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

## Operational handover (2026-05-14)

During the genesis period the production private key is being moved out of the
build sandbox and into permanent custody (offline backup plus a managed secret
store). Until that handover is complete and the first authoritative anchor has
been signed, no anchors exist and the published public key has signed nothing.
This is the same pre-genesis state already documented above, restated here for
completeness so that any future reader of this file's commit history sees that
the operational gap was disclosed in real time rather than discovered later.

If a further pre-genesis key rotation becomes necessary as part of completing
this handover, it will be documented in the same way as the 2026-05-14 rotation
and will be the last rotation prior to the first authoritative anchor.

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
