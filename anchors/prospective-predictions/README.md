# Prospective Prediction Anchors

This directory contains cryptographically anchored records of prospective predictions
made by the CausalLayer/FaultKey engine — predictions committed to Git **before** the
court outcome was known.

## What qualifies as a "prospective prediction"

A prediction is prospective if and only if:

1. The engine output was committed to a public Git repository before the court/regulatory outcome
2. The `statusAtPrediction` field does NOT reference the outcome (i.e., the outcome was unknown)
3. The lead time between commit date and outcome date is verifiable

Cases where the outcome was already known at commit time are classified as
**attribution validations** (engine matches known court outcomes) or
**retrospective calibrations** (court finding was in the engine input).

## Anchored predictions

| File | Case | Committed | Outcome | Lead Time | Status |
|------|------|-----------|---------|-----------|--------|
| `agri-stats-prediction-canonical.json` | DOJ v. Agri Stats | 2026-04-07 | 2026-05-07 | 30 days | **Confirmed** |
| `nyt-v-openai-2023-prediction.json` | NYT v. OpenAI | 2026-04-07 | TBD (trial Sep 2026) | — | Open |
| `garcia-v-character-2024-prediction.json` | Garcia v. Character.AI | 2026-04-07 | TBD | — | Open |
| `raine-v-openai-2025-prediction.json` | Raine v. OpenAI | 2026-04-07 | TBD | — | Open |
| `social-media-mdl-3047-prediction.json` | Social Media MDL 3047 | 2026-04-07 | TBD | — | Open |
| `adams-v-openai-2025-prediction.json` | Adams v. OpenAI/Microsoft | 2026-04-07 | TBD | — | Open |
| `ai-insurance-denial-2026-prediction.json` | AI Insurance Denial | 2026-04-07 | TBD | — | Open |

## Verification

### Step 1: Verify the source commit

```bash
git clone https://github.com/smq9sn5jck-coder/causallayer
cd causallayer
git show 33e41780:server/engine/validation/prospectiveIncidents.ts | sha256sum
# Expected: cbd26012492a0d6818579106de5d455db3f794a7b88b2f2777bfe2242428d0da
```

### Step 2: Verify the canonical document hash

```bash
sha256sum agri-stats-prediction-canonical.json
# Expected: 466ef39cd273afd14a870b8f68f658d90ac018dc8ccf03b972b2b0f344dfe9d7
```

### Step 3: Verify the OpenTimestamps proof

```bash
ots verify agri-stats-prediction-canonical.json.ots
```

Note: The OTS proof will show `PendingAttestation` until the next Bitcoin block
confirms it (typically within a few hours). After confirmation, `ots upgrade`
will replace the pending attestation with a full Bitcoin block header proof.

## Honest limitations

1. **The OTS proof timestamps this document (May 2026), not the original prediction (Apr 2026).**
   The chain of evidence is: Git commit (Apr 7) → This canonical document (May 31) → OTS proof.
   The Git→Document link relies on Git integrity (SHA-1 hash of the commit object).

2. **Git commits can theoretically be rewritten.** GitHub's server-side timestamps provide
   corroboration, but are not independently verifiable without GitHub's cooperation.

3. **For future predictions**, we will submit OTS proofs at the time of prediction (before outcome)
   to eliminate the retroactivity gap entirely.

## Why this matters

An adversary could claim: "You rewrote Git history after the DOJ settlement to make it look
like you predicted it." The OTS proof doesn't fully defeat that claim for this specific case
(because it was created after the outcome). What it does:

- Seals the canonical document so it cannot be altered going forward
- Establishes the methodology for future predictions (which WILL be stamped at prediction time)
- Provides a verifiable hash chain: commit SHA-1 → file blob SHA-256 → document SHA-256 → OTS

For the Agri Stats case specifically, the strongest evidence remains the public GitHub commit
history showing `33e41780` was pushed on April 7, 2026 — 30 days before the DOJ settlement.
