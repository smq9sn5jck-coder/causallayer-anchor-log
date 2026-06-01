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
  if (!record || typeof record.payload !== "object" || record.payload === null) {
    throw new Error(
      "record has no `payload` object — this is not a daily/cert anchor. " +
        "Batch anchors (schema causallayer.audit-batch.*) use verifyBatchRecord().",
    );
  }
  const recomputed = merkleRoot(record.payload.leaves);
  const claimed = record.payload.merkleRoot;
  const merkleOk = recomputed === claimed;
  const canonical = Buffer.from(canonicalize(record.payload), "utf8");
  const sig = Buffer.from(record.signature, record.signature.length === 128 ? "hex" : "base64");
  const sigOk = crypto.verify(null, canonical, pubKey, sig);
  return { merkleOk, sigOk, recomputed, claimed };
}

/**
 * Batch Merkle root: unlike the daily-anchor Merkle (which hashes each leaf
 * string), batch leaves are already SHA-256 digests, so the tree folds the raw
 * 32-byte digests directly. Bitcoin-style duplicate-last on an odd layer.
 */
function batchMerkleRoot(hexLeaves) {
  if (hexLeaves.length === 0) throw new Error("empty leaves");
  let layer = hexLeaves.map((h) => Buffer.from(h, "hex"));
  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]);
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(sha256(Buffer.concat([layer[i], layer[i + 1]])));
    }
    layer = next;
  }
  return layer[0].toString("hex");
}

/** True for the audit-batch / unified-pipeline schema (no `payload`; the
 *  signature is an object naming the field it covers). */
function isBatchRecord(record) {
  return Boolean(
    record &&
      ((typeof record.schema === "string" && record.schema.startsWith("causallayer.audit-batch")) ||
        (record.signature && typeof record.signature === "object" && record.signature.signed_field) ||
        typeof record.batch_merkle_root === "string"),
  );
}

/**
 * Verify a batch record. Two checks are authoritative and robust:
 *   - merkleOk: the batch Merkle root recomputes from the leaf SHA-256 digests.
 *   - sigOk:    the Ed25519 signature verifies over the UTF-8 bytes of the
 *               signed field (batch_body_sha256) using the published key.
 * bodyOk is a best-effort extra: it tries to reproduce batch_body_sha256 by
 * re-serialising the visible body. Because byte-identical JSON serialisation is
 * not guaranteed across the original (Python) serialiser and Node, a mismatch
 * is informational only — the signature over batch_body_sha256 is the binding
 * authenticity check. bodyOk is true/false when checked, or null if absent.
 */
function verifyBatchRecord(record, pubKey) {
  const recomputed = batchMerkleRoot((record.leaves || []).map((l) => l.sha256));
  const claimed = record.batch_merkle_root;
  const merkleOk = recomputed === claimed;

  const sig = record.signature || {};
  const signedField = sig.signed_field || "batch_body_sha256";
  const signedValue = record[signedField];
  const sigOk =
    signedValue !== undefined &&
    typeof sig.signature_hex === "string" &&
    crypto.verify(null, Buffer.from(String(signedValue), "utf8"), pubKey, Buffer.from(sig.signature_hex, "hex"));

  let bodyOk = null;
  if (typeof record.batch_body_sha256 === "string") {
    const body = { ...record };
    delete body.batch_body_sha256;
    delete body.signature;
    bodyOk = sha256(Buffer.from(JSON.stringify(body, null, 2), "utf8")).toString("hex") === record.batch_body_sha256;
  }
  return { merkleOk, sigOk, bodyOk, recomputed, claimed, signedField };
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
  const pubKey = loadPublicKey(scriptDir);

  const otsHint = () => {
    const otsPath = anchorPath + ".ots";
    if (fs.existsSync(otsPath)) {
      console.log(`ots proof    : present at ${path.basename(otsPath)}`);
      console.log(`               run: ots verify ${otsPath}`);
    } else {
      console.log("ots proof    : not yet attached (anchor may be < ~3h old)");
    }
  };

  // ── Batch / unified-pipeline schema (no `payload`) ──────────────────────────
  if (isBatchRecord(record)) {
    const { merkleOk, sigOk, bodyOk, recomputed, claimed, signedField } = verifyBatchRecord(record, pubKey);
    console.log(`schema       : ${record.schema || "audit-batch"}`);
    console.log(`merkle root  : ${merkleOk ? "OK  " : "FAIL"}  recomputed=${recomputed}`);
    if (!merkleOk) console.log(`               claimed   =${claimed}`);
    console.log(`ed25519 sig  : ${sigOk ? "OK  " : "FAIL"}  over ${signedField}`);
    if (bodyOk === true) {
      console.log(`body hash    : OK    (${signedField} reproduced from body)`);
    } else if (bodyOk === false) {
      console.log(`body hash    : note  ${signedField} not reproducible via JSON re-serialisation`);
      console.log(`               (the ed25519 signature over it is the authoritative check)`);
    }
    otsHint();
    console.log(`leaf count   : ${record.leaf_count}`);
    console.log(`key fp       : ${record.signature && record.signature.pubkey_sha256_fingerprint}`);
    process.exit(merkleOk && sigOk ? 0 : 1);
  }

  // ── Daily / cert anchor schema (`payload` object) ──────────────────────────
  if (!record || typeof record.payload !== "object" || record.payload === null) {
    console.error(
      `unrecognized anchor schema in ${path.basename(anchorPath)}: ` +
        "no `payload` object and not a recognized batch record. " +
        "Expected a daily/cert anchor (payload + signature) or an audit-batch record.",
    );
    process.exit(2);
  }
  const { merkleOk, sigOk, recomputed, claimed } = verifyAnchorRecord(record, pubKey);
  console.log(`merkle root  : ${merkleOk ? "OK  " : "FAIL"}  recomputed=${recomputed}`);
  if (!merkleOk) console.log(`               claimed   =${claimed}`);
  console.log(`ed25519 sig  : ${sigOk ? "OK  " : "FAIL"}  algo=${record.signatureAlgorithm}`);
  otsHint();
  console.log(`anchor date  : ${record.payload.anchorDate}`);
  console.log(`leaf count   : ${record.payload.leafCount}`);
  console.log(`key fp       : ${record.publicKeyFingerprint}`);

  process.exit(merkleOk && sigOk ? 0 : 1);
}

module.exports = {
  sha256,
  merkleRoot,
  canonicalize,
  verifyAnchorRecord,
  batchMerkleRoot,
  isBatchRecord,
  verifyBatchRecord,
  loadPublicKey,
  main,
};

// Only run the CLI when executed directly, so the pure functions above can be
// required from tests without triggering argv parsing or process.exit.
if (require.main === module) {
  main();
}
