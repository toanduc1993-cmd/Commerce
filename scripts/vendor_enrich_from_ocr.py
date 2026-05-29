#!/usr/bin/env python3
"""
vendor_enrich_from_ocr.py — B-CPVT-012: Consume OCRP vendor_master_v1.ndjson
                            → UPDATE Vendor table

Match strategy (combo C per OCRP Q1 answer 19:00):
  1. taxCode strict (highest confidence)
  2. Fuzzy name: rapidfuzz.token_set_ratio, cutoff 90
  3. No match → INSERT new vendor (flag _enriched_from='ocr')

Usage:
  python3.11 scripts/vendor_enrich_from_ocr.py --dry-run   # preview, no DB write
  python3.11 scripts/vendor_enrich_from_ocr.py --apply     # actually write

Output: reports stats to stdout + writes ./exports/vendor_enrich_report_<ts>.json
"""
import argparse
import json
import os
import sys
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path

# rapidfuzz from /opt/homebrew/lib/python3.11/site-packages — invoke this via python3.11
import psycopg2
import psycopg2.extras
from rapidfuzz import fuzz, process

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
OCR_FILE = PROJECT_ROOT.parent / "IBSHI/mua-hang/_index/vendor_master_v1.ndjson"
EXPORT_DIR = PROJECT_ROOT / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

DSN = os.environ.get(
    "VATTU_DSN",
    "postgresql://vpi_user:VpiProcurement2026%21@127.0.0.1:54321/vpi_procurement",
)

FUZZY_CUTOFF = 90

# Fields OCRP ships → CPVT Vendor schema
# OCR field            -> DB field
FIELD_MAP = {
    "taxCode": "taxCode",
    "address": "address",
    "city": "city",
    "country": "country",
    "shortName": "shortName",
    "vendorType": "vendorType",
    "bank": "bank",
    "accountNo": "accountNo",
    "repName": "contactName",
    "repTitle": "contactTitle",
}


def normalize(s):
    """Strip accents + lower + remove corporate prefixes for fuzzy match."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    for prefix in [
        "cong ty co phan",
        "cong ty tnhh",
        "cong ty tnhh mtv",
        "cong ty",
        "ctcp",
        "ctkk",
    ]:
        if s.startswith(prefix):
            s = s[len(prefix):].strip()
    return s


def load_ocr_records():
    if not OCR_FILE.exists():
        print(f"❌ OCR file not found: {OCR_FILE}", file=sys.stderr)
        sys.exit(1)
    records = []
    with open(OCR_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB writes")
    parser.add_argument("--apply", action="store_true", help="Apply changes to DB")
    parser.add_argument("--fuzzy-cutoff", type=int, default=FUZZY_CUTOFF)
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        print("Specify --dry-run or --apply", file=sys.stderr)
        sys.exit(1)

    mode = "DRY RUN" if args.dry_run else "APPLY"
    ts = datetime.utcnow().isoformat()
    print(f"[{ts}] vendor_enrich_from_ocr — {mode}")
    print(f"  OCR file: {OCR_FILE}")
    print(f"  Fuzzy cutoff: {args.fuzzy_cutoff}")

    ocr_records = load_ocr_records()
    print(f"  Loaded {len(ocr_records)} OCR records")

    conn = psycopg2.connect(DSN)
    conn.set_client_encoding("UTF8")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute('SELECT id, name, "taxCode", address FROM "Vendor"')
    db_vendors = [dict(r) for r in cur.fetchall()]
    print(f"  DB has {len(db_vendors)} vendors")

    # Index by taxCode + normalized name
    db_by_tax = {v["taxCode"]: v for v in db_vendors if v.get("taxCode")}
    db_by_norm_name = {normalize(v["name"]): v for v in db_vendors}
    db_norm_names = list(db_by_norm_name.keys())

    stats = {
        "tax_match": 0,
        "fuzzy_match": 0,
        "no_match_insert": 0,
        "skipped_no_data": 0,
        "updates": [],
        "inserts": [],
    }

    for ocr in ocr_records:
        ocr_tax = ocr.get("taxCode")
        ocr_name = ocr.get("name", "").strip()

        if not ocr_name and not ocr_tax:
            stats["skipped_no_data"] += 1
            continue

        match = None
        match_method = None

        # Pass 1: tax strict
        if ocr_tax and ocr_tax in db_by_tax:
            match = db_by_tax[ocr_tax]
            match_method = "tax_code"
            stats["tax_match"] += 1
        else:
            # Pass 2: fuzzy name
            if ocr_name:
                norm = normalize(ocr_name)
                if norm:
                    result = process.extractOne(
                        norm,
                        db_norm_names,
                        scorer=fuzz.token_set_ratio,
                        score_cutoff=args.fuzzy_cutoff,
                    )
                    if result:
                        matched_norm, score, _ = result
                        match = db_by_norm_name[matched_norm]
                        match_method = f"fuzzy_name@{int(score)}"
                        stats["fuzzy_match"] += 1

        if match:
            # Build UPDATE set with NULL-coalesce (only fill where DB is null)
            updates = {}
            for ocr_field, db_field in FIELD_MAP.items():
                v = ocr.get(ocr_field)
                if v and not match.get(db_field):
                    updates[db_field] = v
            # Always overwrite taxCode if DB null and OCR has tax (high confidence)
            if ocr_tax and not match.get("taxCode"):
                updates["taxCode"] = ocr_tax

            if updates and args.apply:
                set_cols = [f'"{k}" = %s' for k in updates.keys()]
                values = list(updates.values()) + [match["id"]]
                cur.execute(
                    f'UPDATE "Vendor" SET {", ".join(set_cols)}, "updatedAt" = NOW() WHERE id = %s',
                    values,
                )

            stats["updates"].append({
                "db_id": match["id"],
                "db_name": match["name"],
                "ocr_name": ocr_name,
                "match_method": match_method,
                "fields_updated": list(updates.keys()),
                "n_fields": len(updates),
            })
        else:
            # No match → insert (only if has tax to avoid duplicates)
            if ocr_tax and ocr_name and args.apply:
                # Prisma uuid default doesn't apply at SQL level — generate client-side
                cur.execute(
                    '''INSERT INTO "Vendor" (id, name, "taxCode", "shortName", address, city, country,
                                              "vendorType", bank, "accountNo", "contactName", "contactTitle",
                                              status, "createdAt", "updatedAt")
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                       ON CONFLICT (name) DO NOTHING''',
                    (
                        str(uuid.uuid4()),
                        ocr_name,
                        ocr_tax,
                        ocr.get("shortName"),
                        ocr.get("address"),
                        ocr.get("city"),
                        ocr.get("country", "Việt Nam"),
                        ocr.get("vendorType", "DOMESTIC"),
                        ocr.get("bank"),
                        ocr.get("accountNo"),
                        ocr.get("repName"),
                        ocr.get("repTitle"),
                        "ACTIVE",
                    ),
                )
            stats["no_match_insert"] += 1
            stats["inserts"].append({"ocr_name": ocr_name, "ocr_tax": ocr_tax})

    if args.apply:
        conn.commit()
        print("✅ Committed")
    else:
        conn.rollback()
        print("📝 DRY RUN — rolled back")

    # Report
    print()
    print("=" * 60)
    print(f"  taxCode strict matches:  {stats['tax_match']}")
    print(f"  fuzzy name matches:      {stats['fuzzy_match']}")
    print(f"  no match (insert new):   {stats['no_match_insert']}")
    print(f"  skipped (no data):       {stats['skipped_no_data']}")
    print(f"  Total OCR records:       {len(ocr_records)}")
    print()
    n_with_updates = sum(1 for u in stats["updates"] if u["n_fields"] > 0)
    print(f"  Vendors w/ actual update: {n_with_updates}")
    fields_distribution = {}
    for u in stats["updates"]:
        for f in u["fields_updated"]:
            fields_distribution[f] = fields_distribution.get(f, 0) + 1
    print(f"  Fields enriched (top):")
    for f, n in sorted(fields_distribution.items(), key=lambda x: -x[1]):
        print(f"    - {f}: +{n}")

    # Write report
    report_path = EXPORT_DIR / f"vendor_enrich_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{mode.replace(' ', '_')}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "mode": mode,
            "timestamp": ts,
            "ocr_file": str(OCR_FILE),
            "fuzzy_cutoff": args.fuzzy_cutoff,
            "stats": {
                "tax_match": stats["tax_match"],
                "fuzzy_match": stats["fuzzy_match"],
                "no_match_insert": stats["no_match_insert"],
                "skipped_no_data": stats["skipped_no_data"],
                "vendors_with_actual_update": n_with_updates,
                "fields_distribution": fields_distribution,
            },
            "samples_updated": stats["updates"][:20],
            "samples_inserted": stats["inserts"][:20],
        }, f, ensure_ascii=False, indent=2)
    print(f"\nReport: {report_path}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
