# Genesis Declaration

> A formal, public commitment recording the pre-anchor state of the CausalLayer accuracy log.
> Once the first authoritative anchor is committed to this repository, the genesis period closes
> and every subsequent anchor extends an immutable, third-party-verifiable history.

---

## Pre-genesis state

At the time this declaration is committed, the CausalLayer anchor log contains:

- The published Ed25519 **public** signing key (`public-key.pem`, `public-key.jwk.json`)
- Its SHA-256 **fingerprint** (`fingerprint.txt`)
- The standalone, zero-dependency **verifier script** (`scripts/verify-anchor.js`)
- This document

It does **not** yet contain any signed daily anchor records. The `anchors/` directory contains
only a `.gitkeep` placeholder. This is intentional and visible by design.

---

## Why the genesis period is publicly declared

A common adversarial argument against any vendor-published accuracy ledger is the **retroactive
manufacturing claim**: that the vendor created the history all at once on the day they were
challenged, then back-dated entries to look like a continuous record.

The standard cryptographic answer to that argument is the OpenTimestamps proof — each daily
anchor includes a Bitcoin-blockchain-backed timestamp that cannot be retroactively forged because
the corresponding Bitcoin block was mined before the anchor existed.

But the OpenTimestamps proof only protects entries *after* the first one is published. The
**first** entry — the genesis anchor — is the moment the chain of trust begins. If the genesis
is silent, an adversary can claim it was created at any time.

This declaration removes that ambiguity. By committing this document **before** the first anchor
exists, and by doing so in a public GitHub repository whose commit history is independently
auditable, we create a verifiable lower bound on the date at which the chain *could* have begun.

In plain terms: the absence of anchors in this repository, on the date this file is committed,
is itself a cryptographic commitment that no retroactive history is being manufactured.

---

## The chain of evidence, before and after genesis

| Phase | What exists | What it proves |
|---|---|---|
| **Pre-genesis** (now) | Public key, fingerprint, verifier, this declaration | The signing key was published before any signed record existed. The verifier was published before any record needed verifying. No accuracy history has been claimed yet. |
| **Genesis** | First signed daily anchor, with OpenTimestamps proof | The first authoritative measurement of the engine's accuracy was committed at the moment the corresponding Bitcoin block was mined. The vendor cannot retroactively claim earlier accuracy data. |
| **Post-genesis** | Each subsequent daily anchor, hash-chained back to the previous | Every daily entry references the previous day's anchor and is itself OpenTimestamps-anchored. To rewrite any single day, an attacker must rewrite every subsequent Bitcoin-witnessed proof — an operation that is, by the security assumption of Bitcoin, computationally infeasible. |

---

## Operational readiness criteria

The first authoritative anchor will be committed to this repository only after the following
operational readiness criteria are met:

1. **Engine deployment online** — the CausalLayer production environment is live and serving
   real incident analyses.
2. **Ledger active** — the signed daily accuracy ledger has been writing entries for at least
   seven consecutive operational days.
3. **OpenTimestamps witness submission successful** — the OTS client has confirmed receipt of
   the genesis root hash.
4. **Verifier compatibility confirmed** — the published verifier script in `scripts/`
   independently reproduces the Merkle root and verifies the signature against the published
   public key.
5. **Mirror redundancy** — at least one independent mirror of this repository exists, so that
   GitHub itself is not a single point of failure for the public history.

When all five criteria are met, the genesis anchor will be committed as
`anchors/YYYY-MM-DD.json` and its accompanying OpenTimestamps proof as
`anchors/YYYY-MM-DD.json.ots`. From that commit forward, every subsequent operational day will
produce a new pair of files in the same directory.

---

## What this declaration is NOT

This declaration does not claim that CausalLayer has produced accurate liability attributions
to date. Pre-genesis, the engine's accuracy record is private and unverified by this repository.

This declaration does not commit to a specific date for the genesis anchor. Operational
readiness is a precondition that must be earned, not scheduled.

This declaration does not bind CausalLayer to perpetual operation. If the engine is
discontinued, the final anchor will simply be the last entry committed, with no further entries.
The audit trail of every entry committed before that final moment remains valid forever.

---

## How third parties should read this repository

If you are an auditor, regulator, plaintiff's counsel, defense counsel, journalist, or any other
third party who needs to evaluate a CausalLayer accuracy claim:

1. Note the commit date of this `GENESIS.md` file in the GitHub commit history.
2. Note the commit date of the first `anchors/*.json` file once it appears.
3. Verify the OpenTimestamps proof of that first anchor against the Bitcoin blockchain —
   independently of CausalLayer.
4. From that point on, the engine's accuracy claims for any date covered by an anchor are
   independently verifiable using only this repository, the published verifier, and the
   Bitcoin blockchain.

No further trust in CausalLayer is required. That is the entire point of this repository.

---

*This declaration is itself signed when the genesis anchor is published. Until that moment, its
authenticity rests solely on the GitHub commit history of this repository — which is precisely
the property that the rest of the moat infrastructure is designed to render independently
verifiable.*
