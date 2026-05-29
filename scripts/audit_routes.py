#!/usr/bin/env python3
"""audit_routes.py — Orphan controller exports + dead route detector.
Roadmap Phase 0.2, B-CPVT-003"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
CONTROLLERS = ROOT / "backend/src/controllers"
ROUTES = ROOT / "backend/src/routes"


def extract_controller_exports():
    exports = {}
    for f in CONTROLLERS.glob("*.js"):
        text = f.read_text()
        for m in re.finditer(r"^exports\.([a-zA-Z_]\w*)\s*=", text, re.MULTILINE):
            exports[m.group(1)] = f.name
        for block in re.finditer(r"module\.exports\s*=\s*\{([^}]+)\}", text, re.MULTILINE | re.DOTALL):
            for nm in re.finditer(r"\b([a-zA-Z_]\w*)\b", block.group(1)):
                name = nm.group(1)
                if name not in ("function", "async", "const", "let", "var"):
                    exports.setdefault(name, f.name)
        for m in re.finditer(r"^async function ([a-zA-Z_]\w*)", text, re.MULTILINE):
            exports.setdefault(m.group(1), f.name)
    return exports


def extract_routed_handlers():
    routed = {}
    for f in ROUTES.glob("*.js"):
        text = f.read_text()
        for m in re.finditer(r"router\.(get|post|put|patch|delete|all)\s*\(([^)]+)\)", text, re.MULTILINE | re.DOTALL):
            args = m.group(2)
            no_strings = re.sub(r"'[^']*'|\"[^\"]*\"|`[^`]*`", "", args)
            idents = re.findall(r"\b([a-zA-Z_]\w*)\b", no_strings)
            if idents:
                routed.setdefault(idents[-1], f.name)
    return routed


def main():
    print("🔍 Audit controllers vs routes\n")
    exports = extract_controller_exports()
    routed = extract_routed_handlers()
    handlers = {n: f for n, f in exports.items() if not n.startswith("_")}

    print(f"📋 Controller exports detected: {len(handlers)}")
    print(f"📋 Routes wired:                {len(routed)}\n")

    orphans = sorted(set(handlers) - set(routed))
    if orphans:
        print(f"⚠️  Potential orphans ({len(orphans)}) — exported but not routed:")
        for fn in orphans:
            print(f"  - {fn:<35} ← {handlers[fn]}")
    else:
        print("✅ No orphans — all controller exports routed")
    print()

    common_mw = {"verifyToken", "restrictTo", "apiLimiter", "loginLimiter", "uploadLimiter",
                 "upload", "single", "memoryStorage", "diskStorage", "json", "urlencoded",
                 "static", "morgan", "helmet", "cors", "express", "router", "path", "fs",
                 "Router", "controller", "controllers", "authController"}
    dead = sorted((set(routed) - set(exports)) - common_mw)
    dead = [d for d in dead if not d.startswith("_")]
    if dead:
        print(f"⚠️  Possible dead route handlers ({len(dead)}):")
        for fn in dead:
            print(f"  - {fn:<35} ← {routed[fn]}")
    else:
        print("✅ No dead routes")

    print()
    sys.exit(1 if (orphans or dead) else 0)


if __name__ == "__main__":
    main()
