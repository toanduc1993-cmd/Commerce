"""
item_name_normalizer.py — B-CPVT-019

Normalize item names for fuzzy matching between OCR-extracted item labels
(PDF-style: "Thép tấm PL6 dày 6mm khổ 2000x12000mm SS400")
and CPVT DB item names (Excel-style: "PL6X2000X12000").

Combines:
- Vietnamese diacritic stripping
- Prefix/suffix noise removal (material type words, dimension descriptors)
- Separator normalization (X/x/×/* → x)
- Numeric dimension extraction (used as high-weight fingerprint)
- Combined match score: text token_set_ratio (40%) + numeric jaccard (60%)

Usage:
    from item_name_normalizer import item_match_score, normalize_item_name
    score = item_match_score("Thép tấm PL6 khổ 2000x12000", "PL6X2000X12000")
    # → ~85+ (strong match via numeric overlap)
"""
import re
import unicodedata

PREFIX_PATTERNS = [
    r'^thep\s+(goc|hinh|tam|hop|trang|den|ong|cay|cuon|tron|don|lop|day|ban|nan|nuoi|mai|son|i|h|u|v|l|c|chu)?\s*',
    r'^grating\s*',
    r'^plate\s*',
    r'^(pl|shs|rhs|chs|u|i|h)\s*(?=\d)',
    r'^bu\s+long\s*',
    r'^bolt\s*|^nut\s*|^washer\s*',
    r'^cung\s+cap\s+',
    r'^vat\s+tu\s+(chinh|phu)?\s*',
    r'^lo\s+xo\s*|^spring\s*',
    r'^ong\s+',
    r'^u-bolt\s*|^u\s+bolt\s*',
    r'^swagelok\s*',
    r'^male\s+conn\s*|^plug\s*',
]

NOISE_WORDS = [
    r'\bdai\b', r'\bday\b', r'\bkho\b',
    r'\bkhong\s+ran\s+cua\b', r'\bco\s+ran\s+cua\b',
    r'\bmua\s+theo\s+ban\s+ve\b', r'\bda\s+nang\b',
    r'\btieu\s+chuan\b', r'\bxuat\s+xu\b', r'\bnguon\b',
    r'\bcho\s+ong\b', r'\bcua\b',
    r'\bmm\b', r'\bcm\b', r'\bm\b(?!\d)',
]

GRADE_PRESERVE = re.compile(
    r'\b(ss400|q235b?|q345b?|q355b?|a36|astm\s*a?\d+(?:[a-z]\d*)?|sus\s*\d+|inox\s*\d+|f436|type\s*\d+ss|a193b\d+|a194-?\d+h?)\b',
    re.IGNORECASE,
)


def strip_diacritics(s: str) -> str:
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode('ascii')


def normalize_item_name(s: str):
    """Return (normalized_text, numeric_tokens_set, grade_tokens_set)."""
    if not s:
        return "", set(), set()
    text = strip_diacritics(s).lower().strip()
    grades = {m.group(0).replace(' ', '').lower() for m in GRADE_PRESERVE.finditer(text)}
    text_no_grade = GRADE_PRESERVE.sub(' ', text)
    for pat in PREFIX_PATTERNS:
        text_no_grade = re.sub(pat, '', text_no_grade)
    for pat in NOISE_WORDS:
        text_no_grade = re.sub(pat, ' ', text_no_grade)
    text_no_grade = re.sub(r'[*×]', 'x', text_no_grade)
    text_no_grade = re.sub(r'(\d)\s*x\s*(\d)', r'\1x\2', text_no_grade)
    text_no_grade = re.sub(r'[-_/]', ' ', text_no_grade)
    text_no_grade = re.sub(r'\s+', ' ', text_no_grade).strip()
    nums = set(re.findall(r'\d+(?:[.,]\d+)?', text_no_grade))
    return text_no_grade, nums, grades


def item_match_score(ocr_text: str, cpvt_text: str) -> float:
    """0-100 combined score; ≥70 = strong match recommended."""
    try:
        from rapidfuzz import fuzz
    except ImportError:
        fuzz = None

    ocr_norm, ocr_nums, ocr_grades = normalize_item_name(ocr_text)
    cpvt_norm, cpvt_nums, cpvt_grades = normalize_item_name(cpvt_text)

    if not ocr_norm and not cpvt_norm:
        return 0.0

    text_score = 0
    if fuzz and ocr_norm and cpvt_norm:
        text_score = fuzz.token_set_ratio(ocr_norm, cpvt_norm)

    # If either side has no numeric dimensions, fall back to pure text score.
    if not ocr_nums or not cpvt_nums:
        grade_boost = 5 if (ocr_grades and cpvt_grades and (ocr_grades & cpvt_grades)) else 0
        return min(100.0, text_score + grade_boost)

    inter = ocr_nums & cpvt_nums
    union = ocr_nums | cpvt_nums
    num_jaccard = (len(inter) / len(union)) * 100 if union else 0

    grade_boost = 10 if (ocr_grades and cpvt_grades and (ocr_grades & cpvt_grades)) else 0

    return min(100.0, 0.4 * text_score + 0.6 * num_jaccard + grade_boost)


if __name__ == "__main__":
    # Self-test
    cases = [
        ("Thép tấm PL6 khổ 2000x12000 SS400", "PL6X2000X12000", 70),
        ("Thép tấm PL16 dày 16mm khổ 2000x12000mm", "PL16X2000X12000", 70),
        ("GRATING 32X5-KHÔNG RĂNG CƯA-MUA THEO BẢN VẼ", "Grating 32x5 không răng cưa", 80),
        ("U-bolt DN40 SS304", "U-BOLT DN40 SS304 cho ống", 70),
        ("Thép hộp SHS 200x200x10 ASTM A500 GrB", "SHS200X200X10 thép hộp", 70),
        ("PLUG SS-600-P SWAGELOK", "Phích cắm SS-600-P Swagelok 88 cái", 50),
        ("Different item entirely", "PL6X2000X12000", 0),
    ]
    print("B-CPVT-019 normalizer self-test:")
    for ocr, cpvt, expected_min in cases:
        score = item_match_score(ocr, cpvt)
        flag = "✓" if score >= expected_min else "✗"
        print(f"  {flag} score={score:5.1f} (≥{expected_min}) | OCR='{ocr[:40]}' vs DB='{cpvt[:30]}'")
