#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# IBS Procurement — UAT Smoke Test
# Kiểm tra tất cả endpoint chính trả HTTP 200 + dữ liệu hợp lệ.
#
# Usage:
#   BASE_URL=http://localhost:5005 USERNAME=hungth PASSWORD=123456 ./smoke_test.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
BASE_URL="${BASE_URL:-http://localhost:5005}"
USERNAME="${USERNAME:-hungth}"
PASSWORD="${PASSWORD:-123456}"

# Colors
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; NC='\033[0m'

pass=0; fail=0

check() {
  local name="$1" url="$2" expected="${3:-200}" extra_headers="${4:-}"
  local code
  code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" $extra_headers \
    "$BASE_URL$url")
  if [ "$code" = "$expected" ]; then
    local size
    size=$(wc -c < /tmp/smoke_resp.json | tr -d ' ')
    printf "${G}✅${NC} %-45s %3s  %8s bytes\n" "$name" "$code" "$size"
    pass=$((pass+1))
  else
    printf "${R}❌${NC} %-45s %3s  (expected %s)\n" "$name" "$code" "$expected"
    cat /tmp/smoke_resp.json | head -c 200
    echo ""
    fail=$((fail+1))
  fi
}

echo "═══════════════════════════════════════════════════════════"
echo "  IBS Procurement — Smoke Test"
echo "  Target: $BASE_URL"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── 1. Health ──────────────────────────────────────────────────────
echo "▶ 1. Health & Auth"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$code" = "200" ]; then
  printf "${G}✅${NC} %-45s %3s\n" "/health" "$code"; pass=$((pass+1))
else
  printf "${R}❌${NC} %-45s %3s\n" "/health" "$code"; fail=$((fail+1))
fi

# Login
TOKEN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
if [ -z "$TOKEN" ]; then
  echo -e "${R}❌ Login failed — cannot continue${NC}"; exit 1
fi
printf "${G}✅${NC} %-45s %3s\n" "POST /auth/login" "200"
pass=$((pass+1))

check "GET /auth/me" "/api/v1/auth/me"

# Wrong password → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" -d "{\"username\":\"$USERNAME\",\"password\":\"WRONG\"}")
if [ "$code" = "401" ] || [ "$code" = "429" ]; then
  printf "${G}✅${NC} %-45s %3s  (wrong pw rejected)\n" "POST /auth/login (wrong)" "$code"
  pass=$((pass+1))
else
  printf "${R}❌${NC} %-45s %3s  (expected 401/429)\n" "POST /auth/login (wrong)" "$code"
  fail=$((fail+1))
fi

echo ""
echo "▶ 2. Dashboard & Lists"
check "GET /dashboard/stats" "/api/v1/dashboard/stats"
check "GET /projects" "/api/v1/projects"
check "GET /prs" "/api/v1/prs"
check "GET /material-catalog" "/api/v1/material-catalog"

echo ""
echo "▶ 3. Module 4 - Hợp đồng"
check "GET /contracts" "/api/v1/contracts"

echo ""
echo "▶ 4. Module 2/3 - Báo giá & So sánh"
check "GET /bid-analyses" "/api/v1/bid-analyses"

echo ""
echo "▶ 5. Module 5 - Thanh toán"
check "GET /payment-schedules" "/api/v1/payment-schedules"

echo ""
echo "▶ 6. Module 6 - Vendor Master"
check "GET /vendor-master" "/api/v1/vendor-master"
check "GET /vendor-master?type=IMPORT" "/api/v1/vendor-master?type=IMPORT"
check "GET /vendor-master?search=Hùng" "/api/v1/vendor-master?search=H%C3%B9ng"

echo ""
echo "▶ 7. Module 7 - Arrivals & QC"
check "GET /arrivals" "/api/v1/arrivals"
check "GET /arrivals/stats" "/api/v1/arrivals/stats"
check "GET /arrivals?qc=PENDING" "/api/v1/arrivals?qc=PENDING"

echo ""
echo "▶ 8. 404 & Rate limit"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/nonexistent" \
  -H "Authorization: Bearer $TOKEN")
if [ "$code" = "404" ]; then
  printf "${G}✅${NC} %-45s %3s\n" "GET /nonexistent → 404" "$code"; pass=$((pass+1))
else
  printf "${R}❌${NC} %-45s %3s\n" "GET /nonexistent → 404" "$code"; fail=$((fail+1))
fi

# Unauthorized → 401
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/projects")
if [ "$code" = "401" ]; then
  printf "${G}✅${NC} %-45s %3s  (no token rejected)\n" "GET /projects (no token)" "$code"
  pass=$((pass+1))
else
  printf "${R}❌${NC} %-45s %3s  (expected 401)\n" "GET /projects (no token)" "$code"
  fail=$((fail+1))
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
printf "  ${G}PASS: %d${NC}   ${R}FAIL: %d${NC}\n" "$pass" "$fail"
echo "═══════════════════════════════════════════════════════════"
[ "$fail" -eq 0 ] || exit 1
