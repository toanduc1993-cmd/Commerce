# Phiên đang chạy

> Nguồn sự thật để các phiên nhìn nhau bằng dữ liệu, không bằng lời hứa.
> `chan-git-add-all.sh` đọc file này để quyết định có chặn `git add -A` hay không.
> **Kết phiên nhớ đổi `dang_chay: false`** — bỏ quên sẽ chặn nhầm phiên sau.

## cpvt-kiemthu
phien: cpvt-kiemthu
dang_chay: true
cay: /Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/VẬT TƯ
nhanh: main
bat_dau: 2026-08-17
so_huu:
  - deploy/uat/**
  - docs/VAN-DE-*.md, docs/PROMPT-*.md, docs/NGHIEN-CUU-*.md
  - .claude/skills/IBSHI_Skill_SESSION_PROTOCOL_V2/**
dang_do:
  - chờ phiên "Code vật tư" sửa phần chặn bàn giao rồi chạy lại UAT phần L→O
  - ✅ 17/08 16:55 — BG-03 đã sửa xong, ĐÃ TRẢ LẠI
    backend/src/controllers/bidAnalysisController.js. Phiên code-vattu dùng lại được.
    Lưu ý: backend chưa khởi động lại nên bản vá chưa sống.

## code-vattu
phien: code-vattu
dang_chay: true
bang_chung: 17/08 15:45 sửa 6 file frontend/src/** (hang-muc-che-tao, kiem-tra-ton-kho,
  lam-ro-ky-thuat, lich-su-mua-hang, WorkspaceSelector, WorkspaceContext) — chưa commit.
  Tiến trình Claude khác khởi động 15:53.
so_huu:
  - backend/src/**
  - frontend/src/**
  - backend/prisma/**
  - backend/scripts/**
