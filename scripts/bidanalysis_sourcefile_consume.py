#!/usr/bin/env python3
"""
bidanalysis_sourcefile_consume.py — B-CPVT-017
Consume OCRP bidcode_to_pdf_map_v1.ndjson → populate BidAnalysis.sourceFileName/Path

Strategy:
  - confidence=high → auto-apply (CPVT default)
  - confidence=medium → apply (CPVT default), flag in audit log
  - confidence=low → SKIP by default (need --min-confidence low to apply)

Usage:
  python3.11 scripts/bidanalysis_sourcefile_consume.py --dry-run
  python3.11 scripts/bidanalysis_sourcefile_consume.py --apply --min-confidence medium
"""
import argparse, json, os, sys
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
OCR_FILE = PROJECT_ROOT.parent / "IBSHI/mua-hang/_index/bidcode_to_pdf_map_v1.ndjson"
EXPORT_DIR = PROJECT_ROOT / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

DSN = os.environ.get(
    "VATTU_DSN",
    "postgresql://vpi_user:VpiProcurement2026%21@127.0.0.1:54321/vpi_procurement",
)

CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--min-confidence", choices=["high", "medium", "low"], default="medium",
        help="Minimum confidence to auto-apply (default: medium)",
    )
    args = parser.parse_args()
    if not (args.dry_run or args.apply):
        print("Need --dry-run or --apply", file=sys.stderr)
        sys.exit(1)

    mode = "DRY RUN" if args.dry_run else "APPLY"
    min_rank = CONFIDENCE_RANK[args.min_confidence]
    ts = datetime.utcnow().isoformat()
    print(f"[{ts}] B-CPVT-017 sourcefile-consume — {mode} (min-confidence={args.min_confidence})")
    print(f"  Source: {OCR_FILE}")

    if not OCR_FILE.exists():
        print(f"❌ Not found: {OCR_FILE}", file=sys.stderr)
        sys.exit(1)

    records = []
    with open(OCR_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    print(f"  Loaded {len(records)} records from map")

    conn = psycopg2.connect(DSN)
    conn.set_client_encoding("UTF8")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    stats = {"high": 0, "medium": 0, "low": 0, "skipped_threshold": 0,
             "applied": 0, "skipped_already_set": 0, "missing_bid": 0}
    samples = []

    for rec in records:
        conf = rec.get("confidence", "low")
        stats[conf] = stats.get(conf, 0) + 1
        rank = CONFIDENCE_RANK.get(conf, 0)

        if rank < min_rank:
            stats["skipped_threshold"] += 1
            continue

        cur.execute(
            'SELECT id, "sourceFileName", "sourceFilePath" FROM "BidAnalysis" WHERE id = %s',
            (rec["bidId"],),
        )
        existing = cur.fetchone()
        if not existing:
            stats["missing_bid"] += 1
            continue

        if existing.get("sourceFileName") and existing.get("sourceFilePath"):
            stats["skipped_already_set"] += 1
            continue

        if args.apply:
            cur.execute(
                '''UPDATE "BidAnalysis"
                   SET "sourceFileName" = %s, "sourceFilePath" = %s, "updatedAt" = NOW()
                   WHERE id = %s''',
                (rec["primary_pdf_name"], rec["primary_pdf_relpath"], rec["bidId"]),
            )
        stats["applied"] += 1
        if len(samples) < 10:
            samples.append({
                "bidId": rec["bidId"][:8],
                "bidCode": rec.get("bidCode"),
                "confidence": conf,
                "pdf": rec["primary_pdf_name"][:60],
            })

    if args.apply:
        conn.commit()
        print("✅ COMMITTED")
    else:
        conn.rollback()
        print("📝 DRY RUN — rolled back")

    print()
    print("=" * 60)
    print(f"  Records: high={stats['high']} medium={stats['medium']} low={stats['low']}")
    print(f"  Applied:                {stats['applied']}")
    print(f"  Skipped (threshold):    {stats['skipped_threshold']}")
    print(f"  Skipped (already set):  {stats['skipped_already_set']}")
    print(f"  Missing in DB:          {stats['missing_bid']}")
    if samples:
        print(f"\nSample applied:")
        for s in samples:
            print(f"  [{s['confidence']:6}] {s['bidId']} | {s['bidCode']!r:35} → {s['pdf']}")

    report_path = EXPORT_DIR / f"sourcefile_consume_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{mode.replace(' ','_')}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({"mode": mode, "min_confidence": args.min_confidence,
                   "stats": stats, "samples": samples}, f, ensure_ascii=False, indent=2)
    print(f"\nReport: {report_path}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
