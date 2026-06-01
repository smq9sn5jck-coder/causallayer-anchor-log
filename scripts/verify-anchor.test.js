"use strict";
/**
 * Unit tests for verify-anchor.js — the zero-dependency Ed25519 + Merkle
 * verifier for daily anchor records. Uses Node's built-in test runner so the
 * repo stays dependency-free:  node --test
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  sha256,
  merkleRoot,
  canonicalize,
  verifyAnchorRecord,
  batchMerkleRoot,
  isBatchRecord,
  verifyBatchRecord,
} = require("./verify-anchor.js");

// ─── sha256 ───────────────────────────────────────────────────────────────
test("sha256 returns the known digest of the empty buffer", () => {
  assert.equal(
    sha256(Buffer.alloc(0)).toString("hex"),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

// ─── canonicalize ───────────────────────────────────────────────────────────
test("canonicalize sorts object keys at every depth", () => {
  assert.equal(canonicalize({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

test("canonicalize preserves array order and handles null", () => {
  assert.equal(canonicalize([3, 1, 2]), "[3,1,2]");
  assert.equal(canonicalize(null), "null");
});

test("canonicalize is stable regardless of key insertion order", () => {
  assert.equal(canonicalize({ x: 1, y: 2 }), canonicalize({ y: 2, x: 1 }));
});

// ─── merkleRoot ─────────────────────────────────────────────────────────────
test("merkleRoot of no leaves is the empty-buffer hash", () => {
  assert.equal(merkleRoot([]), sha256(Buffer.alloc(0)).toString("hex"));
});

test("merkleRoot of a single leaf is sha256(utf8(leaf))", () => {
  assert.equal(merkleRoot(["only"]), sha256(Buffer.from("only", "utf8")).toString("hex"));
});

test("merkleRoot duplicates the last node on an odd layer", () => {
  const h = (s) => sha256(Buffer.from(s, "utf8"));
  const leaves = ["a", "b", "c"];
  const l1 = leaves.map(h);
  const l2 = [
    sha256(Buffer.concat([l1[0], l1[1]])),
    sha256(Buffer.concat([l1[2], l1[2]])),
  ];
  const expected = sha256(Buffer.concat([l2[0], l2[1]])).toString("hex");
  assert.equal(merkleRoot(leaves), expected);
});

test("merkleRoot is tamper- and order-sensitive", () => {
  assert.notEqual(merkleRoot(["x", "y", "z"]), merkleRoot(["x", "y", "Z"]));
  assert.notEqual(merkleRoot(["x", "y"]), merkleRoot(["y", "x"]));
});

// ─── verifyAnchorRecord (end-to-end with a real keypair) ─────────────────────
function buildSignedRecord(privateKey) {
  const leaves = ["case-001:abc", "case-002:def", "case-003:ghi"];
  const payload = {
    anchorDate: "2026-05-10",
    leafCount: leaves.length,
    leaves,
    merkleRoot: merkleRoot(leaves),
  };
  const canonical = Buffer.from(canonicalize(payload), "utf8");
  const signature = crypto.sign(null, canonical, privateKey).toString("hex");
  return { payload, signature, signatureAlgorithm: "ed25519" };
}

test("verifyAnchorRecord passes for a faithfully signed record", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const record = buildSignedRecord(privateKey);
  const res = verifyAnchorRecord(record, publicKey);
  assert.equal(res.merkleOk, true);
  assert.equal(res.sigOk, true);
});

test("verifyAnchorRecord detects a tampered leaf (Merkle mismatch)", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const record = buildSignedRecord(privateKey);
  record.payload.leaves[0] = "case-001:TAMPERED";
  const res = verifyAnchorRecord(record, publicKey);
  assert.equal(res.merkleOk, false);
});

test("verifyAnchorRecord detects a forged signature", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const record = buildSignedRecord(privateKey);
  const buf = Buffer.from(record.signature, "hex");
  buf[0] ^= 0xff;
  record.signature = buf.toString("hex");
  const res = verifyAnchorRecord(record, publicKey);
  assert.equal(res.sigOk, false);
});

test("verifyAnchorRecord rejects a record signed by the wrong key", () => {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const { publicKey: otherPub } = crypto.generateKeyPairSync("ed25519");
  const record = buildSignedRecord(privateKey);
  const res = verifyAnchorRecord(record, otherPub);
  assert.equal(res.merkleOk, true);
  assert.equal(res.sigOk, false);
});

test("verifyAnchorRecord throws a clear error (not a TypeError) on a payload-less record", () => {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  assert.throws(() => verifyAnchorRecord({ schema: "causallayer.audit-batch.v1" }, publicKey), /no `payload` object/);
});

// ─── batchMerkleRoot ─────────────────────────────────────────────────────────
test("batchMerkleRoot folds raw digests (does not re-hash the leaf strings)", () => {
  const a = sha256(Buffer.from("a")).toString("hex");
  const b = sha256(Buffer.from("b")).toString("hex");
  // root = sha256(rawA || rawB), where raw = the 32-byte digest, NOT sha256 of the hex string.
  const expected = sha256(Buffer.concat([Buffer.from(a, "hex"), Buffer.from(b, "hex")])).toString("hex");
  assert.equal(batchMerkleRoot([a, b]), expected);
});

test("batchMerkleRoot duplicates the last digest on an odd layer", () => {
  const h = (s) => sha256(Buffer.from(s)).toString("hex");
  const node = (x, y) => sha256(Buffer.concat([Buffer.from(x, "hex"), Buffer.from(y, "hex")])).toString("hex");
  const [a, b, c] = [h("a"), h("b"), h("c")];
  // three digests: [a,b,c] -> [node(a,b), node(c,c)] -> node(...) (last node duplicated)
  const lvl1 = [node(a, b), node(c, c)];
  assert.equal(batchMerkleRoot([a, b, c]), node(lvl1[0], lvl1[1]));
});

// ─── isBatchRecord / verifyBatchRecord ───────────────────────────────────────
function buildSignedBatch(privateKey, fingerprint = "fp-test") {
  const leaves = [
    { leaf_index: 1, sha256: sha256(Buffer.from("artefact-1")).toString("hex") },
    { leaf_index: 2, sha256: sha256(Buffer.from("artefact-2")).toString("hex") },
    { leaf_index: 3, sha256: sha256(Buffer.from("artefact-3")).toString("hex") },
  ];
  const batch = {
    schema: "causallayer.audit-batch.v1",
    title: "test batch",
    leaf_count: leaves.length,
    leaves,
    merkle_algorithm: "sha256-bitcoin-duplicate-pair",
    batch_merkle_root: batchMerkleRoot(leaves.map((l) => l.sha256)),
    status: "pre-genesis-test",
    notes: "synthetic test batch",
  };
  // batch_body_sha256 is sha256 of the indent-2 JSON body (minus body hash + signature).
  batch.batch_body_sha256 = sha256(Buffer.from(JSON.stringify(batch, null, 2), "utf8")).toString("hex");
  const signature_hex = crypto.sign(null, Buffer.from(batch.batch_body_sha256, "utf8"), privateKey).toString("hex");
  batch.signature = {
    alg: "ed25519",
    signed_field: "batch_body_sha256",
    signature_hex,
    pubkey_sha256_fingerprint: fingerprint,
  };
  return batch;
}

test("isBatchRecord distinguishes batch records from daily/cert anchors", () => {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  assert.equal(isBatchRecord(buildSignedBatch(privateKey)), true);
  assert.equal(isBatchRecord(buildSignedRecord(privateKey)), false);
  assert.equal(isBatchRecord({ foo: "bar" }), false);
});

test("verifyBatchRecord passes for a faithfully signed batch (merkle + sig + body)", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const res = verifyBatchRecord(buildSignedBatch(privateKey), publicKey);
  assert.equal(res.merkleOk, true);
  assert.equal(res.sigOk, true);
  assert.equal(res.bodyOk, true);
  assert.equal(res.signedField, "batch_body_sha256");
});

test("verifyBatchRecord detects a tampered leaf digest (Merkle mismatch)", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const batch = buildSignedBatch(privateKey);
  batch.leaves[0].sha256 = sha256(Buffer.from("TAMPERED")).toString("hex");
  const res = verifyBatchRecord(batch, publicKey);
  assert.equal(res.merkleOk, false);
});

test("verifyBatchRecord detects a forged signature", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const batch = buildSignedBatch(privateKey);
  const buf = Buffer.from(batch.signature.signature_hex, "hex");
  buf[0] ^= 0xff;
  batch.signature.signature_hex = buf.toString("hex");
  const res = verifyBatchRecord(batch, publicKey);
  assert.equal(res.sigOk, false);
});

test("verifyBatchRecord reports bodyOk=false (non-fatal) when the body is altered post-hash", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const batch = buildSignedBatch(privateKey);
  batch.title = "altered after the body hash was computed";
  const res = verifyBatchRecord(batch, publicKey);
  // Signature still verifies (it covers batch_body_sha256, which is unchanged),
  // but the visible body no longer reproduces that digest.
  assert.equal(res.sigOk, true);
  assert.equal(res.bodyOk, false);
});
