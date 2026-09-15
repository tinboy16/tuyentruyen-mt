# Đội Đặc Nhiệm Nhí

Nền tảng mini game giáo dục dành cho học sinh tiểu học.

## Công nghệ

- Node.js
- Fastify
- Prisma
- PostgreSQL
- Docker
- Docker Compose
- Nginx

---

## 1. Yêu cầu

Máy cần cài:

- Git
- Docker Desktop hoặc Docker Engine + Docker Compose

Không cần cài Node.js hoặc PostgreSQL trực tiếp trên máy.

---

## 2. Cài đặt

### Bước 1: Clone project

```bash
git clone <URL_REPOSITORY>
cd tuyen-truyen-mt
```

### Bước 2: Tạo file .env
Tạo file `.env` tại thư mục gốc (bạn có thể copy từ `.env.example`):

```env
POSTGRES_USER=gameuser
POSTGRES_PASSWORD=your_password
POSTGRES_DB=kidsgame
```
*Lưu ý: Không đưa file `.env` lên GitHub.*

### Bước 3: Khởi động hệ thống
```bash
docker compose up -d --build
```
Docker sẽ tự động:
- Khởi động PostgreSQL
- Chờ PostgreSQL sẵn sàng
- Chạy Prisma migrations
- Seed dữ liệu game
- Khởi động API
- Khởi động Web

---

## 3. Kiểm tra
```bash
docker compose ps
```
Kết quả bình thường:
```text
kids-game-postgres   Up (healthy)
kids-game-migrate    Exited (0)
kids-game-api        Up
kids-game-web        Up
```

Mở trình duyệt truy cập:
**http://localhost:8080**

---

## 4. Các lệnh thường dùng

- **Xem trạng thái:**
  ```bash
  docker compose ps
  ```
- **Xem log toàn hệ thống:**
  ```bash
  docker compose logs
  ```
- **Xem log API (theo dõi liên tục):**
  ```bash
  docker compose logs -f api
  ```
- **Xem log migration/seed:**
  ```bash
  docker compose logs migrate
  ```
- **Khởi động lại:**
  ```bash
  docker compose restart
  ```
- **Build lại:**
  ```bash
  docker compose up -d --build
  ```
- **Dừng hệ thống:**
  ```bash
  docker compose down
  ```

---

## 5. Xóa và cài lại database

Nếu muốn xóa toàn bộ database và tạo lại từ đầu:

```bash
docker compose down -v
docker compose up -d --build
```
*Lưu ý: Lệnh `docker compose down -v` sẽ xóa toàn bộ dữ liệu PostgreSQL hiện tại.*

---

## 6. Cấu trúc project

```text
tuyen-truyen-mt/
│
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── package-lock.json
│   │
│   └── web/
│       ├── index.html
│       ├── style.css
│       ├── game.js
│       ├── nginx.conf
│       └── Dockerfile
│
├── docker-compose.yaml
├── .env
├── .env.example
└── .gitignore
```

---

## 7. Lưu ý

- **Không commit** các file/thư mục sau lên Git:
  - `.env`
  - `node_modules/`
  - `dist/`
  - `build/`
  - `*.log`
- Các thư mục Prisma migration **phải được đưa lên Git**:
  - `apps/api/prisma/migrations/`

---

## 8. Cài đặt nhanh

Dành cho máy đã có Docker và Git:

```bash
git clone <URL_REPOSITORY>
cd tuyen-truyen-mt
# Tạo file .env tương tự .env.example, sau đó:
docker compose up -d --build
```
Truy cập: **http://localhost:8080**
