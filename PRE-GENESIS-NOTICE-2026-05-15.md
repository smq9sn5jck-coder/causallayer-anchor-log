# Pre-Genesis Notice — 2026-05-15

> A publicly committed timeline marker recording the v0.3.0 engine release while
> the genesis anchor remains pending operational readiness.
> This file is **not** a signed anchor. It carries no cryptographic guarantees.
> Its sole purpose is to bind the date of today's engine release into the
> publicly auditable commit history of this repository, ahead of the genesis
> anchor that will eventually cover it.

---

## What was released today

**CausalLayer engine v0.3.0** — parallel module ensemble release.

- Engine repository: <https://github.com/smq9sn5jck-coder/causallayer>
- Tag: [`v0.3.0`](https://github.com/smq9sn5jck-coder/causallayer/releases/tag/v0.3.0)
- Merge commit on `main`: `729f0a8`
- Public results table (CALB-1 v0.2 frozen benchmark):
  <https://github.com/smq9sn5jck-coder/causallayer#v03-results-against-calb-1-v02>

Headline numbers (50/50 scenarios, deterministic, byte-identical reproduction):

| Metric | v0.2 | v0.3 |
|---|---|---|
| Mean absolute per-party error | 18.1 pp | **14.5 pp** |
| Primary-party top-1 match rate | 42.0% | **70.0%** |

Full per-category breakdown, honest caveats, and reproduction command in the
engine repository's `docs/v0.3_changelog.md`.

---

## Why this is not yet a signed anchor

The [`GENESIS.md`](./GENESIS.md) declaration in this repository commits the
project to publishing the first authoritative signed anchor only after **all
five** operational-readiness criteria are met:

| # | Criterion | Status as of 2026-05-15 |
|---|---|---|
| 1 | Engine deployment online (production env serving real incident analyses) | **Pending** |
| 2 | Signed daily accuracy ledger writing entries ≥ 7 consecutive operational days | **Pending** |
| 3 | OpenTimestamps witness submission successful for genesis root | **Pending** |
| 4 | Verifier compatibility confirmed (`scripts/verify-anchor.js` reproduces root + verifies sig) | **Met** |
| 5 | Independent mirror redundancy (≥ 1 mirror outside GitHub) | **Pending** |

Four of five criteria remain unmet. Per the public commitment in `GENESIS.md`,
no signed anchor will be committed to `anchors/` until all five are satisfied.
Backdating or shortcutting that commitment would void the trust architecture
this repository exists to provide.

---

## What this notice does and does not prove

**This notice DOES prove**, by virtue of its commit timestamp in the GitHub
commit history of this repository:

1. The CausalLayer v0.3.0 engine release existed on or before this commit date.
2. The engine results published in the v0.3.0 README table existed on or before
   this commit date.
3. The maintainers of this repository chose to bind the v0.3.0 release date into
   the pre-genesis timeline rather than wait silently for genesis.

**This notice does NOT prove**, and does not claim to prove:

1. The cryptographic integrity of the v0.3 results (no Merkle root is signed).
2. The accuracy of the v0.3 engine on any incident outside the public CALB-1 v0.2
   benchmark (only the benchmark is reproducible from the published code).
3. That the v0.3 results have been independently audited by any third party.

These three properties become provable for any specific date only when the
genesis anchor lands and subsequent daily anchors begin to extend the chain.

---

## Why this notice exists at all

Without this notice, an outside observer evaluating the project on a future
date would see:

- A `GENESIS.md` committed on 2026-05-13.
- A first signed anchor committed at some later date `D`.
- No record in the anchor-log repository of what the engine was doing between
  those two dates.

That gap would not undermine the post-genesis cryptographic guarantees, but it
would leave the pre-genesis development period silent — and the project's
posture is that pre-genesis silence is itself a form of opacity.

By committing this notice on the date the v0.3.0 engine ships, the pre-genesis
period becomes a publicly auditable chronology rather than a black box. That
chronology cannot be retroactively extended (because it lives in the GitHub
commit history of this repository) and cannot be retroactively forged into a
signed anchor (because no `anchors/*.json` file exists for any pre-genesis
date).

---

## How to verify the engine release independently

Until the genesis anchor lands, the v0.3 engine results are reproducible —
not cryptographically signed, but bit-for-bit reproducible — from the public
engine repository:

```bash
git clone https://github.com/smq9sn5jck-coder/causallayer.git
cd causallayer
git checkout v0.3.0
pnpm install
npx tsx scripts/calb1_harness_v03.ts
cat reports/calb1_summary_v03.md
```

Same input → byte-identical output. No LLM. No RNG. No network calls. The
benchmark fixture (`server/engine/__fixtures__/calb1/calb1_full.json`) is
checked into the repository at the same tag, so the run is fully self-contained.

Once the genesis anchor lands, the results above will additionally be covered
by an Ed25519-signed Merkle commitment with an OpenTimestamps Bitcoin proof.
Until then, the reproduction command above is the strongest verification
available.

---

*This notice is a plain Markdown commit. It carries no signature. Its
authenticity rests solely on the GitHub commit history of this repository.*
