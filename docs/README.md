# In-browser anchor verifier

This directory is the source of the GitHub Pages site at
**<https://smq9sn5jck-coder.github.io/causallayer-anchor-log/>**.

The single file [`index.html`](./index.html) is a standalone, dependency-free
verifier that runs entirely in the visitor's browser using the W3C Web
Cryptography API (Ed25519 / SHA-256). It loads the canonical public key
and fingerprint from the parent repository at load time and makes no
network calls thereafter.

[`example-anchor.json`](./example-anchor.json) is a **dev-test** anchor
signed by an ephemeral keypair, included so the verifier UI is exercisable
before the first authoritative anchor lands. It is clearly labelled
non-evidentiary and the verifier surfaces that explicitly.

## Offline use

Save `index.html`, `../public-key.pem`, and `../fingerprint.txt` to disk
and open the saved page; verification works offline.

## Threat model

See the parent repository's [`SECURITY.md`](../SECURITY.md) and the
[`CAUSAL-ATTRIBUTION-SPEC-v0.1.md`](https://github.com/smq9sn5jck-coder/causallayer-verifier/blob/main/CAUSAL-ATTRIBUTION-SPEC-v0.1.md)
in the verifier-package repository.
