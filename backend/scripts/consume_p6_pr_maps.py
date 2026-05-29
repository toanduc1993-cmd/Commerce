"""
consume_p6_pr_maps.py — Consume OCRP P6 deliverables (TIER 1)

Apply 2 PR-level mapping files vào DB:
  - pr_urgency_map_v1.ndjson (19 records, schema: so_pr → urgency)
  - pr_required_date_map_v1.ndjson (40 records, schema: so_pr → required_date dd/MM/yyyy)

Match key: so_pr ↔ PurchaseRequisition.prRef
Effect:   UPDATE PrDetail SET urgency/requiredDate WHERE prId = matched PR

Usage:
  python3 consume_p6_pr_maps.py --dry-run --map=urgency
  python3 consume_p6_pr_maps.py --dry-run --map=required_date
  python3 consume_p6_pr_maps.py --apply  --map=urgency
  python3 consume_p6_pr_maps.py --apply  --map=required_date
  python3 consume_p6_pr_maps.py --apply  --map=both
"""
import argparse
import json
import sys
import uuid
from datetime import datetime
from pathlib import Path

import psycopg2

VAULT_INDEX = Path("/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI/mua-hang/_index")
DB_CONN = "host=127.0.0.1 port=54321 user=vpi_user password=VpiProcurement2026! dbname=vpi_procurement"

URGENCY_FILE = VAULT_INDEX / "pr_urgency_map_v1.ndjson"
REQUIRED_DATE_FILE = VAULT_INDEX / "pr_required_date_map_v1.ndjson"


def parse_date_ddmmyyyy(s):
    """Parse 'dd/MM/yyyy' → datetime. Returns None if invalid."""
    if not s:
        return None
    try:
        return datetime.strptime(s.strip(), "%d/%m/%Y")
    except (ValueError, AttributeError):
        return None


def load_ndjson(path):
    rows = []
    if not path.exists():
        return rows
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"  ⚠️  Skip malformed line: {e}", file=sys.stderr)
    return rows


def consume_urgency(cur, dry_run):
    rows = load_ndjson(URGENCY_FILE)
    print(f"\n=== URGENCY MAP — {len(rows)} records ===")
    stats = {"matched": 0, "not_found": 0, "skipped_low_conf": 0, "items_updated": 0}

    for r in rows:
        so_pr = r.get("so_pr")
        urgency = r.get("urgency")
        conf = r.get("confidence", "medium")
        if conf == "low":
            stats["skipped_low_conf"] += 1
            continue
        if not so_pr or not urgency:
            continue

        cur.execute('SELECT id FROM "PurchaseRequisition" WHERE "prRef"=%s', (so_pr,))
        prow = cur.fetchone()
        if not prow:
            stats["not_found"] += 1
            print(f"  ⚠️  PR not found: {so_pr}")
            continue

        pr_id = prow[0]
        cur.execute('SELECT COUNT(*) FROM "PrDetail" WHERE "prId"=%s', (pr_id,))
        n = cur.fetchone()[0]
        if not dry_run:
            cur.execute(
                'UPDATE "PrDetail" SET urgency=%s, "updatedAt"=NOW() WHERE "prId"=%s AND urgency != %s',
                (urgency, pr_id, urgency),
            )
        stats["matched"] += 1
        stats["items_updated"] += n
        print(f"  ✓ {so_pr} → urgency={urgency} ({n} items)")

    print(f"\nSummary URGENCY: matched={stats['matched']}, not_found={stats['not_found']}, skipped_low={stats['skipped_low_conf']}, items_updated={stats['items_updated']}")
    return stats


def consume_required_date(cur, dry_run):
    rows = load_ndjson(REQUIRED_DATE_FILE)
    print(f"\n=== REQUIRED_DATE MAP — {len(rows)} records ===")
    stats = {"matched": 0, "not_found": 0, "skipped_invalid_date": 0, "items_updated": 0}

    for r in rows:
        so_pr = r.get("so_pr")
        date_str = r.get("required_date")
        conf = r.get("confidence", "medium")
        if conf == "low":
            continue
        d = parse_date_ddmmyyyy(date_str)
        if not d:
            stats["skipped_invalid_date"] += 1
            print(f"  ⚠️  Invalid date for {so_pr}: '{date_str}'")
            continue

        cur.execute('SELECT id FROM "PurchaseRequisition" WHERE "prRef"=%s', (so_pr,))
        prow = cur.fetchone()
        if not prow:
            stats["not_found"] += 1
            continue

        pr_id = prow[0]
        cur.execute('SELECT COUNT(*) FROM "PrDetail" WHERE "prId"=%s', (pr_id,))
        n = cur.fetchone()[0]
        if not dry_run:
            cur.execute(
                'UPDATE "PrDetail" SET "requiredDate"=%s, "updatedAt"=NOW() WHERE "prId"=%s',
                (d, pr_id),
            )
        stats["matched"] += 1
        stats["items_updated"] += n
        print(f"  ✓ {so_pr} → requiredDate={d.strftime('%Y-%m-%d')} ({n} items)")

    print(f"\nSummary REQUIRED_DATE: matched={stats['matched']}, not_found={stats['not_found']}, invalid={stats['skipped_invalid_date']}, items_updated={stats['items_updated']}")
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--map", choices=["urgency", "required_date", "both"], default="both")
    args = ap.parse_args()
    if not args.dry_run and not args.apply:
        ap.error("Cần --dry-run hoặc --apply")

    print(f"[{datetime.now().isoformat()}] Consume OCRP P6 PR maps — {'DRY RUN' if args.dry_run else 'APPLY'}")

    conn = psycopg2.connect(DB_CONN)
    conn.set_client_encoding("UTF8")
    conn.autocommit = False
    cur = conn.cursor()

    try:
        all_stats = {}
        if args.map in ("urgency", "both"):
            all_stats["urgency"] = consume_urgency(cur, args.dry_run)
        if args.map in ("required_date", "both"):
            all_stats["required_date"] = consume_required_date(cur, args.dry_run)

        if args.apply:
            # Audit log
            cur.execute(
                'INSERT INTO "AuditLog" (id, action, "entityType", "entityId", details, "createdAt") VALUES (%s, %s, %s, %s, %s, NOW())',
                (
                    str(uuid.uuid4()),
                    "CONSUME_OCRP_P6_PR_MAPS",
                    "PrDetail",
                    "BULK",
                    json.dumps({"source": "OCRP P6 deliverables", "maps": args.map, "stats": all_stats}),
                ),
            )
            conn.commit()
            print("\n✅ COMMIT done")
        else:
            print("\n  DRY RUN — không ghi DB")
    except Exception as e:
        conn.rollback()
        print(f"\n❌ ROLLBACK: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
