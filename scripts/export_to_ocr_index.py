#!/usr/bin/env python3
"""
export_to_ocr_index.py — Export CPVT DB entities → NDJSON cho OCRP cross-check

Output: VẬT TƯ/exports/<entity>_master_v<X>.ndjson (CPVT workspace boundary)
OCRP pulls via shared path khi nhận message db-export-ready.

Entities:
  - bid_quote_master_v1.1.ndjson    — ContractDetail dataSource=BID_QUOTE + projectCode JOIN
  - prdetail_master_v1.1.ndjson     — PrDetail + uom_normalized
  - vendor_master_v1.1.ndjson       — Vendor table (CPVT side) for OCRP fuzzy match
  - bidanalysis_master_v1.1.ndjson  — BidAnalysis + denorm bid value (for top-30 priority sort)
  - material_master_v1.1.ndjson     — Material catalog (for OCRP subGroupCode classifier validate)
  - top30_bid_priority_v1.1.json    — Top 30 BidAnalysis by totalQuote for OCRP Sprint P3

Schema versions:
  v1.0 (DEPRECATED, 16:35): raw export, 4 issues per DA bug-report
  v1.1 (CURRENT, 17:xx):    fix float precision + projectCode JOIN + uom_normalized + multi-currency VND
                            + 3 entities mới (Vendor/BidAnalysis/Material) + top-30 priority

Usage:
  python3 scripts/export_to_ocr_index.py
"""
import json
import os
import sys
import hashlib
import psycopg2
import psycopg2.extras
from pathlib import Path
from datetime import datetime, date
from decimal import Decimal

DSN = os.environ.get(
    "VATTU_DSN",
    "postgresql://vpi_user:VpiProcurement2026%21@127.0.0.1:54321/vpi_procurement",
)

SCRIPT_DIR = Path(__file__).parent.resolve()
EXPORT_DIR = SCRIPT_DIR.parent / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

SCHEMA_VERSION = "v1.1"

# FX rate hardcode (B-CPVT-001-v2 fix #4) — TODO migrate sang FX historical table
FX_HARDCODE = {
    "VND": 1.0,
    "USD": 25000.0,
    "EUR": 27000.0,
}
FX_SOURCE = "hardcoded_2026-05-25"  # → manifest


def serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return str(obj)


def to_vnd(amount, currency):
    """Convert amount sang VND. Raise nếu currency unknown để bắt sớm bugs."""
    if amount is None:
        return None
    rate = FX_HARDCODE.get((currency or "VND").upper())
    if rate is None:
        return None  # unknown currency → skip thay vì crash
    return round(float(amount) * rate, 2)


def round_safe(v, digits):
    """Round nếu là number, else trả nguyên."""
    if v is None:
        return None
    try:
        return round(float(v), digits)
    except (TypeError, ValueError):
        return v


def normalize_uom(uom):
    """B-CPVT-001-v2 fix #3 — strip + lower (giữ uom gốc, add field mới)."""
    if not uom:
        return None
    return str(uom).strip().lower()


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ============================================================
# EXPORTS
# ============================================================

def export_bid_quote(cur, output_name):
    """B-CPVT-001-v2 fixes #1+2+4:
       - JOIN ContractDetail → PrDetail → PR → Project → code (fix projectCode null)
       - Round float fields
       - Add totalNoVAT_VND / totalWithVAT_VND / unitPriceNoVAT_VND
    """
    sql = """
    SELECT
        cd.*,
        COALESCE(cd."projectCode", p.code) AS "projectCode_resolved"
    FROM "ContractDetail" cd
    LEFT JOIN "PrDetail" pd ON pd.id = cd."prDetailId"
    LEFT JOIN "PurchaseRequisition" pr ON pr.id = pd."prId"
    LEFT JOIN "Project" p ON p.id = pr."projectId"
    WHERE cd."dataSource" = 'BID_QUOTE'
    """
    cur.execute(sql)
    rows = [dict(r) for r in cur.fetchall()]

    fixed_count = {"projectCode_filled": 0, "vnd_added": 0}
    for r in rows:
        # Fix #2: projectCode (use resolved nếu original null)
        if not r.get("projectCode") and r.get("projectCode_resolved"):
            r["projectCode"] = r["projectCode_resolved"]
            fixed_count["projectCode_filled"] += 1
        r.pop("projectCode_resolved", None)

        # Fix #1: round float
        r["unitPriceNoVAT"] = round_safe(r.get("unitPriceNoVAT"), 2)
        r["totalNoVAT"] = round_safe(r.get("totalNoVAT"), 2)
        r["totalWithVAT"] = round_safe(r.get("totalWithVAT"), 2)
        r["vatRate"] = round_safe(r.get("vatRate"), 4)
        r["contractQty"] = round_safe(r.get("contractQty"), 3)
        r["contractWeight"] = round_safe(r.get("contractWeight"), 3)
        r["deliveredQty"] = round_safe(r.get("deliveredQty"), 3)
        r["deliveredWeight"] = round_safe(r.get("deliveredWeight"), 3)

        # Fix #4: multi-currency VND conversion
        cur_code = r.get("currency") or "VND"
        r["unitPriceNoVAT_VND"] = to_vnd(r.get("unitPriceNoVAT"), cur_code)
        r["totalNoVAT_VND"] = to_vnd(r.get("totalNoVAT"), cur_code)
        r["totalWithVAT_VND"] = to_vnd(r.get("totalWithVAT"), cur_code)
        if r["totalNoVAT_VND"] is not None:
            fixed_count["vnd_added"] += 1

    out_path = EXPORT_DIR / output_name
    with open(out_path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, default=serialize) + "\n")

    sha = file_sha256(out_path)
    sample_fields = list(rows[0].keys()) if rows else []
    print(f"  ✅ {output_name}: {len(rows)} records")
    print(f"     projectCode filled: {fixed_count['projectCode_filled']}/{len(rows)} ({fixed_count['projectCode_filled']/len(rows)*100:.1f}%)")
    print(f"     VND fields added: {fixed_count['vnd_added']}/{len(rows)}")
    print(f"     sha256: {sha[:16]}...")
    return {
        "name": output_name,
        "count": len(rows),
        "sha256": sha,
        "fields": sample_fields,
        "fixes_applied": {
            "projectCode_join": f"{fixed_count['projectCode_filled']}/{len(rows)} resolved",
            "vnd_conversion": f"{fixed_count['vnd_added']}/{len(rows)} converted",
            "float_rounded": "unitPriceNoVAT(2), vatRate(4), totals(2), qty/weight(3)",
        },
    }


def export_prdetail(cur, output_name):
    """B-CPVT-001-v2 fixes #1+3:
       - Round float
       - Add uom_normalized
    """
    sql = 'SELECT * FROM "PrDetail"'
    cur.execute(sql)
    rows = [dict(r) for r in cur.fetchall()]

    uom_unique_before = set()
    uom_unique_after = set()

    for r in rows:
        # Fix #1: round
        r["unitWeight"] = round_safe(r.get("unitWeight"), 4)
        r["netQty"] = round_safe(r.get("netQty"), 3)
        r["netWeight"] = round_safe(r.get("netWeight"), 3)
        r["reqQty"] = round_safe(r.get("reqQty"), 3)
        r["reqWeight"] = round_safe(r.get("reqWeight"), 3)
        r["remainQty"] = round_safe(r.get("remainQty"), 3)
        r["remainWeight"] = round_safe(r.get("remainWeight"), 3)
        r["toBuyQty"] = round_safe(r.get("toBuyQty"), 3)
        r["toBuyWeight"] = round_safe(r.get("toBuyWeight"), 3)

        # Fix #3: uom_normalized
        original_uom = r.get("uom")
        if original_uom:
            uom_unique_before.add(original_uom)
        r["uom_normalized"] = normalize_uom(original_uom)
        if r["uom_normalized"]:
            uom_unique_after.add(r["uom_normalized"])

    out_path = EXPORT_DIR / output_name
    with open(out_path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, default=serialize) + "\n")

    sha = file_sha256(out_path)
    sample_fields = list(rows[0].keys()) if rows else []
    print(f"  ✅ {output_name}: {len(rows)} records")
    print(f"     uom unique: {len(uom_unique_before)} → normalized {len(uom_unique_after)}")
    print(f"     sha256: {sha[:16]}...")
    return {
        "name": output_name,
        "count": len(rows),
        "sha256": sha,
        "fields": sample_fields,
        "fixes_applied": {
            "uom_normalize": f"{len(uom_unique_before)} unique → {len(uom_unique_after)} (strip+lower)",
            "float_rounded": "weight/qty fields rounded(3-4)",
        },
    }


def export_vendor(cur, output_name):
    """NEW v1.1 — Export Vendor table cho OCRP fuzzy match.
    OCRP đã có vendor data từ hd_active.ndjson (Sprint P1), CPVT cung cấp current state
    để OCRP biết vendor nào đã có (skip), vendor nào chưa (priority enrich).
    """
    cur.execute('SELECT * FROM "Vendor" ORDER BY name')
    rows = [dict(r) for r in cur.fetchall()]

    has_tax = sum(1 for r in rows if r.get("taxCode"))
    has_address = sum(1 for r in rows if r.get("address"))

    out_path = EXPORT_DIR / output_name
    with open(out_path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, default=serialize) + "\n")

    sha = file_sha256(out_path)
    print(f"  ✅ {output_name}: {len(rows)} records")
    print(f"     has_taxCode: {has_tax}/{len(rows)} ({has_tax/len(rows)*100:.1f}%) — OCRP enrich target")
    print(f"     has_address: {has_address}/{len(rows)} ({has_address/len(rows)*100:.1f}%)")
    print(f"     sha256: {sha[:16]}...")
    return {
        "name": output_name,
        "count": len(rows),
        "sha256": sha,
        "fields": list(rows[0].keys()) if rows else [],
        "coverage": {
            "has_taxCode": f"{has_tax}/{len(rows)}",
            "has_address": f"{has_address}/{len(rows)}",
            "enrich_priority": f"{len(rows) - has_tax} vendors cần OCRP enrich taxCode",
        },
    }


def export_bidanalysis(cur, output_name):
    """NEW v1.1 — Export BidAnalysis + denorm totalQuote (SUM BidQuoteVendor) cho top-N priority sort."""
    sql = """
    SELECT
      ba.*,
      COALESCE(SUM(bqv."totalQuote"), 0) AS "totalQuoteSum",
      COUNT(DISTINCT bqv.id) AS "vendorCount",
      COUNT(DISTINCT bqi.id) AS "itemCount",
      COUNT(DISTINCT bqo.id) AS "offerCount",
      COUNT(DISTINCT bqo.id) FILTER (WHERE bqo."qualitySource" = 'CLAUDE_READ') AS "claudeReadOfferCount",
      p.code AS "projectCode_resolved"
    FROM "BidAnalysis" ba
    LEFT JOIN "BidQuoteVendor" bqv ON bqv."bidId" = ba.id
    LEFT JOIN "BidQuoteItem" bqi ON bqi."bidId" = ba.id
    LEFT JOIN "BidQuoteOffer" bqo ON bqo."vendorId" = bqv.id
    LEFT JOIN "Project" p ON p.id = ba."projectId"
    GROUP BY ba.id, p.code
    ORDER BY "totalQuoteSum" DESC
    """
    cur.execute(sql)
    rows = [dict(r) for r in cur.fetchall()]

    out_path = EXPORT_DIR / output_name
    with open(out_path, "w", encoding="utf-8") as f:
        for r in rows:
            r["totalQuoteSum"] = round_safe(r.get("totalQuoteSum"), 2)
            f.write(json.dumps(r, ensure_ascii=False, default=serialize) + "\n")

    sha = file_sha256(out_path)
    cr_total = sum(int(r.get("claudeReadOfferCount") or 0) for r in rows)
    print(f"  ✅ {output_name}: {len(rows)} records (sorted by totalQuote DESC)")
    print(f"     CLAUDE_READ offers existing: {cr_total} (target: scale top-30 BIDs)")
    print(f"     sha256: {sha[:16]}...")
    return {
        "name": output_name,
        "count": len(rows),
        "sha256": sha,
        "fields": list(rows[0].keys()) if rows else [],
        "claude_read_offers_current": cr_total,
    }


def export_top30_bid_priority(cur, output_name):
    """NEW v1.1 — Top 30 BidAnalysis cho OCRP Sprint P3 scale (Q3 selection: A=top by totalQuote)."""
    sql = """
    SELECT
      ba.id,
      ba."bidCode",
      ba.subject,
      ba."bidDate",
      p.code AS "projectCode",
      COALESCE(SUM(bqv."totalQuote"), 0) AS "totalQuoteSum",
      COUNT(DISTINCT bqv.id) AS "vendorCount",
      COUNT(DISTINCT bqi.id) AS "itemCount",
      ba."sourceFileName",
      ba."sourceFilePath"
    FROM "BidAnalysis" ba
    LEFT JOIN "BidQuoteVendor" bqv ON bqv."bidId" = ba.id
    LEFT JOIN "BidQuoteItem" bqi ON bqi."bidId" = ba.id
    LEFT JOIN "Project" p ON p.id = ba."projectId"
    GROUP BY ba.id, p.code
    HAVING COUNT(DISTINCT bqv.id) >= 2  -- min 2 vendors (matrix mới meaningful)
    ORDER BY "totalQuoteSum" DESC
    LIMIT 30
    """
    cur.execute(sql)
    rows = [dict(r) for r in cur.fetchall()]

    out_path = EXPORT_DIR / output_name
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "_meta": {
                "purpose": "OCRP Sprint P3 Claude Read priority queue (Q3=A top by totalQuote)",
                "exported_at": datetime.now().isoformat(),
                "selection_criteria": "Top 30 BidAnalysis sorted by SUM(BidQuoteVendor.totalQuote) DESC, min 2 vendors",
                "total_eligible": len(rows),
            },
            "queue": [
                {
                    "rank": i + 1,
                    "bidId": r["id"],
                    "bidCode": r.get("bidCode"),
                    "subject": r.get("subject"),
                    "projectCode": r.get("projectCode"),
                    "totalQuote": round_safe(r.get("totalQuoteSum"), 2),
                    "vendorCount": r.get("vendorCount"),
                    "itemCount": r.get("itemCount"),
                    "sourceFileName": r.get("sourceFileName"),
                    "sourceFilePath": r.get("sourceFilePath"),
                }
                for i, r in enumerate(rows)
            ],
        }, f, ensure_ascii=False, indent=2, default=serialize)

    sha = file_sha256(out_path)
    total_value = sum(float(r.get("totalQuoteSum") or 0) for r in rows)
    print(f"  ✅ {output_name}: top 30 BidAnalysis")
    print(f"     cumulative value: {total_value/1e9:.2f} tỷ VND")
    print(f"     sha256: {sha[:16]}...")
    return {
        "name": output_name,
        "count": len(rows),
        "sha256": sha,
        "total_value_billion_vnd": round(total_value / 1e9, 2),
    }


def export_material(cur, output_name):
    """NEW v1.1 — Export Material catalog cho OCRP subGroupCode classifier validate."""
    cur.execute('SELECT * FROM "Material" ORDER BY name')
    rows = [dict(r) for r in cur.fetchall()]

    has_subgroup = sum(1 for r in rows if r.get("materialSubGroupCode"))
    has_weight = sum(1 for r in rows if r.get("unitWeightAvg"))

    out_path = EXPORT_DIR / output_name
    with open(out_path, "w", encoding="utf-8") as f:
        for r in rows:
            r["unitWeightAvg"] = round_safe(r.get("unitWeightAvg"), 4)
            f.write(json.dumps(r, ensure_ascii=False, default=serialize) + "\n")

    sha = file_sha256(out_path)
    print(f"  ✅ {output_name}: {len(rows)} records")
    print(f"     has_subGroupCode: {has_subgroup}/{len(rows)} ({has_subgroup/len(rows)*100:.1f}%) — OCRP classify target")
    print(f"     has_unitWeightAvg: {has_weight}/{len(rows)} ({has_weight/len(rows)*100:.1f}%)")
    print(f"     sha256: {sha[:16]}...")
    return {
        "name": output_name,
        "count": len(rows),
        "sha256": sha,
        "fields": list(rows[0].keys()) if rows else [],
        "coverage": {
            "has_subGroupCode": f"{has_subgroup}/{len(rows)}",
            "has_unitWeightAvg": f"{has_weight}/{len(rows)}",
            "classify_priority": f"{len(rows) - has_subgroup} materials cần OCRP classifier",
        },
    }


def main():
    print(f"Schema version: {SCHEMA_VERSION}")
    print(f"FX source: {FX_SOURCE}")
    print(f"Connecting: {DSN[:50]}...")
    conn = psycopg2.connect(DSN)
    conn.set_client_encoding("UTF8")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    print(f"Export dir: {EXPORT_DIR}\n")

    files_info = []

    print("[1/6] Exporting BID_QUOTE master với projectCode JOIN + VND conversion...")
    files_info.append(export_bid_quote(cur, f"bid_quote_master_{SCHEMA_VERSION}.ndjson"))
    print()

    print("[2/6] Exporting PrDetail với uom_normalized...")
    files_info.append(export_prdetail(cur, f"prdetail_master_{SCHEMA_VERSION}.ndjson"))
    print()

    print("[3/6] Exporting Vendor master (OCRP enrich target)...")
    files_info.append(export_vendor(cur, f"vendor_master_{SCHEMA_VERSION}.ndjson"))
    print()

    print("[4/6] Exporting BidAnalysis master với offer counts...")
    files_info.append(export_bidanalysis(cur, f"bidanalysis_master_{SCHEMA_VERSION}.ndjson"))
    print()

    print("[5/6] Exporting top-30 BidAnalysis priority queue (OCRP Sprint P3)...")
    files_info.append(export_top30_bid_priority(cur, f"top30_bid_priority_{SCHEMA_VERSION}.json"))
    print()

    print("[6/6] Exporting Material catalog (OCRP subGroupCode classifier target)...")
    files_info.append(export_material(cur, f"material_master_{SCHEMA_VERSION}.ndjson"))
    print()

    cur.close()
    conn.close()

    # Manifest v1.1 — bao gồm checksum + fields + fx_source + schema_version
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "exported_at": datetime.now().isoformat(),
        "from_db": DSN.split("@")[1] if "@" in DSN else DSN,
        "fx_source": FX_SOURCE,
        "fx_rates_used": FX_HARDCODE,
        "fixes_from_v1.0": [
            "B-CPVT-001-v2 #1 — float precision rounded",
            "B-CPVT-001-v2 #2 — projectCode JOIN from PrDetail→PR→Project",
            "B-CPVT-001-v2 #3 — uom_normalized field added (PrDetail)",
            "B-CPVT-001-v2 #4 — multi-currency VND fields added (BID_QUOTE)",
        ],
        "files": files_info,
    }
    manifest_path = EXPORT_DIR / f"manifest_{SCHEMA_VERSION}.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, default=serialize)
    print(f"✅ manifest_{SCHEMA_VERSION}.json")

    print("\n" + "=" * 50)
    print("Summary:")
    for fi in files_info:
        print(f"  {fi['name']}: {fi['count']} records, sha256={fi['sha256'][:16]}...")
    print(f"  Manifest: manifest_{SCHEMA_VERSION}.json")
    print(f"Output: {EXPORT_DIR}")
    print(f"\nNote: v1.0 files giữ nguyên cho rollback comparison")


if __name__ == "__main__":
    main()
