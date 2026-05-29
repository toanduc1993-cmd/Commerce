# UPGRADE_STRATEGY.md — Dependency upgrade discipline (S4-4)

> **Created:** 2026-05-25 Phase B
> **Driver:** Risk C1 (bleeding-edge stack) — Prisma 7.6, Next 16.2, Express 5.2, Tailwind 4, React 19, Zod 4, embedded-postgres BETA
> **Goal:** Predictable upgrades, no surprise breaking changes, ecosystem ahead of us

---

## Cadence

| Frequency | What we do |
|---|---|
| **Quarterly (Q1, Q3)** | Major version review — evaluate Prisma/Next/React/Tailwind/Express upgrade candidates |
| **Monthly** | Patch updates (npm outdated → bump minor/patch on stable deps) |
| **Weekly** | npm audit fix (security patches only via CI alert) |
| **Per PR** | Lockfile review — any new transitive dep > 1MB or weird license → discuss |

---

## Pinning policy (S4-2)

Critical dependencies = **EXACT version** (no `^`):
```jsonc
"@prisma/client": "7.6.0",     // not ^7.6.0
"next": "16.2.2",
"react": "19.2.4",
"react-dom": "19.2.4",
"express": "5.2.1",
"tailwindcss": "4.1.0",
"@prisma/adapter-pg": "7.6.0",
"prisma": "7.6.0"
```

Less critical = `^` allowed (auto patch+minor):
```jsonc
"helmet": "^8.1.0",     // security middleware — auto patches good
"morgan": "^1.10.1"
```

CI uses `npm ci` (not `npm install`) → lockfile is sacred.

---

## Major upgrade decision matrix

### When to upgrade a major version?

| Condition | Action |
|---|---|
| **6+ months since GA** AND stable in community | ✅ Schedule next quarter |
| **Same-major patch fixes a CRITICAL CVE** | 🟠 Upgrade ASAP (with rollback plan) |
| **New major within 3 months of GA** | ⏸️ WAIT — let others find sharp edges |
| **Brings breaking changes affecting >10 files** | 🟡 Schedule dedicated sprint, not part of feature work |

### Current technical debt (2026-05-25 snapshot)

| Dep | Current | Latest stable | Decision |
|---|---|---|---|
| Prisma | 7.6.0 | 7.6.x | Stay (just upgraded; Prisma 7 GA Mar 2026) |
| Next.js | 16.2.2 | 16.2.x | Stay — already bleeding edge; check Next 17 GA mid-2026 |
| React | 19.2.4 | 19.2.x | Stay |
| Express | 5.2.1 | 5.2.x | Stay — Express 5 GA Sep 2024, community catching up |
| Tailwind | 4.1.0 | 4.1.x | Stay — Tailwind 4 redesign |
| Zod | 4.3.6 | 4.3.x | Stay |
| embedded-postgres | 18.3.0-**beta** | 18.3.0-beta | 🚨 **REPLACE** with postgres:18 docker (S4-1 in flight) |
| bcryptjs | 3.0.3 | 3.0.x | Stay |
| jsonwebtoken | 9.0.3 | 9.0.x | Stay |

---

## Upgrade workflow (per major)

1. **Read changelog** + breaking changes doc — write summary in `CHANGES_LOG.md`
2. **Test branch** `chore/upgrade-<dep>-<version>` — never on main
3. **Local smoke test** — 3 services up, manual click-through 5 critical paths
4. **CI green** — all tests + typecheck + lint pass
5. **Lockfile review** — count new transitive deps (`npm ls | wc -l`)
6. **Performance baseline** — verify `/health/detail` p95 latency unchanged (±10%)
7. **Manual user test** by Hưng before merge

---

## Rollback procedure

If upgrade breaks production:

```sh
git checkout main
git revert <upgrade-commit-sha>
cd backend && npm ci   # lockfile reverts deps
pm2 reload ibshi-backend --update-env
```

DB schema rollback (if Prisma schema changed):
```sh
psql "$DATABASE_URL" -1 -f prisma/migrations/<previous_schema>.sql.rollback
```

---

## Red flags to watch

- **Stack Overflow / GitHub Issues recency** — if top results for "Next 16 + Tailwind 4 problem" are <30 days old → ecosystem not ready
- **Vendor support matrix** — Vercel/Prisma/Anthropic SDK still listing old major as recommended → wait
- **AI assistant (Claude/Copilot) training data lag** — if Claude gives Next 15 answers for Next 16 question → we'll struggle

---

## Quarterly review template

When doing Q1/Q3 review, fill this in:

```markdown
## Upgrade review YYYY-QN

### Deps evaluated
- [ ] Prisma X → Y — decision: stay/upgrade
- [ ] Next.js X → Y — decision: stay/upgrade
- ...

### Security audit
- npm audit baseline: 0 HIGH, X MEDIUM
- snyk report attached

### Performance baseline
- /health/detail p95: Xms (prev: Yms)
- /api/v1/dashboard/stats p95: Xms
- Cold start: Xs

### Decisions
- Upgrade <dep> from X to Y by <date>
- Defer <dep> Z because <reason>
```

Save as `UPGRADE_REVIEW_YYYY-QN.md` in `archive/`.

---

## Reference links

- [STABILITY_RISK_REGISTER.md](STABILITY_RISK_REGISTER.md) §C1
- [PLATFORM_COMPLETION_PLAN.md](PLATFORM_COMPLETION_PLAN.md) Phase B
- [DEVOPS_NOTES.md](DEVOPS_NOTES.md) — known gotchas per upgrade
