# IBS Procurement — Deployment Guide

Stack: PostgreSQL 17 · Backend (Express/Prisma) · Frontend (Next.js 16 standalone) · Nginx reverse proxy — đóng gói bằng Docker Compose.

## Kiến trúc

```
                  ┌───────────────────────────┐
  Internet/LAN →  │  Nginx (443/80)           │
                  │  · SSL termination        │
                  │  · Rate limit (login/api) │
                  │  · Static caching         │
                  └─────┬──────────────┬──────┘
                        │              │
                  /_next/*, /           /api/*, /uploads/*
                        │              │
                  ┌─────▼─────┐   ┌────▼────────┐
                  │ frontend  │   │  backend    │
                  │ Next.js   │   │  Express    │
                  │ :3000     │   │  :5005      │
                  └───────────┘   └──────┬──────┘
                                         │
                                   ┌─────▼──────┐
                                   │ postgres   │
                                   │ :5432      │
                                   │ (internal) │
                                   └────────────┘
```

## Chuẩn bị host machine

- Docker Engine 25+ và Docker Compose v2 (`docker compose version`)
- 4GB RAM, 20GB ổ trống
- Mở port 80 và 443 trên firewall

## Triển khai lần đầu

### 1. Clone mã nguồn vào server

```bash
cd /opt
git clone <repo-url> ibshi-procurement
cd ibshi-procurement
```

### 2. Tạo file `.env`

```bash
cp .env.example .env

# Sinh JWT_SECRET mới (CHẠY TRÊN SERVER, không reuse!)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Mở `.env`, điền:

| Biến               | Ví dụ                                             |
| ------------------ | ------------------------------------------------- |
| POSTGRES_PASSWORD  | Mật khẩu mạnh ngẫu nhiên (32+ ký tự)              |
| JWT_SECRET         | Hex string từ lệnh trên (128 ký tự)               |
| ALLOWED_ORIGINS    | `https://procurement.ibshi.local`                  |

### 3. SSL certificate

Đặt 2 file vào `deploy/nginx/certs/`:

- `fullchain.pem` — certificate + CA chain
- `privkey.pem` — private key

Option A (self-signed cho staging nội bộ):

```bash
mkdir -p deploy/nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout deploy/nginx/certs/privkey.pem \
  -out deploy/nginx/certs/fullchain.pem \
  -subj "/CN=procurement.ibshi.local"
```

Option B (Let's Encrypt với certbot standalone):

```bash
# Dừng Nginx trước
docker compose stop nginx
sudo certbot certonly --standalone -d procurement.ibshi.local
sudo cp /etc/letsencrypt/live/procurement.ibshi.local/fullchain.pem deploy/nginx/certs/
sudo cp /etc/letsencrypt/live/procurement.ibshi.local/privkey.pem deploy/nginx/certs/
docker compose up -d nginx
```

Option C (STAGING không SSL): xem mục _Staging mode_ ở dưới.

### 4. Build & start stack

```bash
docker compose build
docker compose up -d
docker compose ps        # kiểm tra 4 service đều "healthy"
docker compose logs -f   # xem log realtime
```

### 5. Chạy migration + seed admin

```bash
# Tạo bảng
docker compose exec backend npx prisma migrate deploy

# Tạo tài khoản admin đầu tiên (chỉ chạy 1 lần!)
docker compose exec -e ADMIN_INIT_PASSWORD="MẬT_KHẨU_MẠNH" backend node run_seed.js
```

### 6. Kiểm tra

```bash
curl -k https://your-domain/health
# → {"status":"ok","db":"connected",...}
```

Mở browser → `https://procurement.ibshi.local` → đăng nhập → đổi mật khẩu ở `/settings`.

---

## Staging mode (HTTP, không cần SSL)

Dùng cho test nội bộ trong LAN khi chưa có cert.

```bash
cd deploy/nginx/conf.d
mv ibshi.conf ibshi.conf.disabled
mv ibshi-staging.conf.disabled ibshi-staging.conf
cd ../../..
docker compose restart nginx
```

Truy cập `http://<ip-server>`.

---

## Vận hành

### Logs

```bash
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f postgres
```

### Backup database

```bash
docker compose exec postgres pg_dump -U ibshi ibshi_procurement \
  | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore

```bash
gunzip -c backup_xxx.sql.gz \
  | docker compose exec -T postgres psql -U ibshi -d ibshi_procurement
```

### Update code

```bash
git pull
docker compose build
docker compose up -d
docker compose exec backend npx prisma migrate deploy
```

### Rolling back

```bash
git checkout <previous-tag>
docker compose build
docker compose up -d
```

### Rotate JWT secret

1. Sinh secret mới, cập nhật `.env`
2. `docker compose up -d backend` — tất cả session cũ sẽ bị invalidate, user phải đăng nhập lại

### Xóa rate-limit cho 1 IP bị kẹt

Restart Nginx + backend để clear in-memory store:

```bash
docker compose restart nginx backend
```

---

## Kiến trúc ghi nhớ

- **postgres** chỉ listen trong `ibshi_net` — KHÔNG expose ra host. Chỉ backend container truy cập được.
- **backend** không expose ra host. Nginx proxy `/api/*` và `/uploads/*` vào.
- **frontend** không expose ra host. Nginx proxy `/` và `/_next/static/*` vào.
- **uploads volume** persist file Excel upload giữa các lần redeploy.
- **pg_data volume** persist DB — KHÔNG xóa bằng `docker compose down -v` trừ khi muốn reset hoàn toàn.

## Troubleshooting

| Triệu chứng                                 | Kiểm tra                                                     |
| ------------------------------------------- | ------------------------------------------------------------ |
| `502 Bad Gateway`                           | `docker compose ps` — backend/frontend unhealthy?            |
| Login liên tục 429                          | Rate limit quá chặt — restart backend để clear               |
| `Can't reach database`                      | `docker compose logs postgres` · password sai?               |
| File upload 413                             | Nginx `client_max_body_size` hoặc Multer `limits.fileSize`   |
| CORS error trên browser                     | `ALLOWED_ORIGINS` trong `.env` khớp domain thực tế chưa?     |
| Rate limit bắt sai IP                       | `TRUST_PROXY=1` chưa set hoặc Nginx không set X-Forwarded-For |
