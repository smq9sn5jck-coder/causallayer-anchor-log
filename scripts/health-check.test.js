"use strict";
/**
 * Black-box tests for health-check.js.
 *
 * health-check.js is a self-executing script (it calls main() and process.exit
 * at load time), so it can't be unit-tested by requiring it. Instead we drive
 * it as a child process — the way CI actually runs it — and assert on its exit
 * code and printed assertions.
 *
 * Two surfaces are covered:
 *   1. The real repo: the script must pass (exit 0) against the committed
 *      key material and GENESIS.md.
 *   2. Synthetic repos in a temp dir: health-check resolves everything relative
 *      to its own __dirname (REPO_ROOT = path.resolve(__dirname, "..")), so by
 *      copying the script into <tmp>/scripts/ we can point it at a fully
 *      controlled key/anchor tree. This exercises the per-anchor (A1–A4) and
 *      freshness (F1) paths, which the real committed fixtures never trigger
 *      (their filenames don't match the YYYY-MM-DD.json daily pattern).
 *
 * Zero dependencies — Node's built-in test runner only:  node --test
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const REAL_HEALTH_CHECK = path.join(REPO_ROOT, "scripts", "health-check.js");
const REAL_VERIFY_SCRIPT = path.join(REPO_ROOT, "scripts", "verify-anchor.js");

// ─── Fixture helpers (mirror health-check's own canonicalization) ────────────

function sha256hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

function merkleRoot(leafStrings) {
  if (leafStrings.length === 0) return sha256hex(Buffer.alloc(0));
  let layer = leafStrings.map((s) => crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest());
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

/** A YYYY-MM-DD string `daysAgo` days before now (UTC). */
function isoDate(daysAgo) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Build a self-consistent synthetic anchor-log repo in a fresh temp dir and
 * return its root. `opts` lets individual tests corrupt exactly one invariant.
 */
function makeRepo(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anchorlog-"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "anchors"));

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const rawKey = der.subarray(der.length - 32);
  const fingerprint = sha256hex(der);

  fs.writeFileSync(path.join(root, "public-key.pem"), pem);
  fs.writeFileSync(
    path.join(root, "public-key.jwk.json"),
    JSON.stringify({ kty: "OKP", crv: "Ed25519", x: rawKey.toString("base64url") }, null, 2),
  );
  fs.writeFileSync(path.join(root, "fingerprint.txt"), (opts.fingerprint ?? fingerprint) + "\n");
  if (!opts.omitGenesis) {
    fs.writeFileSync(
      path.join(root, "GENESIS.md"),
      "# Genesis\n\n" + "This is a synthetic genesis document for testing. ".repeat(5) + "\n",
    );
  }

  // Copy the two scripts so REPO_ROOT (= <root>) resolves to our tree.
  fs.copyFileSync(REAL_HEALTH_CHECK, path.join(root, "scripts", "health-check.js"));
  fs.copyFileSync(REAL_VERIFY_SCRIPT, path.join(root, "scripts", "verify-anchor.js"));

  if (opts.anchor) {
    const leaves = opts.anchor.leaves ?? ["leaf-a", "leaf-b", "leaf-c"];
    const anchorDate = opts.anchor.date ?? isoDate(0);
    const payload = { anchorDate, leaves, merkleRoot: merkleRoot(leaves) };
    if (opts.anchor.tamperLeafAfterRoot) payload.leaves = [...leaves, "sneaky-extra-leaf"];
    let signature = crypto.sign(null, Buffer.from(canonicalize(payload), "utf8"), privateKey).toString("hex");
    if (opts.anchor.forgeSignature) {
      const buf = Buffer.from(signature, "hex");
      buf[0] ^= 0xff;
      signature = buf.toString("hex");
    }
    const record = {
      payload,
      signature,
      signatureAlgorithm: "Ed25519",
      publicKeyFingerprint: opts.anchor.fingerprint ?? fingerprint,
    };
    fs.writeFileSync(path.join(root, "anchors", `${anchorDate}.json`), JSON.stringify(record, null, 2));
  }

  return root;
}

/** Run a repo's copied health-check.js and return { code, out }. */
function runHealthCheck(root) {
  const res = spawnSync(process.execPath, [path.join(root, "scripts", "health-check.js")], {
    encoding: "utf8",
  });
  return { code: res.status, out: (res.stdout || "") + (res.stderr || "") };
}

// ─── 1. The real, committed repo ─────────────────────────────────────────────

test("health-check passes against the committed repo (exit 0, all S-checks)", () => {
  const res = spawnSync(process.execPath, [REAL_HEALTH_CHECK], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  for (const id of ["S1", "S2", "S3", "S4", "S5", "S6"]) {
    assert.match(res.stdout, new RegExp(`${id}:`), `expected ${id} assertion in output`);
  }
  assert.match(res.stdout, /Health check PASSED/);
});

// ─── 2a. Synthetic happy path with a fresh, signed daily anchor ──────────────

test("verifies a well-formed fresh anchor end-to-end (A* + F1, exit 0)", () => {
  const root = makeRepo({ anchor: { date: isoDate(0) } });
  const { code, out } = runHealthCheck(root);
  assert.equal(code, 0, out);
  assert.match(out, /A\*: 1 anchor\(s\) verified end-to-end/);
  assert.match(out, /F1: most recent anchor .*within 26h grace/);
});

// ─── 2b. Structural failure branches ─────────────────────────────────────────

test("fails when fingerprint.txt does not match the public key (S3, exit 1)", () => {
  const root = makeRepo({ fingerprint: "0".repeat(64) });
  const { code, out } = runHealthCheck(root);
  assert.equal(code, 1);
  assert.match(out, /S3:/);
  assert.match(out, /Health check FAILED/);
});

test("fails when GENESIS.md is missing (S6, exit 1)", () => {
  const root = makeRepo({ omitGenesis: true });
  const { code, out } = runHealthCheck(root);
  assert.equal(code, 1);
  assert.match(out, /S6: GENESIS\.md is missing/);
});

// ─── 2c. Per-anchor failure branches ─────────────────────────────────────────

test("detects a Merkle root mismatch from a tampered anchor (A3, exit 1)", () => {
  const root = makeRepo({ anchor: { date: isoDate(0), tamperLeafAfterRoot: true } });
  const { code, out } = runHealthCheck(root);
  assert.equal(code, 1);
  assert.match(out, /A3 .*Merkle root mismatch/);
});

test("detects a forged anchor signature (A4, exit 1)", () => {
  const root = makeRepo({ anchor: { date: isoDate(0), forgeSignature: true } });
  const { code, out } = runHealthCheck(root);
  assert.equal(code, 1);
  assert.match(out, /A4 .*signature does not verify/);
});

test("detects an anchor whose fingerprint does not bind to the repo key (A2, exit 1)", () => {
  const root = makeRepo({ anchor: { date: isoDate(0), fingerprint: "f".repeat(64) } });
  const { code, out } = runHealthCheck(root);
  assert.equal(code, 1);
  assert.match(out, /A2 .*does not match repo fingerprint/);
});

// ─── 2d. Freshness branch (auto-activates once anchors exist) ─────────────────

test("flags a stale anchor beyond the 26h grace window (F1, exit 1)", () => {
  const root = makeRepo({ anchor: { date: isoDate(3) } }); // 3 days old
  const { code, out } = runHealthCheck(root);
  assert.equal(code, 1);
  assert.match(out, /F1: most recent anchor .* grace is 26h/);
});
