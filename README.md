# causallayer-anchor-log

> **Tamper-evident, time-stamped, third-party-verifiable witness log** for the
> [CausalLayer / Faultkey](https://faultkey.ai) AI-liability accuracy ledger.

Every commit in this repository is a daily anchor record committed by the
CausalLayer engine. Each anchor publicly proves three things, *without
trusting CausalLayer*:

1. **Which set of accuracy-ledger entries existed on a given date** — via a
   Merkle root over that day's signed ledger rows.
2. **That CausalLayer authored the anchor** — via an Ed25519 signature
   verifiable against the public key published at
   [`.well-known/causallayer-cert/`](https://faultkey.ai/.well-known/causallayer-cert/public-key.pem).
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

Open the standalone verifier:
**<https://faultkey.ai/.well-known/causallayer-cert/verify-anchor.html>**

Paste any anchor JSON (downloaded from this repo) into the text box. The
page runs entirely in your browser; it independently:

- Recomputes the Merkle root over the included leaves
- Verifies the Ed25519 signature against the public key fetched from
  `.well-known/causallayer-cert/public-key.jwk.json`
- (If present) parses the OpenTimestamps proof and shows the Bitcoin
  block height it commits to

There is no server call back to CausalLayer. View source if you don't
trust the page itself.

### Option B — Command line

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

### Option C — Verify a single accuracy claim

If CausalLayer hands you a report that says *"as of 2026-05-10, our type
classification accuracy on the public blind-test set was 93%"*, you can:

1. Find the corresponding entry in the daily accuracy ledger (signed,
   hash-chained — published at
   <https://faultkey.ai/.well-known/causallayer-cert/ledger/>).
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
public-key.pem           Mirror of the canonical key at faultkey.ai
public-key.jwk.json      Same key in JWK form for browser verifiers
fingerprint.txt          SHA-256 fingerprint of the public key (pin this)
```

---

## Key fingerprint (pin this)

> **⚠️ Bootstrap notice (May 2026):** This repository was initialised with a
> *development* Ed25519 public key while the production secret was being
> provisioned. The **first signed anchor commit** will publish the production
> public key and fingerprint, replacing the bootstrap files. Until that first
> commit appears under `anchors/`, no signature in this repository should be
> trusted as authoritative. Once the first authoritative anchor lands, pin
> the fingerprint shown in that commit; do not pin the bootstrap value.


The canonical Ed25519 public key fingerprint is published at
<https://faultkey.ai/.well-known/causallayer-cert/fingerprint.txt> and
mirrored in this repo at [`fingerprint.txt`](fingerprint.txt).

If those two values ever disagree, **do not trust either** until you've
confirmed which is correct out-of-band. The anchor-log repo's commit
history makes silent rotation of the fingerprint detectable.

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

## Reporting integrity issues

If you find a discrepancy between an anchor in this repo and what
CausalLayer claims publicly, please open an issue on this repo or email
**security@faultkey.ai**. We will treat it as a P0.

---

## Related

- Public certificate verifier: <https://faultkey.ai/.well-known/causallayer-cert/verify.html>
- Public anchor verifier: <https://faultkey.ai/.well-known/causallayer-cert/verify-anchor.html>
- Public accuracy track record: <https://faultkey.ai/track-record>
- Engine details and methodology: <https://faultkey.ai/whitepaper>
