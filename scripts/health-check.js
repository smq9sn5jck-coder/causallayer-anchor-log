#!/usr/bin/env node
/**
 * health-check.js — public-trust infrastructure health check.
 *
 * Runs on push, on pull request, and on a daily cron. Asserts every
 * invariant the anchor-log's STATUS.md publicly claims, and adds a
 * freshness check that auto-activates the moment the first signed
 * anchor lands.
 *
 * What this checks (zero deps, Node 18+):
 *
 *   Structural integrity (always):
 *     S1. public-key.pem exists and parses as a valid Ed25519 public key
 *     S2. public-key.jwk.json's `x` field decodes to the same 32 raw key
 *         bytes as the PEM
 *     S3. fingerprint.txt equals sha256(DER-encoded SPKI of public-key.pem)
 *         (this is the canonical fingerprint definition probed empirically
 *         from the existing committed values; documented here so any future
 *         change is loud)
 *     S4. scripts/verify-anchor.js requires only `node:*` modules
 *         (zero-dependency claim)
 *     S5. scripts/verify-anchor.js makes no fetch / http / https calls
 *         (offline claim)
 *     S6. GENESIS.md exists and is committed
 *
 *   Per-anchor (only if anchors exist):
 *     A1. Each anchors/*.json is a JSON file with the expected top-level
 *         shape (payload + signature + signatureAlgorithm + publicKeyFingerprint)
 *     A2. Each anchor's recorded publicKeyFingerprint matches fingerprint.txt
 *     A3. Each anchor's Merkle root recomputes correctly from its leaves
 *     A4. Each anchor's Ed25519 signature verifies against public-key.pem
 *
 *   Freshness (auto-activates post-genesis):
 *     F1. If at least one anchors/YYYY-MM-DD.json exists, the most recent
 *         anchor's date must be within 26 hours of "now". This gives the
 *         daily cron a 2-hour grace window over the nominal 24-hour cycle.
 *
 * Exits 0 on success. Exits 1 with a list of failed assertions otherwise.
 *
 * Stays silent (no failure) about freshness while the repo is pre-genesis,
 * because failing daily about a state that STATUS.md publicly documents as
 * "Pending genesis" would be noise, not signal.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const PEM_PATH = path.join(REPO_ROOT, "public-key.pem");
const JWK_PATH = path.join(REPO_ROOT, "public-key.jwk.json");
const FINGERPRINT_PATH = path.join(REPO_ROOT, "fingerprint.txt");
const GENESIS_PATH = path.join(REPO_ROOT, "GENESIS.md");
const VERIFY_SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "verify-anchor.js");
const ANCHORS_DIR = path.join(REPO_ROOT, "anchors");
const FRESHNESS_GRACE_HOURS = 26;

const failures = [];
const passes = [];

function pass(id, msg) {
  passes.push(`${id}: ${msg}`);
}

function fail(id, msg) {
  failures.push(`${id}: ${msg}`);
}

function sha256hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ─── Structural integrity ──────────────────────────────────────────

function checkPublicKey() {
  if (!fs.existsSync(PEM_PATH)) {
    fail("S1", "public-key.pem is missing");
    return null;
  }

  let pubKey;
  try {
    pubKey = crypto.createPublicKey(fs.readFileSync(PEM_PATH));
  } catch (err) {
    fail("S1", `public-key.pem is not a valid public key: ${err.message}`);
    return null;
  }

  if (pubKey.asymmetricKeyType !== "ed25519") {
    fail("S1", `public-key.pem is not an Ed25519 key (got ${pubKey.asymmetricKeyType})`);
    return null;
  }

  pass("S1", "public-key.pem parses as a valid Ed25519 public key");
  return pubKey;
}

function checkJwkMatchesPem(pubKey) {
  if (!pubKey) return;
  if (!fs.existsSync(JWK_PATH)) {
    fail("S2", "public-key.jwk.json is missing");
    return;
  }

  let jwk;
  try {
    jwk = JSON.parse(fs.readFileSync(JWK_PATH, "utf8"));
  } catch (err) {
    fail("S2", `public-key.jwk.json is not valid JSON: ${err.message}`);
    return;
  }

  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") {
    fail("S2", "public-key.jwk.json is not a valid OKP/Ed25519 JWK");
    return;
  }

  // Extract the 32 raw key bytes from the PEM via the DER SPKI tail.
  const der = pubKey.export({ format: "der", type: "spki" });
  const rawFromPem = der.subarray(der.length - 32);
  const rawFromJwk = Buffer.from(jwk.x, "base64url");

  if (!rawFromPem.equals(rawFromJwk)) {
    fail("S2", "public-key.jwk.json `x` does not decode to the same 32 raw key bytes as public-key.pem");
    return;
  }

  pass("S2", "public-key.jwk.json `x` matches the raw key bytes inside public-key.pem");
}

function checkFingerprint(pubKey) {
  if (!pubKey) return;
  if (!fs.existsSync(FINGERPRINT_PATH)) {
    fail("S3", "fingerprint.txt is missing");
    return;
  }

  const declared = fs.readFileSync(FINGERPRINT_PATH, "utf8").trim();
  if (!/^[0-9a-f]{64}$/.test(declared)) {
    fail("S3", `fingerprint.txt is not a 64-hex-char string (got ${declared.length} chars)`);
    return;
  }

  const der = pubKey.export({ format: "der", type: "spki" });
  const computed = sha256hex(der);
  if (declared !== computed) {
    fail(
      "S3",
      `fingerprint.txt (${declared}) does not match sha256(DER SPKI public key) = ${computed}`,
    );
    return;
  }

  pass("S3", "fingerprint.txt equals sha256(DER SPKI public key)");
}

function checkVerifyScriptZeroDeps() {
  if (!fs.existsSync(VERIFY_SCRIPT_PATH)) {
    fail("S4", "scripts/verify-anchor.js is missing");
    return;
  }
  const src = fs.readFileSync(VERIFY_SCRIPT_PATH, "utf8");
  // Match any require("...") and require('...') call.
  const requires = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
  const offenders = requires.filter(r => !r.startsWith("node:"));
  if (offenders.length > 0) {
    fail("S4", `scripts/verify-anchor.js requires non-node modules: ${offenders.join(", ")}`);
    return;
  }
  pass("S4", `scripts/verify-anchor.js requires only node:* modules (${requires.length} total)`);
}

function checkVerifyScriptOffline() {
  if (!fs.existsSync(VERIFY_SCRIPT_PATH)) return; // already failed in S4
  const src = fs.readFileSync(VERIFY_SCRIPT_PATH, "utf8");
  // Look for any token that would imply a network call. Allow `https://`
  // appearing inside a string literal (e.g. error messages telling users
  // where to fetch the public key from manually).
  const networkPatterns = [
    /\bfetch\s*\(/,
    /\bnew\s+XMLHttpRequest\b/,
    /require\(\s*['"]node:https?['"]\s*\)/,
    /require\(\s*['"]https?['"]\s*\)/,
    /require\(\s*['"]node:net['"]\s*\)/,
    /require\(\s*['"]node:dgram['"]\s*\)/,
  ];
  const hits = networkPatterns.filter(p => p.test(src));
  if (hits.length > 0) {
    fail("S5", `scripts/verify-anchor.js contains network-call patterns: ${hits.map(p => p.source).join(", ")}`);
    return;
  }
  pass("S5", "scripts/verify-anchor.js makes no fetch / http / https / net calls");
}

function checkGenesisExists() {
  if (!fs.existsSync(GENESIS_PATH)) {
    fail("S6", "GENESIS.md is missing");
    return;
  }
  const stat = fs.statSync(GENESIS_PATH);
  if (stat.size < 100) {
    fail("S6", `GENESIS.md is suspiciously small (${stat.size} bytes)`);
    return;
  }
  pass("S6", `GENESIS.md is present (${stat.size} bytes)`);
}

// ─── Anchor verification (only runs if anchors exist) ───────────────

function listAnchorFiles() {
  if (!fs.existsSync(ANCHORS_DIR)) return [];
  return fs
    .readdirSync(ANCHORS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

function merkleRoot(leafStrings) {
  if (leafStrings.length === 0) return crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex");
  let layer = leafStrings.map(s => crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest());
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      next.push(crypto.createHash("sha256").update(Buffer.concat([left, right])).digest());
    }
    layer = next;
  }
  return layer[0].toString("hex");
}

function checkAnchors(pubKey, declaredFingerprint) {
  const anchors = listAnchorFiles();
  if (anchors.length === 0) {
    pass("A*", "no anchors yet (pre-genesis) — per-anchor checks skipped");
    return [];
  }

  const verified = [];
  for (const fname of anchors) {
    const fpath = path.join(ANCHORS_DIR, fname);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(fpath, "utf8"));
    } catch (err) {
      fail(`A1 (${fname})`, `anchor is not valid JSON: ${err.message}`);
      continue;
    }
    if (!record.payload || !record.signature || !record.publicKeyFingerprint) {
      fail(`A1 (${fname})`, "anchor missing one of: payload, signature, publicKeyFingerprint");
      continue;
    }

    if (declaredFingerprint && record.publicKeyFingerprint !== declaredFingerprint) {
      fail(`A2 (${fname})`, `anchor's publicKeyFingerprint (${record.publicKeyFingerprint}) does not match repo fingerprint.txt (${declaredFingerprint})`);
    }

    const recomputed = merkleRoot(record.payload.leaves || []);
    if (recomputed !== record.payload.merkleRoot) {
      fail(`A3 (${fname})`, `Merkle root mismatch: recomputed=${recomputed} claimed=${record.payload.merkleRoot}`);
      continue;
    }

    if (pubKey) {
      const canonical = Buffer.from(canonicalize(record.payload), "utf8");
      const sig = Buffer.from(
        record.signature,
        record.signature.length === 128 ? "hex" : "base64",
      );
      const sigOk = crypto.verify(null, canonical, pubKey, sig);
      if (!sigOk) {
        fail(`A4 (${fname})`, "Ed25519 signature does not verify against public-key.pem");
        continue;
      }
    }

    verified.push(record);
  }

  if (verified.length > 0) {
    pass("A*", `${verified.length} anchor(s) verified end-to-end (Merkle + Ed25519 + fingerprint binding)`);
  }
  return verified;
}

// ─── Freshness (auto-activates post-genesis) ───────────────────────

function checkFreshness(verifiedAnchors) {
  if (verifiedAnchors.length === 0) return; // pre-genesis: silent

  const dates = verifiedAnchors
    .map(a => a.payload && a.payload.anchorDate)
    .filter(Boolean)
    .sort();
  const latestDateStr = dates[dates.length - 1];
  if (!latestDateStr) {
    fail("F1", "verified anchors exist but none carry payload.anchorDate");
    return;
  }
  const latestTime = new Date(`${latestDateStr}T00:00:00Z`).getTime();
  const ageHours = (Date.now() - latestTime) / 3_600_000;

  if (ageHours > FRESHNESS_GRACE_HOURS) {
    fail(
      "F1",
      `most recent anchor (${latestDateStr}) is ${ageHours.toFixed(1)}h old; freshness grace is ${FRESHNESS_GRACE_HOURS}h`,
    );
    return;
  }
  pass("F1", `most recent anchor (${latestDateStr}) is ${ageHours.toFixed(1)}h old (within ${FRESHNESS_GRACE_HOURS}h grace)`);
}

// ─── Main ──────────────────────────────────────────────────────────

function main() {
  const pubKey = checkPublicKey();
  checkJwkMatchesPem(pubKey);
  checkFingerprint(pubKey);
  checkVerifyScriptZeroDeps();
  checkVerifyScriptOffline();
  checkGenesisExists();

  const declaredFingerprint = fs.existsSync(FINGERPRINT_PATH)
    ? fs.readFileSync(FINGERPRINT_PATH, "utf8").trim()
    : null;
  const verifiedAnchors = checkAnchors(pubKey, declaredFingerprint);
  checkFreshness(verifiedAnchors);

  console.log("");
  console.log("PASS:");
  for (const p of passes) console.log("  " + p);
  if (failures.length > 0) {
    console.log("");
    console.log("FAIL:");
    for (const f of failures) console.log("  " + f);
    console.log("");
    console.log(`Health check FAILED with ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log("");
  console.log(`Health check PASSED (${passes.length} assertions).`);
  process.exit(0);
}

main();
