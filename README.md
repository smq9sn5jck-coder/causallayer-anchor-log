# causallayer-anchor-log

> **Tamper-evident, time-stamped, third-party-verifiable witness log** for the
> CausalLayer AI-liability engine's daily accuracy ledger.

Every commit in this repository is a daily anchor record committed by the
CausalLayer engine. Each anchor publicly proves three things, *without
trusting CausalLayer*:

1. **Which set of accuracy-ledger entries existed on a given date** — via a
   Merkle root over that day's signed ledger rows.
2. **That CausalLayer authored the anchor** — via an Ed25519 signature
   verifiable against the public key published in this repository at
   [`public-key.pem`](./public-key.pem).
3. **That the anchor existed at the claimed time** — via an
   [OpenTimestamps](https://opentimestamps.org/) proof anchored in the
   Bitcoin blockchain (typically confirmed within ~3 hours of submission).

Combined with the daily accuracy ledger (hash-chained, signed) and the
GitHub commit history of *this* repo (which we cannot rewrite without
detection), the result is a public audit trail that no single party — including
CausalLayer — can retroactively forge or alter.

---

## Why this exists

Every AI vendor on earth claims accuracy. None of them let you check the
claim cryptographically, after the fact, without their cooperation.

CausalLayer's product is **causal liability analysis for AI incidents**:
which agent caused which loss, and how much each party owes. That product is
worthless unless the accuracy track record behind it is independently
verifiable. So we made it independently verifiable.

If a CausalLayer report ever ends up in court — for an insurer's subrogation
claim, a regulator's enforcement action, or a vendor-vs-vendor liability
dispute — opposing counsel can use this repository, the public verifier, and
the published key fingerprint to confirm or rebut the accuracy figures we
cited at the time the report was issued.

---

## How to verify an anchor (no trust in CausalLayer required)

### Option A — In-browser, zero install

Open <https://smq9sn5jck-coder.github.io/causallayer-anchor-log/> in any
modern browser. Paste an anchor's JSON (or drag the `.json` file in)
and click **Verify**. The page runs the W3C Web Cryptography API
locally, makes no network calls back to CausalLayer, and shows you the
canonical body it actually hashed, the recomputed Merkle root, the
signature verification result, and whether the fingerprint matches the
current canonical key. The page also exposes a labelled `dev-test`
example so you can exercise the UI before the first authoritative
anchor lands.

### Option B — Standalone npm package (recommended for automation)

```bash
# One-shot via npx (no install)
npx causallayer-verifier anchors/2026-05-10.json --key ./public-key.pem

# Or install globally
npm install -g causallayer-verifier
causallayer-verify anchors/2026-05-10.json
```

The [`causallayer-verifier`](https://github.com/smq9sn5jck-coder/causallayer-verifier)
package is independent of CausalLayer, has **zero runtime dependencies**
(only Node's built-in `crypto`), and ships with 40 tests including 36
adversarial vectors covering Merkle tampering, signature forgery, and
ledger-chain breakage.

### Option C — Command line, no install

```bash
# 1. Pick a date and download its anchor record
git clone https://github.com/smq9sn5jck-coder/causallayer-anchor-log
cd causallayer-anchor-log
cat anchors/2026-05-10.json

# 2. Independently verify the OpenTimestamps proof
pip install opentimestamps-client
ots verify anchors/2026-05-10.json.ots

# 3. Independently verify the Ed25519 signature
#    (public key + verification script under /scripts in this repo)
node scripts/verify-anchor.js anchors/2026-05-10.json
```

`scripts/verify-anchor.js` has zero CausalLayer dependencies — it's just
Node's built-in `crypto` module. Read it, audit it, run it.

### Option D — Verify a single accuracy claim

If CausalLayer hands you a report that says *"as of 2026-05-10, our type
classification accuracy on the public blind-test set was 93%"*, you can:

1. Find the corresponding entry in the daily accuracy ledger — each ledger
   row hash will be embedded as a Merkle leaf in that day's anchor JSON.
2. Compute its hash and confirm it appears as a leaf in the Merkle tree
   committed in this repo on 2026-05-10.
3. Confirm the Bitcoin OTS proof for that anchor — establishing the claim
   was made *no later than* the time of OTS submission.

That's the entire chain: ledger row → Merkle leaf → repo commit → Bitcoin
block. Break any link and the claim is provably false.

---

## Repository layout

```
anchors/
  2026-05-10.json        Anchor record (Merkle root + signature + metadata)
  2026-05-10.json.ots    OpenTimestamps proof for that anchor (~3h to confirm)
  2026-05-11.json
  2026-05-11.json.ots
  ...
scripts/
  verify-anchor.js       Standalone Node.js verifier (no deps beyond stdlib)
public-key.pem           Canonical Ed25519 public key (PEM)
public-key.jwk.json      Same key in JWK form for browser verifiers
fingerprint.txt          SHA-256 fingerprint of the public key (pin this)
```

---

## Key fingerprint (pin this)

> **⚠️ Pre-genesis key rotation notice (May 13–14, 2026):** This repository
> was initialised in May 2026 with a *bootstrap* Ed25519 public key while the
> production signing key was being provisioned. On **May 13, 2026** the
> bootstrap key was rotated to a candidate production key (commit history
> remains visible). On **May 14, 2026** that candidate was rotated to the
> current production key as part of operational onboarding of the engine's
> publication pipeline, *before any signed anchor had ever been published*.
> The `anchors/` directory was — and at the moment of each rotation,
> remained — empty, so no signed record was orphaned by any rotation. The
> first signed anchor under the current key will be the genesis record.
> Both rotation commits, and the contemporaneous post-mortem
> [`KEY-ROTATION-2026-05-14.md`](./KEY-ROTATION-2026-05-14.md), are
> permanently visible in this repository's history.
>
> **Pin the fingerprint that is current at the time of the first anchor** —
> currently `5b7fc9b398b162e4900f43bddf55cda93c8c7d0b1749cc86e0cbb5754582d6e6`.
> Do **not** pin any fingerprint from commits dated before 2026-05-14.

The canonical Ed25519 public key fingerprint is published in this repo at
[`fingerprint.txt`](fingerprint.txt). GitHub's commit history makes silent
rotation of the fingerprint detectable — if the fingerprint changes again
after the first authoritative anchor lands, that change must be accompanied
by a `GENESIS-amendment-` commit explaining the reason and a corresponding
notice in [`STATUS.md`](./STATUS.md). Any rotation after the first signed
anchor would be a continuity break and must be treated by verifiers as
requiring explicit acknowledgement before signatures are trusted across the
break.

If in doubt about authenticity, cross-check the fingerprint against
out-of-band sources (e.g., a CausalLayer team member's signed message).

---

## What this repo is *not*

- **Not** a substitute for the CausalLayer engine. The engine is the
  product; this repo is just the publicly verifiable accuracy receipt.
- **Not** a private dataset. Every leaf of every Merkle tree corresponds
  to a publicly-published ledger row. No customer-confidential incident
  data lives here, ever. Customer outcome submissions are aggregated
  before they reach the ledger.
- **Not** force-pushable. This repo's branch protection rules prevent
  history rewrites. Any attempt to alter a past anchor would require
  rewriting the OTS proof (impossible without breaking SHA-256) and
  rewriting Bitcoin (impossible).

---

## What is CausalLayer?

**CausalLayer** is a deterministic causal-attribution engine for AI-liability
incidents. Given a description of an AI failure, it produces a structured
allocation of fault across the parties involved, a calibrated damages range,
and a full auditable causal chain. The engine itself is private and operates
as a hosted service. **This repository is the public-facing accountability
layer**: a cryptographic record of accuracy claims the engine makes about
itself, designed to be auditable by adversaries, regulators, and skeptics
without any cooperation from CausalLayer.

## Reporting integrity issues

If you find a discrepancy between an anchor in this repo and what
CausalLayer claims publicly, please open a P0 issue:
<https://github.com/smq9sn5jck-coder/causallayer-anchor-log/issues>.

---

## Related

- Independent verifier package (npm + GitHub):
  <https://github.com/smq9sn5jck-coder/causallayer-verifier>
- Genesis declaration: [`GENESIS.md`](./GENESIS.md)
- Current operational status (what's verifiable today vs. pending):
  [`STATUS.md`](./STATUS.md)

---

## Free AI Liability Risk Assessment

> **Deploying AI in a regulated industry?** Take the free [FaultKey AI Liability Risk Assessment](https://form.jotform.com/261486061447056) — 2 minutes, no sales call. Covers EU AI Act Article 73, APRA CPS 230, and NIST AI RMF.
