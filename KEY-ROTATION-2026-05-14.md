# Key Rotation Notice — 2026-05-14

> **Operational rotation during the pre-genesis period of the CausalLayer
> public anchor log.** This document is the contemporaneous, dated, public
> record of the rotation. It is committed before the first authoritative
> anchor is signed under the new key, in keeping with the security policy
> stated in [`SECURITY.md`](./SECURITY.md) and the genesis posture stated
> in [`GENESIS.md`](./GENESIS.md).

---

## 1. Facts

- **Date of rotation:** 2026-05-14.
- **Prior key fingerprint (now superseded):**
  `1a2f842089766a686bec10a061b3fc3d4bd07fcdadbfdf8a3aef7761bac8a954`
- **New key fingerprint (current canonical):**
  `5b7fc9b398b162e4900f43bddf55cda93c8c7d0b1749cc86e0cbb5754582d6e6`
- **Algorithm:** Ed25519 (RFC 8032), unchanged.
- **Format:** PKCS#8 PEM for the private key, SubjectPublicKeyInfo PEM for the
  public key, RFC 8037 JWK for the JSON Web Key form. Unchanged.
- **Number of anchors signed under the prior key:** **zero.**
  The `anchors/` directory contained only a `.gitkeep` placeholder at the
  moment of rotation, and continued to do so until the first authoritative
  anchor was committed under the new key. The full Git history of this
  repository is verifiable by any third party.

## 2. Reason for the rotation

The prior key was generated and held inside a development sandbox during
the pre-genesis operational onboarding of the engine's publication
pipeline. The sandbox environment was re-initialised before the first
authoritative anchor was produced; the prior private key did not survive
that reinitialisation, and the public key it referenced therefore had no
corresponding signing capability going forward.

Two response paths were available:

1. Continue to publish the prior public key alongside a non-functional
   private key, deferring the first authoritative anchor indefinitely.
2. Generate a fresh keypair under the same custody rules, publish the new
   public key with a contemporaneous rotation notice (this document), and
   sign the first authoritative anchor under the new key.

The second path was chosen because (a) no signed records existed under
the prior key, so no third party had relied on it; (b) the genesis
declaration explicitly anticipates the possibility of key rotation prior
to the first signed anchor; (c) the cost of indefinite deferral materially
exceeded the cost of a single, dated, transparently-documented rotation.

## 3. Effect on verifiers

A verifier consulting this repository for the canonical CausalLayer public
key should, from 2026-05-14 onward:

1. Read the fingerprint from [`fingerprint.txt`](./fingerprint.txt).
2. Read the public key from [`public-key.pem`](./public-key.pem) or its
   JWK form in [`public-key.jwk.json`](./public-key.jwk.json).
3. Confirm that the SHA-256 fingerprint of the SubjectPublicKeyInfo DER
   encoding of the published key matches the published fingerprint.
4. Reject any anchor whose `signature.publicKeyFingerprint` field does not
   match the current canonical fingerprint above.

The prior public key remains discoverable in the Git history of this
repository for the purposes of historical reproducibility, but is **not
trusted** for the verification of any anchor and was not used to sign any
anchor that any third party has ever been asked to trust.

## 4. Anti-rewrite commitment

This repository's branch protection rules prohibit force-pushes to `main`.
The rotation is, accordingly, an additive event in the commit history. The
existence of the prior key in the history is not a vulnerability; it is a
feature of the audit trail. Any future rotation will follow the same
pattern — additive, dated, contemporaneous, and explained — and never
silent.

## 5. Forward commitment

The current canonical key (`5b7fc9b398b162e4900f43bddf55cda93c8c7d0b1749cc86e0cbb5754582d6e6`)
is the production signing key going forward. Once the first authoritative
anchor is committed under this key:

- The genesis period closes.
- Any subsequent rotation will require a `KEY-ROTATION-{date}.md` document
  identical in structure to this one, accompanied by a `STATUS.md` notice
  and an explicit operational explanation.
- Verifiers will be entitled to treat a rotation after the first
  authoritative anchor as a continuity break that requires explicit
  acknowledgement (e.g., a counter-signature by the prior key, or an
  out-of-band signal from a CausalLayer team member) before signatures
  across the break are trusted.

## 6. Disclosure

This document is intentionally public and intentionally dated. The
disclosure principle stated in [`SECURITY.md`](./SECURITY.md) — that the
anchor log never silently rewrites its own history — applies equally to
the key custody record that backs every signed anchor.

---

*— CausalLayer*
