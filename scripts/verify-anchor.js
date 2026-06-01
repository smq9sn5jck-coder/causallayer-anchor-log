#!/usr/bin/env node
/**
 * verify-anchor.js — standalone, zero-dependency Ed25519 + Merkle verifier
 *                    for CausalLayer / Faultkey daily anchor records.
 *
 * Usage:
 *   node scripts/verify-anchor.js anchors/2026-05-10.json
 *
 * What it checks (independently, with no network calls back to CausalLayer):
 *   1. Recomputes the Merkle root over `payload.leaves` and compares to
 *      `payload.merkleRoot`.
 *   2. Verifies the Ed25519 `signature` over the canonical-JSON-serialised
 *      payload using the public key in `public-key.pem` (sibling file).
 *   3. Prints the OTS proof file path (if present) so you can run
 *      `ots verify <file>.ots` separately.
 *
 * Exits 0 on success, non-zero on any verification failure.
 *
 * No third-party deps. Audit the source. Run anywhere Node 18+ runs.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}

/**
 * Compute a Merkle root the same way the engine does:
 *   leaf hash = sha256(utf8(leaf string))
 *   internal  = sha256(left || right); odd nodes are duplicated.
 */
function merkleRoot(leafStrings) {
  if (leafStrings.length === 0) {
    return sha256(Buffer.alloc(0)).toString("hex");
  }
  let layer = leafStrings.map((s) => sha256(Buffer.from(s, "utf8")));
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      next.push(sha256(Buffer.concat([left, right])));
    }
    layer = next;
  }
  return layer[0].toString("hex");
}

/**
 * Canonical JSON: stable key ordering at every depth. Matches the engine.
 */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalize(value[k]))
      .join(",") +
    "}"
  );
}

/**
 * Pure verification core: recompute the Merkle root and check the Ed25519
 * signature over the canonical payload. No I/O, no process.exit — returns the
 * booleans so it can be unit-tested and reused.
 */
function verifyAnchorRecord(record, pubKey) {
  const recomputed = merkleRoot(record.payload.leaves);
  const claimed = record.payload.merkleRoot;
  const merkleOk = recomputed === claimed;
  const canonical = Buffer.from(canonicalize(record.payload), "utf8");
  const sig = Buffer.from(record.signature, record.signature.length === 128 ? "hex" : "base64");
  const sigOk = crypto.verify(null, canonical, pubKey, sig);
  return { merkleOk, sigOk, recomputed, claimed };
}

function loadPublicKey(scriptDir) {
  const pemPath = path.resolve(scriptDir, "..", "public-key.pem");
  if (!fs.existsSync(pemPath)) {
    throw new Error(
      `public-key.pem not found at ${pemPath}. Fetch it from ` +
        "https://github.com/smq9sn5jck-coder/causallayer-anchor-log/blob/main/public-key.pem"
    );
  }
  return crypto.createPublicKey(fs.readFileSync(pemPath));
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/verify-anchor.js <anchors/YYYY-MM-DD.json>");
    process.exit(2);
  }
  const anchorPath = path.resolve(file);
  const scriptDir = __dirname;
  const record = JSON.parse(fs.readFileSync(anchorPath, "utf8"));

  // 1 + 2. Merkle root and Ed25519 signature
  const pubKey = loadPublicKey(scriptDir);
  const { merkleOk, sigOk, recomputed, claimed } = verifyAnchorRecord(record, pubKey);
  console.log(`merkle root  : ${merkleOk ? "OK  " : "FAIL"}  recomputed=${recomputed}`);
  if (!merkleOk) console.log(`               claimed   =${claimed}`);
  console.log(`ed25519 sig  : ${sigOk ? "OK  " : "FAIL"}  algo=${record.signatureAlgorithm}`);

  // 3. OTS proof hint
  const otsPath = anchorPath + ".ots";
  if (fs.existsSync(otsPath)) {
    console.log(`ots proof    : present at ${path.basename(otsPath)}`);
    console.log(`               run: ots verify ${otsPath}`);
  } else {
    console.log("ots proof    : not yet attached (anchor may be < ~3h old)");
  }

  // 4. Anchor metadata
  console.log(`anchor date  : ${record.payload.anchorDate}`);
  console.log(`leaf count   : ${record.payload.leafCount}`);
  console.log(`key fp       : ${record.publicKeyFingerprint}`);

  process.exit(merkleOk && sigOk ? 0 : 1);
}

module.exports = { sha256, merkleRoot, canonicalize, verifyAnchorRecord, loadPublicKey, main };

// Only run the CLI when executed directly, so the pure functions above can be
// required from tests without triggering argv parsing or process.exit.
if (require.main === module) {
  main();
}
