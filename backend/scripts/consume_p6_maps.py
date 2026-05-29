"""
consume_p6_maps.py — Consume 3 OCRP P6 deliverables vào DB.

Maps:
  vendor_master_v1.2  → UPDATE Vendor.country + Vendor.countryConfidence
  material_subgroup   → UPDATE Material.materialSubGroupCode (high conf only)
  unit_weight_derived → UPDATE Material.unitWeight WHERE null + validate ±10%

Usage:
  python3 consume_p6_maps.py --dry-run --map=vendor
  python3 consume_p6_maps.py --dry-run --map=subgroup
  python3 consume_p6_maps.py --dry-run --map=weight
  python3 consume_p6_maps.py --apply --map=all
"""
import argparse, json, sys, uuid
from datetime import datetime
from pathlib import Path
import psycopg2

VAULT_INDEX = Path("/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI/mua-hang/_index")
BULK_RESULTS = Path("/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI/mua-hang/02.CONG-CU/ibs-ocr/data/bulk_results")
DB_CONN = "host=127.0.0.1 port=54321 user=vpi_user password=VpiProcurement2026! dbname=vpi_procurement"

VENDOR_FILE   = BULK_RESULTS / "vendor_master_v1.2.ndjson"
SUBGROUP_FILE = VAULT_INDEX  / "material_subgroup_map_v1.ndjson"
WEIGHT_FILE   = VAULT_INDEX  / "unit_weight_derived_v1.ndjson"

VENDOR_SHA256 = "96c137af6a3836f9c12edb12d6d4cb8864561527c73336ea96a272f169a432da"


def sha256_file(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_ndjson(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"  ⚠️  Skip: {e}", file=sys.stderr)
    return rows


# ─── vendor_master_v1.2 ──────────────────────────────────────────────────────

def consume_vendor(cur, dry_run):
    actual = sha256_file(VENDOR_FILE)
    if actual != VENDOR_SHA256:
        raise RuntimeError(f"SHA256 mismatch vendor_master_v1.2: {actual}")
    print(f"vendor_master_v1.2 SHA256 ✓")

    rows = load_ndjson(VENDOR_FILE)
    print(f"\n=== VENDOR COUNTRY MAP — {len(rows)} records ===")
    stats = {"matched": 0, "not_found": 0, "updated": 0, "skipped_low_conf": 0}

    for r in rows:
        name = r.get("name_normalized", "")
        country = r.get("country")
        conf = r.get("country_confidence", "low")
        if not country or conf == "low":
            stats["skipped_low_conf"] += 1
            continue

        cur.execute('SELECT id, country FROM "Vendor" WHERE name = %s', (name,))
        rows_db = cur.fetchall()
        if not rows_db:
            # Try case-insensitive
            cur.execute('SELECT id, country FROM "Vendor" WHERE LOWER(name) = LOWER(%s)', (name,))
            rows_db = cur.fetchall()
        if not rows_db:
            stats["not_found"] += 1
            continue

        for vid, existing_country in rows_db:
            if existing_country == country:
                stats["matched"] += 1
                continue
            if not dry_run:
                cur.execute(
                    'UPDATE "Vendor" SET country = %s, "updatedAt" = NOW() WHERE id = %s',
                    (country, vid),
                )
            stats["updated"] += 1
            print(f"  ✓ {name}: country {existing_country!r} → {country} ({conf})")
        stats["matched"] += 1

    print(f"Summary VENDOR: matched={stats['matched']}, updated={stats['updated']}, not_found={stats['not_found']}, skipped_low={stats['skipped_low_conf']}")
    return stats


# ─── material_subgroup_map_v1 ─────────────────────────────────────────────────

VALID_SUBGROUP_CODES = {'VDK01','VDK02','VDK03','VPK01','VPK02','VTC01','VTC02','VTC03','VTC04','VTH01','VTH02','VTH03','VTS01','VTS02'}

def consume_subgroup(cur, dry_run):
    rows = load_ndjson(SUBGROUP_FILE)
    print(f"\n=== MATERIAL SUBGROUP MAP — {len(rows)} records ===")
    stats = {"applied": 0, "skipped_low_med": 0, "skipped_invalid_code": 0, "no_match": 0, "already_set": 0}

    for r in rows:
        conf = r.get("classifier_confidence", "low")
        if conf not in ("high",):
            stats["skipped_low_med"] += 1
            continue

        subgroup_code = r.get("subgroup_code")
        if not subgroup_code:
            continue
        if subgroup_code not in VALID_SUBGROUP_CODES:
            stats["skipped_invalid_code"] += 1
            continue

        # Match key: root = ten_vat_tu + profile + mac (lowercase pipe-joined)
        ten = (r.get("ten_vat_tu") or "").strip().lower()
        profile = (r.get("profile") or "").strip().lower()
        mac = (r.get("mac") or "").strip().lower()

        if not ten:
            continue

        # Try exact match on itemName + profile + grade
        cur.execute(
            '''SELECT id, "materialSubGroupCode" FROM "Material"
               WHERE LOWER("name") = %s
               AND LOWER(COALESCE(profile,'')) = %s
               AND LOWER(COALESCE(grade,'')) = %s
               AND ("materialSubGroupCode" IS NULL OR "materialSubGroupCode" != %s)''',
            (ten, profile, mac, subgroup_code),
        )
        to_update = cur.fetchall()

        if not to_update:
            stats["no_match"] += 1
            continue

        if not dry_run:
            ids = [row[0] for row in to_update]
            cur.execute(
                f'UPDATE "Material" SET "materialSubGroupCode" = %s, "updatedAt" = NOW() WHERE id = ANY(%s)',
                (subgroup_code, ids),
            )
        stats["applied"] += len(to_update)

    print(f"Summary SUBGROUP: applied={stats['applied']}, skipped_low_med={stats['skipped_low_med']}, skipped_invalid_code={stats['skipped_invalid_code']}, no_match={stats['no_match']}")
    return stats


# ─── unit_weight_derived_v1 ───────────────────────────────────────────────────

def consume_weight(cur, dry_run):
    rows = load_ndjson(WEIGHT_FILE)
    print(f"\n=== UNIT WEIGHT DERIVED — {len(rows)} records ===")
    stats = {"applied": 0, "skipped_low": 0, "no_null_match": 0, "mismatch_10pct": 0}

    for r in rows:
        conf = r.get("confidence", "low")
        if conf not in ("high", "medium"):
            stats["skipped_low"] += 1
            continue

        derived = r.get("derived_kg_per_unit")
        if not derived or float(derived) <= 0:
            continue

        ten = (r.get("ten_vat_tu") or "").strip().lower()
        profile = (r.get("profile") or "").strip().lower()

        if not ten:
            continue

        # Find materials where unitWeight is 0 or null
        cur.execute(
            '''SELECT id, "unitWeightAvg" FROM "Material"
               WHERE LOWER("name") = %s
               AND LOWER(COALESCE(profile,'')) = %s
               AND ("unitWeightAvg" = 0 OR "unitWeightAvg" IS NULL)''',
            (ten, profile),
        )
        null_rows = cur.fetchall()

        # Also find existing weight rows to validate ±10%
        cur.execute(
            '''SELECT id, "unitWeightAvg" FROM "Material"
               WHERE LOWER("name") = %s
               AND LOWER(COALESCE(profile,'')) = %s
               AND "unitWeightAvg" > 0''',
            (ten, profile),
        )
        existing_rows = cur.fetchall()
        for mid, existing_w in existing_rows:
            if existing_w and abs(existing_w - float(derived)) / existing_w > 0.10:
                stats["mismatch_10pct"] += 1

        if not null_rows:
            stats["no_null_match"] += 1
            continue

        if not dry_run:
            ids = [row[0] for row in null_rows]
            cur.execute(
                f'UPDATE "Material" SET "unitWeightAvg" = %s, "updatedAt" = NOW() WHERE id = ANY(%s)',
                (float(derived), ids),
            )
        stats["applied"] += len(null_rows)

    print(f"Summary WEIGHT: applied={stats['applied']}, skipped_low={stats['skipped_low']}, no_null_match={stats['no_null_match']}, mismatch_10pct_warning={stats['mismatch_10pct']}")
    return stats


# ─── main ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--map", choices=["vendor", "subgroup", "weight", "all"], default="all")
    args = ap.parse_args()
    if not args.dry_run and not args.apply:
        ap.error("Cần --dry-run hoặc --apply")

    print(f"[{datetime.now().isoformat()}] consume_p6_maps — {'DRY RUN' if args.dry_run else 'APPLY'} — map={args.map}")

    conn = psycopg2.connect(DB_CONN)
    conn.set_client_encoding("UTF8")
    conn.autocommit = False
    cur = conn.cursor()

    all_stats = {}
    try:
        if args.map in ("vendor", "all"):
            all_stats["vendor"] = consume_vendor(cur, args.dry_run)
        if args.map in ("subgroup", "all"):
            all_stats["subgroup"] = consume_subgroup(cur, args.dry_run)
        if args.map in ("weight", "all"):
            all_stats["weight"] = consume_weight(cur, args.dry_run)

        if args.apply:
            cur.execute(
                'INSERT INTO "AuditLog" (id, action, "entityType", "entityId", details, "createdAt") VALUES (%s,%s,%s,%s,%s,NOW())',
                (str(uuid.uuid4()), "CONSUME_OCRP_P6_MAPS", "Material", "BULK", json.dumps({"maps": args.map, "stats": all_stats})),
            )
            conn.commit()
            print("\n✅ COMMIT done")
        else:
            print("\nDRY RUN — không ghi DB")
    except Exception as e:
        conn.rollback()
        print(f"\n❌ ROLLBACK: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()

    return all_stats


if __name__ == "__main__":
    main()
