# Pre-Genesis Test Anchors

> **NON-AUTHORITATIVE.** Files in this directory carry **no legal weight** and
> are **not** signed under the genesis posture committed to in
> [`../../GENESIS.md`](../../GENESIS.md).

## Purpose

This directory contains end-to-end producer→verifier→OpenTimestamps test
artifacts generated during the pre-genesis operational period of the
CausalLayer anchor pipeline. Their sole purpose is to demonstrate, on the
public record, that:

1. The signing pipeline is functional (real Ed25519 signatures, real Merkle
   roots over real ledger entries).
2. The Bitcoin OpenTimestamps integration is functional (real receipts
   submitted to public calendars, upgradeable to Bitcoin block-header
   attestations once confirmed).
3. The world-facing verifier
   ([`../../scripts/verify-anchor.js`](../../scripts/verify-anchor.js))
   reproduces the Merkle root and verifies the Ed25519 signature
   byte-for-byte.

Every file in this directory has its `payload.status` set to
`"pre-genesis-test"` and its `payload.notes` field reads:

> Pre-genesis test anchor. Real signature, real hash chain, real Bitcoin OTS
> receipt — but non-authoritative for legal-evidence purposes per
> PRE-GENESIS-NOTICE-2026-05-15.md until the five operational readiness
> criteria in GENESIS.md are met.

## Why these anchors are NOT in `../../anchors/`

[`PRE-GENESIS-NOTICE-2026-05-15.md`](../../PRE-GENESIS-NOTICE-2026-05-15.md)
publicly commits the project to leaving the `anchors/` directory empty until
**all five** GENESIS criteria are satisfied. To honour that commitment without
making the engine a black box, exercised pipeline output is published here
under an unambiguously non-authoritative path.

When the genesis event occurs, the first authoritative anchor will be written
to `../../anchors/<genesis-date>.json` with `payload.status: "authoritative"`
and that file alone will carry legal weight from then on.

## Verifying these test anchors

The world-facing verifier works on these files exactly as it would on a
production anchor:

```bash
node ../../scripts/verify-anchor.js samples/pre-genesis-tests/2026-05-15.json
```

Expected output:

```
merkle root  : OK    recomputed=…
ed25519 sig  : OK    algo=ed25519
ots proof    : present at 2026-05-15.json.ots
```

If at any point this command fails on these test files, the pipeline has
regressed and the operator MUST investigate before producing further
anchors — including the eventual authoritative genesis anchor.
