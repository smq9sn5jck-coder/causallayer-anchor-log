# Security Policy

## Scope

This policy applies to the `causallayer-anchor-log` repository and the
content of its `anchors/` directory. The repository is the canonical
public source of truth for CausalLayer's signed daily anchor records;
its integrity is the integrity of every CausalLayer accountability
claim that depends on it.

## What "compromise" means here

The anchor log is intentionally world-readable; confidentiality is not
a security property. The security properties that matter are:

1. **Authenticity.** Every published anchor is signed by the canonical
   CausalLayer Ed25519 private key, whose public counterpart is in
   `public-key.pem` (fingerprint:
   `5b7fc9b398b162e4900f43bddf55cda93c8c7d0b1749cc86e0cbb5754582d6e6`;
   rotated from the prior pre-genesis key on 2026-05-14, see
   [`KEY-ROTATION-2026-05-14.md`](./KEY-ROTATION-2026-05-14.md)).
2. **Append-only behaviour.** Anchors are never silently rewritten or
   deleted. Any historical anchor can be re-verified offline.
3. **Independent timestamping.** Each anchor is OpenTimestamped against
   the Bitcoin blockchain, providing an independently verifiable
   "no-earlier-than" witness time.
4. **Key custody.** The signing private key is held in offline custody
   and never copied to any cloud build environment.

## Reporting a vulnerability

Please report security vulnerabilities **privately**. Do not open a
public GitHub issue.

- **Preferred channel:** [GitHub Security Advisories](https://github.com/smq9sn5jck-coder/causallayer-anchor-log/security/advisories/new)
- **Alternative channel:** open a minimal public issue requesting a
  private disclosure channel; we will provide one within two business
  days.

When reporting, please include:

1. A clear description of the vulnerability and which security
   property above it threatens (authenticity, append-only, timestamp,
   key custody).
2. A reproducible test (e.g., a forged anchor that the public
   verifier accepts, a missing OpenTimestamps proof, a key-exposure
   path).
3. Any public evidence of the issue (e.g., commit SHAs, archived
   pages) that would let us reproduce.

## What we will and will not do

We will:

- Acknowledge receipt within two business days.
- Investigate and respond with a remediation plan within five business
  days.
- Publish a post-mortem in this repository for any confirmed material
  compromise of authenticity or append-only behaviour, including a key
  rotation procedure if applicable.

We will not:

- Quietly rewrite an anchor history. If a published anchor is found to
  be wrong, we add a corrective record (see `RFC` issues in this
  repository) but do not retroactively delete or alter the original.
- Retract a confirmed vulnerability report once acknowledged. Reporters
  are credited (or pseudonymous if requested).

## Out-of-scope

- The CausalLayer engine itself is in a separate (private) repository.
  Engine vulnerabilities are reportable but cannot be triaged through
  this public repo; please use the security advisory channel above and
  we will route the report internally.
- Bugs in third-party verifiers, signing tools, or visualisations that
  consume this anchor log are out-of-scope here; please report those to
  their respective maintainers.

## Key rotation

In the event of suspected private-key compromise:

1. A new keypair will be generated under offline custody.
2. The new public key will be published in `public-key.pem` via a
   pull-request commit signed by the founder.
3. A `KEY-ROTATION-{date}.md` post-mortem record will be added to this
   repository with the rotation rationale and the date after which the
   prior public key is no longer trusted.
4. Anchors signed by the prior key remain verifiable for records dated
   before the rotation date.

The current `public-key.pem` was published on 2026-05-14 and supersedes
any earlier key in the repository history. The 2026-05-13 (PR #3)
candidate key and the 2026-05-14 production key were both rotated during
the pre-genesis period, before any authoritative anchor was signed; see
[`KEY-ROTATION-2026-05-14.md`](./KEY-ROTATION-2026-05-14.md) for the
contemporaneous post-mortem.
