# SESSION IDENTITY

```yaml
session_id: cpvt
name: Code Platform Vật Tư
workspace_root: VẬT TƯ/
manifest: ../HUNGTH OBSIDIAN/_sessions/cpvt.md
protocol: ../HUNGTH OBSIDIAN/_sessions/PROTOCOL.md
```

**Khi Claude Code mở folder này:**
1. Đọc CLAUDE.md (8 hard rules)
2. Đọc DEVOPS_NOTES.md (gotchas)
3. Đọc SESSION_IDENTITY.md (this file)
4. Check `../HUNGTH OBSIDIAN/_sessions/_inbox/cpvt/*.md` (unprocessed messages) — xem PROTOCOL.md để xử lý
5. Update `../HUNGTH OBSIDIAN/_sessions/_shared/STATE.md` section "## CPVT" với last_seen timestamp

**Khi cần gọi session khác** (vd OCRP, DA):
- KHÔNG edit trực tiếp file của workspace họ
- Tạo message vào `../HUNGTH OBSIDIAN/_sessions/_inbox/<target>/<ts>_cpvt_<topic>.md`
- Theo template trong PROTOCOL.md §3
