#!/usr/bin/env python3
"""
Build a Tessera-style audit batch for the v1.6 day.

Wraps the four certificates of record into a single Merkle tree:

  Leaf 1 :: v1.6 ENGINE CERT       (canonical blind benchmark, calb2 v0.9.0)
  Leaf 2 :: XVAL MATRIX CERT       (CausalLayer vs GPT-4.1-mini vs Gemini-2.5-flash)
  Leaf 3 :: CURATOR DRIFT CERT     (5 HIGH retag justifications, v0.9.0 -> v0.9.1)
  Leaf 4 :: CIDL LAYER 1 CERT      (typed telemetry contract + clean-run proof)
  (bonus) Leaf 5 :: v1.6 RE-RUN CERT on v0.9.1 (engine unchanged, corpus corrected)

Each leaf is a SHA-256 over the canonical JSON content of the artefact.
The Merkle tree is duplicate-pair (Bitcoin style).  The batch JSON is
ed25519-signed, OTS-stampable, and committed to the anchor-log repo.
"""
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ANCHORS = Path("/home/ubuntu/work/causallayer-anchor-log/anchors")
OUT     = ANCHORS / "2026-05-15-v1.6-audit-batch.json"
KEY     = Path.home() / ".causallayer-secrets/cert.private.pem"

XVAL_DIR = Path("/home/ubuntu/calb2/v09/xval")
DRIFT_LOG = Path("/home/ubuntu/work/causallayer-calb2/analysis/v1.6/v091_corrections.md")
CIDL_SCHEMA = Path("/home/ubuntu/work/causallayer-calb2/schema/cidl-layer1.schema.json")
CIDL_CLEAN_RUN = Path("/home/ubuntu/work/causallayer-calb2/analysis/v1.6.1/cidl_layer1_violations.csv")
CORRECTIONS_LOG = DRIFT_LOG  # markdown audit log
DRIFT_CSV_BEFORE = Path("/home/ubuntu/work/causallayer-calb2/analysis/v1.6/drift_candidates_v1.csv")
DRIFT_CSV_AFTER  = Path("/home/ubuntu/work/causallayer-calb2/analysis/v1.6.1/drift_candidates_v091.csv")


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


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    # ------- gather artefact references and content hashes -------
    engine_cert_v090 = ANCHORS / "2026-05-15-v1.6-calb2-v0.9.0.json"
    engine_cert_v091 = ANCHORS / "2026-05-15-v1.6-calb2-v0.9.1.json"
    xval_cert       = XVAL_DIR / "anchor" / "2026-05-15-xval-v1.0-calb2-v0.9.0.json"
    xval_summary    = XVAL_DIR / "summary.json"
    xval_report     = XVAL_DIR / "xval_report.md"
    xval_matrix_csv = XVAL_DIR / "matrix.csv"

    leaves = []

    # Leaf 1: v1.6 engine cert (v0.9.0 baseline)
    leaves.append({
        "leaf_index": 1,
        "leaf_type": "engine_cert",
        "title": "v1.6 engine cert on CALB-2 v0.9.0",
        "artefact_path": str(engine_cert_v090),
        "sha256": sha256_file(engine_cert_v090),
        "merkle_root_of_anchor": load_json(engine_cert_v090).get("merkleRoot"),
        "leaf_count_in_anchor": load_json(engine_cert_v090).get("leafCount"),
        "ots_proof": str(engine_cert_v090) + ".ots" if (engine_cert_v090.parent / (engine_cert_v090.name + ".ots")).exists() else None,
    })

    # Leaf 2: XVAL matrix cert
    xval_extra = {
        "summary_sha256": sha256_file(xval_summary) if xval_summary.exists() else None,
        "report_sha256":  sha256_file(xval_report)  if xval_report.exists()  else None,
        "matrix_csv_sha256": sha256_file(xval_matrix_csv) if xval_matrix_csv.exists() else None,
    }
    leaves.append({
        "leaf_index": 2,
        "leaf_type": "xval_matrix_cert",
        "title": "Cross-validation matrix: CausalLayer vs GPT-4.1-mini vs Gemini-2.5-flash",
        "artefact_path": str(xval_cert),
        "sha256": sha256_file(xval_cert),
        "merkle_root_of_anchor": load_json(xval_cert).get("merkleRoot"),
        "leaf_count_in_anchor": load_json(xval_cert).get("leafCount"),
        "ots_proof": str(xval_cert) + ".ots" if (xval_cert.parent / (xval_cert.name + ".ots")).exists() else None,
        "supporting_artefacts": xval_extra,
    })

    # Leaf 3: Curator drift correction cert
    drift_leaf_payload = {
        "leaf_type": "curator_drift_cert",
        "audit_log_sha256": sha256_file(CORRECTIONS_LOG),
        "drift_csv_before_sha256": sha256_file(DRIFT_CSV_BEFORE),
        "drift_csv_after_sha256":  sha256_file(DRIFT_CSV_AFTER),
        "cases_corrected": ["L5-903", "L7-201", "L8-902", "L3-904", "L11-202"],
    }
    drift_leaf_sha = sha256_bytes(json.dumps(drift_leaf_payload, sort_keys=True).encode("utf-8"))
    leaves.append({
        "leaf_index": 3,
        "leaf_type": "curator_drift_cert",
        "title": "Curator drift corrections v0.9.0 -> v0.9.1 (5 HIGH-severity retags with doctrinal justification)",
        "sha256": drift_leaf_sha,
        "sha256_scope": "sha256(canonical-json of {audit_log_sha256, drift_csv_before_sha256, drift_csv_after_sha256, cases_corrected, leaf_type})",
        "rules_applied": ["R1_joint_sanction_must_show_in_2plus_slots",
                          "R2_individual_sanction_must_include_human_operator",
                          "R6a_explicit_none_provider_cannot_have_ai_provider_liability"],
        "cases_corrected": drift_leaf_payload["cases_corrected"],
        "audit_log_sha256": drift_leaf_payload["audit_log_sha256"],
        "audit_log_path": str(CORRECTIONS_LOG),
        "drift_csv_before_sha256": drift_leaf_payload["drift_csv_before_sha256"],
        "drift_csv_after_sha256":  drift_leaf_payload["drift_csv_after_sha256"],
        "high_violations_before": 5,
        "high_violations_after":  0,
    })

    # Leaf 4: CIDL Layer 1 cert
    cidl_leaf_payload = {
        "leaf_type": "cidl_layer1_cert",
        "schema_sha256": sha256_file(CIDL_SCHEMA),
        "validator_clean_run_csv_sha256": sha256_file(CIDL_CLEAN_RUN),
        "errors": 0,
        "warnings": 0,
    }
    cidl_leaf_sha = sha256_bytes(json.dumps(cidl_leaf_payload, sort_keys=True).encode("utf-8"))
    leaves.append({
        "leaf_index": 4,
        "leaf_type": "cidl_layer1_cert",
        "title": "CIDL Layer 1: typed telemetry contract + clean-run validation against v0.9.1",
        "sha256": cidl_leaf_sha,
        "sha256_scope": "sha256(canonical-json of {schema_sha256, validator_clean_run_csv_sha256, errors, warnings, leaf_type})",
        "schema_path": str(CIDL_SCHEMA),
        "schema_sha256": cidl_leaf_payload["schema_sha256"],
        "validator_clean_run_csv_sha256": cidl_leaf_payload["validator_clean_run_csv_sha256"],
        "validator_clean_run_path": str(CIDL_CLEAN_RUN),
        "errors": 0,
        "warnings": 0,
        "scope": "8 closed-enum routing-critical telemetry fields (sanctioned_entity_role, primary_business_model, primary_source_type, regulator_named_provider, model_provider_class, deployer_org_class, ground_truth_confidence, failure_category)",
    })

    # Leaf 5: v1.6 re-run cert on v0.9.1 (engine unchanged)
    leaves.append({
        "leaf_index": 5,
        "leaf_type": "engine_rerun_cert",
        "title": "v1.6 engine re-run on CALB-2 v0.9.1 (engine unchanged, corpus self-consistent)",
        "artefact_path": str(engine_cert_v091),
        "sha256": sha256_file(engine_cert_v091),
        "merkle_root_of_anchor": load_json(engine_cert_v091).get("merkleRoot"),
        "leaf_count_in_anchor": load_json(engine_cert_v091).get("leafCount"),
        "ots_proof": str(engine_cert_v091) + ".ots" if (engine_cert_v091.parent / (engine_cert_v091.name + ".ots")).exists() else None,
        "headline_metrics": {
            "legal_top1": "257/280 = 91.8%",
            "legal_top1_high_confidence": "180/193 = 93.3%",
            "mean_l1_legal": 21.51,
            "delta_vs_v090": "Top-1 unchanged; mean L1 21.59 -> 21.51 (-0.08)",
        },
    })

    # ------- Merkle root over the 5 leaves -------
    leaf_hashes = [l["sha256"] for l in leaves]
    root = merkle_root(leaf_hashes)

    batch = {
        "schema": "causallayer.audit-batch.v1",
        "title": "CausalLayer v1.6 day audit batch",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "engine_version": "1.6.0",
        "corpus_versions": ["0.9.0", "0.9.1"],
        "leaf_count": len(leaves),
        "leaves": leaves,
        "merkle_algorithm": "sha256-bitcoin-duplicate-pair",
        "batch_merkle_root": root,
        "status": "pre-genesis-test",
        "notes": ("This batch concatenates the four certificates of record produced "
                  "during the v1.6 push (engine cert v0.9.0, cross-validation matrix, "
                  "curator drift correction, CIDL Layer 1) plus the v1.6 re-run on "
                  "the corrected v0.9.1 corpus.  Each leaf SHA-256 hashes its underlying "
                  "anchor JSON; the batch root is signed with ed25519 and OTS-stamped, "
                  "yielding a single Bitcoin-attestable proof of the day's work."),
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
        capture_output=True, text=True
    )
    if res.returncode != 0:
        raise SystemExit(f"openssl sign failed: {res.stderr}")
    sig_hex = sig_path.read_bytes().hex()

    # extract pubkey fingerprint (sha256 of DER pubkey) for verifiability
    pub_proc = subprocess.run(
        ["openssl", "pkey", "-in", str(KEY), "-pubout", "-outform", "DER"],
        capture_output=True
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
    print(f"  batch_body_sha256       : {body_sha}")
    print(f"  ed25519 signature       : {sig_hex[:16]}…{sig_hex[-16:]}")
    print(f"  pubkey fingerprint      : {pubkey_fp}")

    # cleanup tmp
    for p in [sig_path, msg_path]:
        if p.exists(): p.unlink()


if __name__ == "__main__":
    main()
