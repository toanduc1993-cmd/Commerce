#!/usr/bin/env python3
"""
bid_offer_claude_read_consume.py — B-CPVT-015

Consume OCRP claude_read_priority.ndjson → upsert BidQuoteVendor + BidQuoteOffer
với qualitySource="CLAUDE_READ" (replacing/augmenting EXCEL_SCRAPE).

Match strategy:
  1. Map OCR record → CPVT BidAnalysis qua _meta.source_top30_rank
     (top30_bid_priority_v1.1.json → bidId)
  2. Skip records không match (legacy/orphan)

Per matched BidAnalysis, for each OCR vendor:
  - Find or CREATE BidQuoteVendor by (bidId, vendorName fuzzy 90)
  - Upsert BidQuoteOffer by (itemId, vendorId), qualitySource=CLAUDE_READ

Usage:
  python3.11 scripts/bid_offer_claude_read_consume.py --dry-run
  python3.11 scripts/bid_offer_claude_read_consume.py --apply
"""
import argparse, json, os, sys, uuid
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras
from rapidfuzz import fuzz, process

sys.path.insert(0, str(Path(__file__).parent.resolve()))
from item_name_normalizer import item_match_score  # B-CPVT-019

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
OCR_FILE = PROJECT_ROOT.parent / "IBSHI/mua-hang/02.CONG-CU/ibs-ocr/data/bulk_results/claude_read_priority.ndjson"
TOP30_FILE = PROJECT_ROOT / "exports/top30_bid_priority_v1.1.json"
EXPORT_DIR = PROJECT_ROOT / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

DSN = os.environ.get(
    "VATTU_DSN",
    "postgresql://vpi_user:VpiProcurement2026%21@127.0.0.1:54321/vpi_procurement",
)

FUZZY_CUTOFF = 80


def normalize_name(s):
    if not s:
        return ""
    return s.lower().strip().replace("công ty ", "").replace("tnhh ", "").replace("cp ", "")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not (args.dry_run or args.apply):
        print("Need --dry-run or --apply", file=sys.stderr)
        sys.exit(1)

    mode = "DRY RUN" if args.dry_run else "APPLY"
    ts = datetime.utcnow().isoformat()
    print(f"[{ts}] B-CPVT-015 claude-read-consume — {mode}")
    print(f"  OCR file: {OCR_FILE}")
    print(f"  Top30 map: {TOP30_FILE}")

    if not OCR_FILE.exists() or not TOP30_FILE.exists():
        print("❌ Missing source file(s)", file=sys.stderr)
        sys.exit(1)

    # Load top30 → rank → bidId map
    with open(TOP30_FILE, "r", encoding="utf-8") as f:
        top30 = json.load(f)
    rank_to_bidId = {r["rank"]: r["bidId"] for r in top30["queue"]}
    print(f"  Top30 ranks: {len(rank_to_bidId)}")

    # Load OCR records
    records = []
    with open(OCR_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    print(f"  OCR records: {len(records)}")

    conn = psycopg2.connect(DSN)
    conn.set_client_encoding("UTF8")
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    stats = {
        "ocr_records": len(records),
        "skipped_no_rank": 0,
        "skipped_no_bid": 0,
        "skipped_not_msdt": 0,
        "skipped_no_matrix": 0,
        "matched_bids": 0,
        "vendors_created": 0,
        "vendors_matched": 0,
        "offers_created": 0,
        "offers_updated": 0,
        "items_matched": 0,
        "items_unmatched": 0,
    }
    samples = []

    for rec in records:
        ext = rec.get("result", {}).get("extracted_platform_v1", {})
        doc_class = (ext.get("doc_class") or {}).get("primary")
        if doc_class != "msdt_bid":
            stats["skipped_not_msdt"] += 1
            continue

        meta = ext.get("_meta", {})
        top30_rank = meta.get("source_top30_rank")
        if not top30_rank:
            stats["skipped_no_rank"] += 1
            continue

        bid_id = rank_to_bidId.get(top30_rank)
        if not bid_id:
            stats["skipped_no_bid"] += 1
            continue

        bm = ext.get("bid_matrix") or {}
        if not bm.get("vendors") or not bm.get("offers"):
            stats["skipped_no_matrix"] += 1
            continue

        stats["matched_bids"] += 1

        # Get CPVT BidAnalysis items
        cur.execute(
            'SELECT id, "itemCode", "itemName", "profile", "itemOrder" FROM "BidQuoteItem" WHERE "bidId" = %s ORDER BY "itemOrder"',
            (bid_id,),
        )
        cpvt_items = list(cur.fetchall())
        # OCR items[] → match by code/name fuzzy to CPVT, build order→id map
        ocr_items = bm.get("items") or []
        ocr_order_to_cpvt_iid = {}
        for ocr_it in ocr_items:
            ocr_order = ocr_it.get("order")
            if ocr_order is None:
                continue
            ocr_code = (ocr_it.get("code") or "").strip()
            ocr_name = normalize_name(ocr_it.get("name") or "")
            # Try exact itemCode match first
            cpvt_iid = None
            for cpvt_it in cpvt_items:
                if ocr_code and (cpvt_it.get("itemCode") or "").strip() == ocr_code:
                    cpvt_iid = cpvt_it["id"]
                    break
            if not cpvt_iid:
                # B-CPVT-019: take max(legacy token_set, numeric+grade aware combined)
                ocr_raw = ocr_it.get("name") or ""
                best_score = 0
                for cpvt_it in cpvt_items:
                    cpvt_raw = cpvt_it.get("itemName") or ""
                    if not cpvt_raw:
                        continue
                    combined = item_match_score(ocr_raw, cpvt_raw)
                    legacy = fuzz.token_set_ratio(
                        normalize_name(ocr_raw), normalize_name(cpvt_raw)
                    )
                    score = max(combined, legacy)
                    if score >= 65 and score > best_score:
                        best_score = score
                        cpvt_iid = cpvt_it["id"]
            if cpvt_iid:
                ocr_order_to_cpvt_iid[ocr_order] = cpvt_iid

        # Map OCR vendor name → CPVT vendor id (find or create)
        cur.execute(
            'SELECT id, "vendorName" FROM "BidQuoteVendor" WHERE "bidId" = %s',
            (bid_id,),
        )
        cpvt_vendors = list(cur.fetchall())
        cpvt_vendor_norm = {normalize_name(v["vendorName"]): v["id"] for v in cpvt_vendors}

        # Map vendor_order → CPVT vendor id (OCRP schema: offers use vendor_order, not name)
        ocr_vendor_to_cpvt = {}
        ocr_order_to_cpvt_vid = {}
        for ov in bm["vendors"]:
            ov_name = ov.get("name", "")
            ov_order = ov.get("order")
            ov_norm = normalize_name(ov_name)
            cpvt_vid = None
            # Try exact normalized match
            if ov_norm in cpvt_vendor_norm:
                cpvt_vid = cpvt_vendor_norm[ov_norm]
                stats["vendors_matched"] += 1
            else:
                # Try fuzzy
                if cpvt_vendor_norm:
                    cand = process.extractOne(
                        ov_norm, list(cpvt_vendor_norm.keys()),
                        scorer=fuzz.token_set_ratio, score_cutoff=FUZZY_CUTOFF,
                    )
                    if cand:
                        cpvt_vid = cpvt_vendor_norm[cand[0]]
                        stats["vendors_matched"] += 1
                if not cpvt_vid:
                    # Create new BidQuoteVendor
                    if args.apply:
                        new_vid = str(uuid.uuid4())
                        cur.execute(
                            '''INSERT INTO "BidQuoteVendor" (id, "bidId", "vendorName", "vendorOrder",
                                                              "vendorType", currency, "totalQuote", "isWinner")
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)''',
                            (
                                new_vid, bid_id, ov_name, ov.get("rank", 99) or 99,
                                "DOMESTIC", ov.get("currency", "VND"),
                                ov.get("total_quote_no_vat", 0) or 0,
                                bool(ov.get("is_winner")),
                            ),
                        )
                        cpvt_vid = new_vid
                    else:
                        cpvt_vid = "DRY-" + str(uuid.uuid4())[:8]
                    stats["vendors_created"] += 1
            ocr_vendor_to_cpvt[ov_name] = cpvt_vid
            if ov_order is not None:
                ocr_order_to_cpvt_vid[ov_order] = cpvt_vid

        # Process offers (OCRP schema: item_order + vendor_order indexes into vendors[]/items[])
        for off in bm["offers"]:
            # Vendor: try by name (legacy) or vendor_order (new)
            ocr_vendor_label = off.get("vendor") or off.get("vendor_name")
            ocr_vendor_order = off.get("vendor_order")
            cpvt_vid = None
            if ocr_vendor_label:
                cpvt_vid = ocr_vendor_to_cpvt.get(ocr_vendor_label)
            if not cpvt_vid and ocr_vendor_order is not None:
                cpvt_vid = ocr_order_to_cpvt_vid.get(ocr_vendor_order)
            if not cpvt_vid:
                continue

            # Item: match via item_order
            ocr_item_order = off.get("item_order")
            cpvt_iid = ocr_order_to_cpvt_iid.get(ocr_item_order) if ocr_item_order is not None else None

            if not cpvt_iid:
                stats["items_unmatched"] += 1
                continue
            stats["items_matched"] += 1

            unit_price = (
                off.get("unit_price")
                or off.get("unit_price_no_vat")
                or 0
            )
            total_price = (
                off.get("total")
                or off.get("total_price")
                or off.get("total_no_vat")
                or 0
            )
            scope = off.get("scope", "V")

            if args.apply:
                # Upsert by (itemId, vendorId)
                # Skip if DRY vendor
                if cpvt_vid.startswith("DRY-"):
                    continue
                cur.execute(
                    'SELECT id FROM "BidQuoteOffer" WHERE "itemId" = %s AND "vendorId" = %s',
                    (cpvt_iid, cpvt_vid),
                )
                existing = cur.fetchone()
                if existing:
                    cur.execute(
                        '''UPDATE "BidQuoteOffer"
                           SET "unitPrice" = %s, "totalPrice" = %s, scope = %s,
                               "qualitySource" = 'CLAUDE_READ'
                           WHERE id = %s''',
                        (unit_price, total_price, scope, existing["id"]),
                    )
                    stats["offers_updated"] += 1
                else:
                    cur.execute(
                        '''INSERT INTO "BidQuoteOffer" (id, "itemId", "vendorId", scope,
                                                        "unitPrice", "totalPrice", "qualitySource")
                           VALUES (%s, %s, %s, %s, %s, %s, 'CLAUDE_READ')''',
                        (str(uuid.uuid4()), cpvt_iid, cpvt_vid, scope, unit_price, total_price),
                    )
                    stats["offers_created"] += 1
            else:
                stats["offers_created"] += 1  # would-create count

        if len(samples) < 5:
            samples.append({
                "bidId": bid_id[:8], "top30_rank": top30_rank,
                "ocr_id": meta.get("record_id"),
                "vendors": len(bm["vendors"]),
                "items": len(bm.get("items", [])),
                "offers": len(bm.get("offers", [])),
            })

    if args.apply:
        conn.commit()
        print("✅ COMMITTED")
    else:
        conn.rollback()
        print("📝 DRY RUN — rolled back")

    print()
    print("=" * 60)
    for k, v in stats.items():
        print(f"  {k:25} {v}")
    print(f"\nSample matched BIDs:")
    for s in samples:
        print(f"  bid={s['bidId']} rank=#{s['top30_rank']} ocr={s['ocr_id']} "
              f"({s['vendors']}v × {s['items']}i = {s['offers']} offers)")

    report_path = EXPORT_DIR / f"bid_offer_claude_read_consume_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{mode.replace(' ','_')}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({"mode": mode, "stats": stats, "samples": samples},
                  f, ensure_ascii=False, indent=2)
    print(f"\nReport: {report_path}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
