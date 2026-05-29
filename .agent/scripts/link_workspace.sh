#!/bin/bash
# Hướng dẫn chạy: sh "/Users/trinhhuuhung/Desktop/IBSHI/01 IBSHI THƯƠNG MẠI/IBSHI THƯƠNG MẠI CÔNG NGHỆ/Skill  _ workflow/.agent/scripts/link_workspace.sh"

HUB_PATH="/Users/trinhhuuhung/Desktop/IBSHI/01 IBSHI THƯƠNG MẠI/IBSHI THƯƠNG MẠI CÔNG NGHỆ/Skill  _ workflow/.agent"
TARGET_DIR=$(pwd)

echo "[Antigravity Kit] Bắt đầu thiết lập Symlink cho Workspace hiện tại..."

if [ -L "${TARGET_DIR}/.agent" ]; then
    echo "⚠️  Cảnh báo: Symlink .agent đã tồn tại ở dự án này."
    exit 0
fi

if [ -d "${TARGET_DIR}/.agent" ]; then
    echo "⚠️  Phát hiện một thư mục .agent độc lập đang tồn tại (không phải Symlink)."
    read -p "Bạn có muốn xóa folder .agent cũ này và gắn Symlink từ Kit tổng không? (y/n) " resp
    if [ "$resp" = 'y' -o "$resp" = 'Y' ]; then
        rm -rf "${TARGET_DIR}/.agent"
        echo "✅ Thư mục cũ đã bị xóa."
    else
        echo "Hủy thao tác."
        exit 1
    fi
fi

ln -s "${HUB_PATH}" "${TARGET_DIR}/.agent"
echo "✅ THÀNH CÔNG: Dự án $(basename "${TARGET_DIR}") đã được liên kết với Skill Hub Tổng."
echo "Mọi bản cập nhật Skill mới ở Hub sẽ lập tức có mặt tại đây."
