# 🚢 Deploy H429 lên Raspberry Pi 5 ở chế độ Kiosk

Tài liệu này hướng dẫn triển khai dự án H429 trên Raspberry Pi 5 để máy:

- tự khởi động vào desktop
- tự mở giao diện monitoring toàn màn hình
- chạy ổn định như một kiosk app

Thông tin máy đang áp dụng:

- Host: `drums`
- User: `drums`
- Project path: `/home/drums/H429_V4`

## 🧭 Mục tiêu triển khai

Hệ thống nên chạy theo mô hình:

- `backend/` chạy bằng `systemd`, chỉ listen nội bộ `127.0.0.1:8888`
- `frontend/` được Apache serve local
- Chromium tự mở fullscreen khi Pi bật lên

Mô hình:

```text
Chromium kiosk
  -> http://127.0.0.1/
  -> Apache
     -> /       => /home/drums/H429_V4/frontend
     -> /api/   => 127.0.0.1:8888
```

## 📦 Bước 1: Cài package cần thiết

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip apache2 chromium unclutter
```

Ghi chú:

- Trên Raspberry Pi OS mới, package đúng là `chromium`
- Không dùng `chromium-browser`

## 📁 Bước 2: Đặt source code đúng đường dẫn

Project cần nằm tại:

```bash
/home/drums/H429_V4
```

Cấu trúc chính:

```text
/home/drums/H429_V4/backend
/home/drums/H429_V4/frontend
/home/drums/H429_V4/deploy
```

## 🐍 Bước 3: Cài môi trường Python cho backend

```bash
cd /home/drums/H429_V4/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Nếu cần thêm package ở root:

```bash
cd /home/drums/H429_V4
pip install -r requirements.txt
```

## ⚙️ Bước 4: Tạo service backend

Tạo file:

```bash
sudo nano /etc/systemd/system/h429-backend.service
```

Nội dung:

```ini
[Unit]
Description=H429 FastAPI backend
After=network.target

[Service]
Type=simple
User=drums
Group=drums
WorkingDirectory=/home/drums/H429_V4/backend
ExecStart=/home/drums/H429_V4/backend/.venv/bin/python run.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

Bật service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now h429-backend
sudo systemctl status h429-backend
```

Kiểm tra backend:

```bash
curl http://127.0.0.1:8888/api/check_all_status_lable/index
ss -ltnp | grep 8888
```

Kỳ vọng:

```text
127.0.0.1:8888
```

## 🌐 Bước 5: Cấu hình Apache cho frontend + API proxy

Bật module cần thiết:

```bash
sudo a2enmod proxy proxy_http headers
```

Tạo file:

```bash
sudo nano /etc/apache2/sites-available/h429.conf
```

Nội dung:

```apache
<VirtualHost *:80>
    ServerName localhost
    DocumentRoot /home/drums/H429_V4/frontend

    <Directory /home/drums/H429_V4/frontend>
        Options Indexes FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    ProxyPreserveHost On
    ProxyPass /api/ http://127.0.0.1:8888/api/
    ProxyPassReverse /api/ http://127.0.0.1:8888/api/
</VirtualHost>
```

Bật site:

```bash
sudo a2dissite 000-default.conf
sudo a2ensite h429.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Nếu cần cấp quyền đọc:

```bash
sudo chmod o+rx /home/drums
sudo chmod -R o+rX /home/drums/H429_V4/frontend
```

Kiểm tra:

```bash
curl http://127.0.0.1/
```

## 🖥️ Bước 6: Bật auto-login desktop cho user `drums`

Chạy:

```bash
sudo raspi-config
```

Vào:

- `System Options`
- `Boot / Auto Login`
- chọn `Desktop Autologin`

Sau khi cấu hình xong, desktop phải tự đăng nhập bằng user `drums`.

Kiểm tra:

```bash
whoami
echo $HOME
```

Kỳ vọng:

```text
drums
/home/drums
```

## 🚀 Bước 7: Cách ổn định nhất để tự mở app khi reboot

Phương án ổn định nhất là dùng `systemd --user` để mở Chromium sau khi desktop session của user `drums` sẵn sàng.

Lý do nên dùng cách này:

- ổn định hơn file autostart thông thường
- dễ restart nếu cần
- rõ log và dễ debug hơn
- ít phụ thuộc biến thể desktop session

### 7.1 Tạo script mở kiosk

Tạo file:

```bash
mkdir -p /home/drums/.local/bin
nano /home/drums/.local/bin/start-h429-kiosk.sh
```

Nội dung:

```bash
#!/usr/bin/env bash
sleep 8
/usr/bin/chromium \
  --start-fullscreen \
  --kiosk \
  --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --incognito \
  http://127.0.0.1/
```

Cấp quyền chạy:

```bash
chmod +x /home/drums/.local/bin/start-h429-kiosk.sh
```

### 7.2 Tạo user service cho kiosk

Tạo thư mục service:

```bash
mkdir -p /home/drums/.config/systemd/user
```

Tạo file:

```bash
nano /home/drums/.config/systemd/user/h429-kiosk.service
```

Nội dung:

```ini
[Unit]
Description=H429 Chromium Kiosk
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/drums/.Xauthority
ExecStart=/home/drums/.local/bin/start-h429-kiosk.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

### 7.3 Reload và enable user service

Chạy bằng user `drums`:

```bash
systemctl --user daemon-reload
systemctl --user enable h429-kiosk.service
systemctl --user start h429-kiosk.service
systemctl --user status h429-kiosk.service
```

### 7.4 Cho phép user service tồn tại sau reboot

Chạy:

```bash
sudo loginctl enable-linger drums
```

Lệnh này giúp user service của `drums` được systemd quản lý ổn định hơn sau khi boot.

## 🧪 Bước 8: Test kiosk trước khi reboot

Chạy:

```bash
systemctl --user restart h429-kiosk.service
```

Nếu Chromium mở đúng fullscreen vào:

```text
http://127.0.0.1/
```

thì reboot test:

```bash
sudo reboot
```

## 🛟 Bước 9: Fallback nếu chưa muốn dùng systemd --user

Nếu cần một cách đơn giản hơn, có thể dùng file `.desktop` của user `drums`.

Tạo thư mục:

```bash
mkdir -p /home/drums/.config/autostart
```

Tạo file:

```bash
nano /home/drums/.config/autostart/h429-kiosk.desktop
```

Nội dung:

```ini
[Desktop Entry]
Type=Application
Name=H429 Kiosk
Exec=bash -lc "sleep 8; /usr/bin/chromium --start-fullscreen --kiosk --no-first-run --noerrdialogs --disable-infobars --incognito http://127.0.0.1/"
Terminal=false
X-GNOME-Autostart-enabled=true
```

Sửa quyền:

```bash
chown drums:drums /home/drums/.config/autostart/h429-kiosk.desktop
```

Ghi chú:

- Cách này đã test chạy được
- Nhưng về lâu dài vẫn nên ưu tiên `systemd --user`

## ✅ Kiểm tra tổng thể sau khi hoàn tất

Kiểm tra backend:

```bash
systemctl status h429-backend
curl http://127.0.0.1:8888/api/check_all_status_lable/index
```

Kiểm tra frontend:

```bash
curl http://127.0.0.1/
```

Kiểm tra kiosk user service:

```bash
systemctl --user status h429-kiosk.service
journalctl --user -u h429-kiosk.service -n 50 --no-pager
```

## 🔍 Nếu reboot mà vẫn không tự mở app

Kiểm tra theo thứ tự:

1. Desktop có auto-login đúng user `drums` không
2. Backend có chạy không
3. Apache có phục vụ `http://127.0.0.1/` không
4. `systemctl --user status h429-kiosk.service` có lỗi không
5. `/usr/bin/chromium` có tồn tại không

Test tay:

```bash
/home/drums/.local/bin/start-h429-kiosk.sh
```

Nếu lệnh này mở được app, thì lỗi nằm ở phần autostart/service, không nằm ở frontend/backend.

## 💡 Lưu ý vận hành thực tế

- Dùng nguồn ổn định cho Raspberry Pi 5
- Nếu chạy lâu dài, nên dùng SSD hoặc USB tốt thay vì thẻ nhớ chất lượng thấp
- Dùng `Restart=always` hoặc `Restart=on-failure` để tự khôi phục service
- Nếu cần hệ thống chạy liên tục, nên bổ sung UPS
- Nếu sau này cần truy cập qua mạng nội bộ, vẫn nên giữ backend listen ở `127.0.0.1`
