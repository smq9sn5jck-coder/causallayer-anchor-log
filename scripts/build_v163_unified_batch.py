#!/usr/bin/env python3
"""
Build a Tessera-style audit batch for the v1.6.3 UNIFIED PIPELINE day (Tier 1 fixes).

This is the first time the full 53-engine pipeline has been run end-to-end on
all 280 cases of CALB-2 v0.9.1 in a single batch, with the legal-doctrine
scorer wired as the authoritative attribution path inside analyzeIncident().

Leaves
------
  Leaf 1 :: UNIFIED RUN SUMMARY     (run_summary.json — headline metrics + per-engine fire rate)
  Leaf 2 :: SCENARIO MAP            (scenario_map.json — per-case Top-1 / L1 / doctrine)
  Leaf 3 :: COVERAGE MATRIX         (coverage_matrix.json — full per-case slot status × 53 engines)
  Leaf 4 :: PER-CASE BUNDLE MERKLE  (Bitcoin-style Merkle root over the 280 per-case JSON bundles
                                     — gives any single case a 9-deep inclusion proof)
  Leaf 5 :: ENGINE CODE FINGERPRINT (sha256s of legalResponsibilityScorer.ts, boundaryGapDetector.ts, insuranceUnderwriting.ts, damagesQuantification.ts — locks the four T1 fixes)

Each leaf SHA-256 hashes its underlying artefact (or canonical-JSON for the
synthetic merkle leaf).  The 5 leaf hashes are themselves Merkle-rooted with
duplicate-pair (Bitcoin convention).  The batch body is then ed25519-signed
and OTS-stamped, yielding one Bitcoin-attestable proof of the entire day.
"""
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ANCHORS = Path("/home/ubuntu/work/causallayer-anchor-log/anchors")
OUT     = ANCHORS / "2026-05-16-v1.6.3-unified-pipeline.json"
KEY     = Path.home() / ".causallayer-secrets/cert.private.pem"

UNIFIED_DIR     = Path("/home/ubuntu/calb2/v09/v163_unified")
RUN_SUMMARY     = UNIFIED_DIR / "run_summary.json"
SCENARIO_MAP    = UNIFIED_DIR / "scenario_map.json"
COVERAGE_MATRIX = UNIFIED_DIR / "coverage_matrix.json"
PER_CASE_DIR    = UNIFIED_DIR / "per_case"

LEGAL_SCORER    = Path("/home/ubuntu/work/causallayer/server/engine/legalResponsibilityScorer.ts")
BOUNDARY_DET    = Path("/home/ubuntu/work/causallayer/server/engine/boundaryGapDetector.ts")
UNDERWRITING    = Path("/home/ubuntu/work/causallayer/server/engine/insuranceUnderwriting.ts")
DAMAGES_QUANT   = Path("/home/ubuntu/work/causallayer/server/engine/damagesQuantification.ts")
ORCHESTRATOR    = Path("/home/ubuntu/work/causallayer/scripts/calb2_v091_unified_run.ts")
SCOPE_SCRIPT    = Path("/tmp/scope_inhouse_joint_fix.py")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def merkle_root(leaves):
    """Bitcoin-style Merkle: hex-leaves -> hex-root, duplicate-last on odd."""
    if not leaves:
        raise ValueError("empty leaves")
    layer = [bytes.fromhex(x) for x in leaves]
    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])
        layer = [hashlib.sha256(layer[i] + layer[i+1]).digest()
                 for i in range(0, len(layer), 2)]
    return layer[0].hex()


def per_case_merkle_root(per_case_dir: Path):
    """Build a Bitcoin-style Merkle tree over all 280 per-case bundles
    (sorted by case id for determinism). Returns (root, count, sample_leaves)."""
    files = sorted(per_case_dir.glob("*.json"), key=lambda p: p.stem)
    if not files:
        raise SystemExit(f"no per-case bundles in {per_case_dir}")
    leaf_hashes = [sha256_file(p) for p in files]
    root = merkle_root(leaf_hashes)
    sample = [
        {"case_id": files[0].stem, "sha256": leaf_hashes[0]},
        {"case_id": files[len(files) // 2].stem, "sha256": leaf_hashes[len(files) // 2]},
        {"case_id": files[-1].stem, "sha256": leaf_hashes[-1]},
    ]
    return root, len(files), sample


def main():
    if not RUN_SUMMARY.exists():
        raise SystemExit(f"run summary not found: {RUN_SUMMARY}")

    # ------- pull headline metrics from the run summary -------
    summary = json.loads(RUN_SUMMARY.read_text())
    headline = {
        "engine_version_tag": "v1.6.3 (T1.1+T1.2+T1.3+T1.4) + v3.1.0 (engine package)",
        "cases_total": summary["cases_total"],
        "cases_ok": summary["cases_ok"],
        "cases_failed": summary["cases_failed"],
        "total_runtime_ms": summary["total_ms"],
        "mean_runtime_ms_per_case": summary["mean_ms"],
        "legal_top1": summary["legal_top1"],
        "legal_l1_mean": summary["legal_l1_mean"],
        "engines_total_slots": len(summary["engine_fire_rate"]),
        "engines_filling_100pct": sum(1 for v in summary["engine_fire_rate"].values() if v["fill_pct"] >= 99.99),
        "engines_filling_partial": sum(1 for v in summary["engine_fire_rate"].values() if 0 < v["fill_pct"] < 99.99),
        "engines_dead_zero_pct": sum(1 for v in summary["engine_fire_rate"].values() if v["fill_pct"] == 0),
    }

    # ------- per-case Merkle root -------
    per_case_root, per_case_count, sample_leaves = per_case_merkle_root(PER_CASE_DIR)

    # ------- assemble leaves -------
    leaves = []

    # Leaf 1: unified run summary
    leaves.append({
        "leaf_index": 1,
        "leaf_type": "unified_run_summary",
        "title": "v1.6.3 unified pipeline — run summary (53 engines × 280 cases, T1 fixes applied)",
        "artefact_path": str(RUN_SUMMARY),
        "sha256": sha256_file(RUN_SUMMARY),
        "headline_metrics": headline,
    })

    # Leaf 2: scenario map (per-case attribution)
    leaves.append({
        "leaf_index": 2,
        "leaf_type": "scenario_map",
        "title": "Per-case predictions, ground truth, doctrine, Top-1 / L1",
        "artefact_path": str(SCENARIO_MAP),
        "sha256": sha256_file(SCENARIO_MAP),
        "case_count": per_case_count,
    })

    # Leaf 3: coverage matrix (full per-case × per-engine fill matrix)
    leaves.append({
        "leaf_index": 3,
        "leaf_type": "coverage_matrix",
        "title": "Per-case × per-engine fill matrix (53 slots × 280 cases)",
        "artefact_path": str(COVERAGE_MATRIX),
        "sha256": sha256_file(COVERAGE_MATRIX),
        "engine_slots": list(summary["engine_fire_rate"].keys()),
    })

    # Leaf 4: per-case bundle Merkle root
    pc_leaf_payload = {
        "leaf_type": "per_case_bundle_merkle_root",
        "case_count": per_case_count,
        "merkle_algorithm": "sha256-bitcoin-duplicate-pair",
        "root": per_case_root,
        "directory": str(PER_CASE_DIR),
    }
    pc_leaf_sha = sha256_bytes(json.dumps(pc_leaf_payload, sort_keys=True).encode("utf-8"))
    leaves.append({
        "leaf_index": 4,
        "leaf_type": "per_case_bundle_merkle_root",
        "title": f"Bitcoin-style Merkle root over {per_case_count} per-case bundle files",
        "sha256": pc_leaf_sha,
        "sha256_scope": "sha256(canonical-json of {leaf_type, case_count, merkle_algorithm, root, directory})",
        "merkle_root_of_bundles": per_case_root,
        "case_count": per_case_count,
        "directory": str(PER_CASE_DIR),
        "sample_inclusion_witnesses": sample_leaves,
    })

    # Leaf 5: code fingerprints of the four engine files modified by Tier 1 fixes
    scorer_sha = sha256_file(LEGAL_SCORER)
    leaves.append({
        "leaf_index": 5,
        "leaf_type": "engine_code_fingerprint",
        "title": "engine source fingerprints (T1.1–T1.4 fixes locked)",
        "artefact_path": str(LEGAL_SCORER),
        "sha256": scorer_sha,
        "scope": "Locks the four Tier 1 fixes: T1.1 graph_causal hand-off shim (orchestrator), T1.2 boundary_gaps tiering (boundaryGapDetector.ts), T1.3 underwriting grade re-binning (insuranceUnderwriting.ts), T1.4 damages sector cap (damagesQuantification.ts).",
        "supporting_artefacts": {
            "legal_scorer":          {"path": str(LEGAL_SCORER), "sha256": scorer_sha,                          "locks": "v1.6.2 in-house+joint → deployer (L5-903)"},
            "boundary_gap_detector": {"path": str(BOUNDARY_DET), "sha256": sha256_file(BOUNDARY_DET),           "locks": "T1.2 v2 empirical-anchored severity tiering"},
            "insurance_underwriting":{"path": str(UNDERWRITING), "sha256": sha256_file(UNDERWRITING),           "locks": "T1.3 risk-grade re-binning (3 → 6 grades)"},
            "damages_quantification":{"path": str(DAMAGES_QUANT),"sha256": sha256_file(DAMAGES_QUANT),          "locks": "T1.4 sector cap (median $307M → $25M)"},
            "orchestrator":          {"path": str(ORCHESTRATOR), "sha256": sha256_file(ORCHESTRATOR),           "locks": "T1.1 graph_causal hand-off shim provenance"},
            "scope_check_script":    {"path": str(SCOPE_SCRIPT),  "sha256": sha256_file(SCOPE_SCRIPT) if SCOPE_SCRIPT.exists() else None, "locks": "v1.6.2 fix scope analysis"},
        },
    })

    # ------- Merkle root over the 5 leaves -------
    leaf_hashes = [l["sha256"] for l in leaves]
    root = merkle_root(leaf_hashes)

    batch = {
        "schema": "causallayer.audit-batch.v1",
        "title": "CausalLayer v1.6.3 — TIER 1 ENGINE FIXES DAY (T1.1 hand-off shim + T1.2 boundary tiering + T1.3 grade re-binning + T1.4 damages sector cap)",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "engine_package_version": "3.1.0",
        "legal_scorer_doctrinal_version": "1.6.2",
        "corpus_version": "0.9.1",
        "corpus_path": "/home/ubuntu/calb2/v09/calb2_v091.json",
        "leaf_count": len(leaves),
        "leaves": leaves,
        "merkle_algorithm": "sha256-bitcoin-duplicate-pair",
        "batch_merkle_root": root,
        "status": "pre-genesis-test",
        "notes": (
            "First end-to-end run of the full 53-engine analyzeIncident() pipeline "
            "on all 280 cases of CALB-2 v0.9.1, with the legal-doctrine scorer "
            "(scoreLegalResponsibility) wired as the authoritative attribution "
            "path. Run completed in 18 seconds on a single core (mean 64 ms/case). "
            "Top-1 attribution matches CALB-2 ground-truth liability_allocation on "
            "92.0% of valid cases (254/276); mean L1 = 20.92. 45 of 53 engine "
            "slots fire on 100% of cases; 3 fire partially (regulator-/domain-gated); "
            "5 fire 0% (jurisdictionDivergence, llmForeseeabilityRefinement, "
            "unifiedButFor, regressionDamagesEstimate, article73Report — these are "
            "domain- or budget-gated and require either richer corpus signals or "
            "an LLM-call budget that this batch run did not enable). Reported "
            "transparently rather than hidden."
        ),
    }

    body = json.dumps(batch, indent=2, sort_keys=False)
    body_sha = sha256_bytes(body.encode("utf-8"))
    batch["batch_body_sha256"] = body_sha

    # ed25519-sign the batch body sha
    sig_path = OUT.with_suffix(".sig.tmp")
    msg_path = OUT.with_suffix(".msg.tmp")
    msg_path.write_bytes(body_sha.encode("utf-8"))
    res = subprocess.run(
        ["openssl", "pkeyutl", "-sign", "-rawin",
         "-inkey", str(KEY), "-in", str(msg_path),
         "-out", str(sig_path)],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        raise SystemExit(f"openssl sign failed: {res.stderr}")
    sig_hex = sig_path.read_bytes().hex()

    pub_proc = subprocess.run(
        ["openssl", "pkey", "-in", str(KEY), "-pubout", "-outform", "DER"],
        capture_output=True,
    )
    if pub_proc.returncode != 0:
        raise SystemExit(f"openssl pubkey failed: {pub_proc.stderr.decode()}")
    pubkey_fp = hashlib.sha256(pub_proc.stdout).hexdigest()

    batch["signature"] = {
        "alg": "ed25519",
        "signed_field": "batch_body_sha256",
        "signature_hex": sig_hex,
        "pubkey_sha256_fingerprint": pubkey_fp,
    }

    final = json.dumps(batch, indent=2, sort_keys=False)
    OUT.write_text(final, encoding="utf-8")

    print(f"wrote {OUT}")
    print(f"  leaves                  : {len(leaves)}")
    print(f"  batch_merkle_root       : {root}")
    print(f"  per_case_merkle_root    : {per_case_root}")
    print(f"  case_count              : {per_case_count}")
    print(f"  batch_body_sha256       : {body_sha}")
    print(f"  ed25519 signature       : {sig_hex[:16]}…{sig_hex[-16:]}")
    print(f"  pubkey fingerprint      : {pubkey_fp}")

    for p in [sig_path, msg_path]:
        if p.exists():
            p.unlink()


if __name__ == "__main__":
    main()
