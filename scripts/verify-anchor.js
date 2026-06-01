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
 * Merkle root for batch anchors (causallayer.audit-batch.v1): leaves are already
 * SHA-256 hex digests, decoded from hex and combined WITHOUT re-hashing the leaf.
 *   internal = sha256(left || right); odd nodes are duplicated.
 */
function merkleRootHex(hexLeaves) {
  if (hexLeaves.length === 0) return sha256(Buffer.alloc(0)).toString("hex");
  let layer = hexLeaves.map((h) => Buffer.from(h, "hex"));
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

/** Decode an Ed25519 signature, preferring an explicit 128-hex match over length alone. */
function decodeSignature(sig) {
  return Buffer.from(sig, /^[0-9a-fA-F]{128}$/.test(sig) ? "hex" : "base64");
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

  let record;
  try {
    record = JSON.parse(fs.readFileSync(anchorPath, "utf8"));
  } catch (err) {
    console.error(`cannot read/parse ${anchorPath}: ${err.message}`);
    process.exit(2);
  }
  if (!record || typeof record !== "object") {
    console.error(`${anchorPath}: not a JSON object`);
    process.exit(2);
  }

  const pubKey = loadPublicKey(scriptDir);
  const otsPath = anchorPath + ".ots";
  const otsNote = () => {
    if (fs.existsSync(otsPath)) {
      console.log(`ots proof    : present at ${path.basename(otsPath)}`);
      console.log(`               run: ots verify ${otsPath}`);
    } else {
      console.log("ots proof    : not yet attached (anchor may be < ~3h old)");
    }
  };

  // ── Batch anchor schema (causallayer.audit-batch.v1): no `payload`, leaves are
  //    pre-hashed hex digests, signature is an object over `batch_body_sha256`. ──
  const isBatch =
    typeof record.schema === "string" && record.schema.startsWith("causallayer.audit-batch");
  if (isBatch || (!record.payload && record.batch_merkle_root)) {
    if (!Array.isArray(record.leaves) || typeof record.batch_merkle_root !== "string" ||
        !record.signature || typeof record.signature !== "object") {
      console.error(`${anchorPath}: malformed batch anchor (missing leaves/batch_merkle_root/signature)`);
      process.exit(2);
    }
    const leafHashes = record.leaves.map((l) => l.sha256);
    const recomputed = merkleRootHex(leafHashes);
    const merkleOk = recomputed === record.batch_merkle_root;
    console.log(`batch merkle : ${merkleOk ? "OK  " : "FAIL"}  recomputed=${recomputed}`);
    if (!merkleOk) console.log(`               claimed   =${record.batch_merkle_root}`);

    const signedField = record.signature.signed_field;
    const signedValue = record[signedField];
    let sigOk = false;
    if (typeof signedValue !== "string" || typeof record.signature.signature_hex !== "string") {
      console.log(`ed25519 sig  : FAIL  (missing signed_field "${signedField}" or signature_hex)`);
    } else {
      sigOk = crypto.verify(null, Buffer.from(signedValue, "utf8"), pubKey,
        Buffer.from(record.signature.signature_hex, "hex"));
      console.log(`ed25519 sig  : ${sigOk ? "OK  " : "FAIL"}  algo=${record.signature.alg} signed=${signedField}`);
    }
    otsNote();
    console.log(`schema       : ${record.schema}`);
    console.log(`leaf count   : ${record.leaf_count}`);
    process.exit(merkleOk && sigOk ? 0 : 1);
  }

  // ── Daily anchor schema ──
  if (!record.payload || !Array.isArray(record.payload.leaves) || typeof record.signature !== "string") {
    console.error(`${anchorPath}: not a recognized anchor (missing payload.leaves / string signature)`);
    process.exit(2);
  }

  // 1. Merkle
  const recomputed = merkleRoot(record.payload.leaves);
  const claimed = record.payload.merkleRoot;
  const merkleOk = recomputed === claimed;
  console.log(`merkle root  : ${merkleOk ? "OK  " : "FAIL"}  recomputed=${recomputed}`);
  if (!merkleOk) console.log(`               claimed   =${claimed}`);

  // 2. Signature
  const canonical = Buffer.from(canonicalize(record.payload), "utf8");
  const sig = decodeSignature(record.signature);
  const sigOk = crypto.verify(null, canonical, pubKey, sig);
  console.log(`ed25519 sig  : ${sigOk ? "OK  " : "FAIL"}  algo=${record.signatureAlgorithm}`);

  // 3. OTS proof hint
  otsNote();

  // 4. Anchor metadata
  console.log(`anchor date  : ${record.payload.anchorDate}`);
  console.log(`leaf count   : ${record.payload.leafCount}`);
  console.log(`key fp       : ${record.publicKeyFingerprint}`);

  process.exit(merkleOk && sigOk ? 0 : 1);
}

main();
