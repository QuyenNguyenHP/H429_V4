# 🚀 Deployment Recommendations

Tài liệu này ghi lại cách triển khai phù hợp cho project H429 khi public qua domain:

- `drums.dqcloud.online` 🌐

## ✅ Kiến trúc khuyến nghị

Phương án nên dùng:

- Apache serve trực tiếp static frontend từ thư mục `frontend/` 📁
- Apache proxy `/api/` tới backend local `127.0.0.1:8888` 🔁
- Chỉ forward router:
  - `80`
  - `443`
- Không public trực tiếp:
  - `5170`
  - `8888`

## 🧭 Mô hình chạy

```text
Internet
  -> Router 80/443
  -> Apache
     -> /       serves /home/nguyen/H429_v3/frontend
     -> /api/   proxies to 127.0.0.1:8888
```

## 🔒 Backend phải listen local only

Backend nên chạy tại:

```text
127.0.0.1:8888
```

Không dùng:

```text
0.0.0.0:8888
```

## 📄 File Apache mẫu trong repo

File mẫu đã được tạo sẵn tại:

- `deploy/apache/drums.dqcloud.online.conf` 🧩

File này dùng cấu trúc:

- `ServerName drums.dqcloud.online`
- `DocumentRoot /home/nguyen/H429_v3/frontend`
- `/api/ -> http://127.0.0.1:8888/api/`

## 🛠️ Các bước triển khai

### 1. Đảm bảo backend chạy local only

Chạy backend:

```bash
cd /home/nguyen/H429_v3/backend
python3 run.py
```

Kiểm tra:

```bash
ss -ltnp | grep 8888
```

Kỳ vọng:

```text
127.0.0.1:8888
```

### 2. Cài Apache nếu chưa có

```bash
sudo apt update
sudo apt install apache2
```

### 3. Bật các module cần dùng

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod headers
sudo systemctl restart apache2
```

Nếu sau này bật HTTPS:

```bash
sudo a2enmod ssl
sudo systemctl restart apache2
```

### 4. Copy file config mẫu từ repo

```bash
sudo cp /home/nguyen/H429_v3/deploy/apache/drums.dqcloud.online.conf /etc/apache2/sites-available/
```

### 5. Bật site

```bash
sudo a2ensite drums.dqcloud.online.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Nếu không dùng site mặc định:

```bash
sudo a2dissite 000-default.conf
sudo systemctl reload apache2
```

### 6. Đảm bảo Apache đọc được thư mục frontend

Ví dụ:

```bash
sudo chmod -R o+rX /home/nguyen/H429_v3/frontend
sudo chmod o+rx /home/nguyen
sudo chmod o+rx /home/nguyen/H429_v3
```

Nếu muốn chặt hơn, nên dùng group thay vì `o+rX`. 🔐

### 7. Cấu hình DNS

Tại nhà cung cấp domain hoặc DNS:

- tạo record `A`
- trỏ `drums.dqcloud.online` tới public IP của nhà bạn

Nếu IP động:

- dùng DDNS hoặc script cập nhật DNS tự động 🔄

### 8. Router port forwarding

Chỉ forward:

- `80` ✅
- `443` ✅

Không forward:

- `5170` ❌
- `8888` ❌

### 9. Bật firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw deny 5170/tcp
sudo ufw deny 8888/tcp
sudo ufw enable
```

### 10. Kiểm tra sau deploy

Test frontend:

```bash
curl http://drums.dqcloud.online/
```

Test API qua Apache:

```bash
curl http://drums.dqcloud.online/api/check_all_status_lable/index
```

Mở trình duyệt:

```text
http://drums.dqcloud.online/
```

## 🔐 HTTPS với Certbot

Nếu domain đã trỏ đúng:

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d drums.dqcloud.online
```

Nếu cần cả `www`:

```bash
sudo certbot --apache -d drums.dqcloud.online -d www.drums.dqcloud.online
```

## 📌 Kết luận

Cấu hình nên dùng cho project này:

- Apache serve trực tiếp `frontend/` 📁
- Apache proxy `/api/` tới `127.0.0.1:8888` 🔁
- backend chỉ listen local 🔒
- router chỉ mở `80/443` 🌍
- không public `5170` và `8888` ⛔

Đây là phương án gọn, ổn định và phù hợp production hơn so với việc mở trực tiếp frontend/backend ra internet. ✅
