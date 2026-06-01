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
