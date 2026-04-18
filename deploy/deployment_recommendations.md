# 🚀 Deployment Recommendations

This document summarizes the recommended production-style deployment for this project when the server is hosted at home and exposed through a router. 🏠

## ✅ Recommended Architecture

Best approach for this project:

- Use `Apache` as the reverse proxy because that matches your current workflow. 🌐
- Forward only router ports `80` and `443`. 🔓
- Run the backend only on `127.0.0.1:8888`. 🔒
- Do not expose port `8888` publicly. ⛔
- Do not expose port `5170` publicly. ⛔
- Serve the frontend through Apache, or proxy it to `127.0.0.1:5170`. 🖥️
- Add `ufw` firewall rules on the Linux server. 🛡️

## 🤔 Why This Is Better

If you open `8888` and `5170` directly to the internet:

- bots will continuously scan the services 🤖
- the backend API is reachable by anyone 🚪
- invalid HTTP requests and random probes will appear in logs 📋
- future API changes or mistakes become directly exposed ⚠️
- `python -m http.server` is not a production-grade public web server 🧪

If Apache is the only public entrypoint:

- the backend stays private on localhost 🔐
- the frontend is easier to protect and manage 🧰
- HTTPS can be added at the proxy layer 🔒
- logs and access control are centralized 🗂️

## 🌍 Recommended Public Exposure

Router port forwarding:

- `80` -> your Linux server ✅
- `443` -> your Linux server ✅

Do not forward:

- `5170` ❌
- `8888` ❌

## 🔧 Backend Binding

The backend should listen on localhost only:

```text
127.0.0.1:8888
```

Do not bind the backend to:

```text
0.0.0.0:8888
```

Reason:

- `127.0.0.1` means only local processes such as Apache can reach it 🏠
- external scanners on the internet cannot connect directly to the backend 🚫

## 🖼️ Frontend Options

You have two valid Apache-based options.

### ⭐ Option 1: Best Option

Let Apache serve the static frontend files directly from the `frontend/` directory.

Advantages:

- fewer running processes ⚙️
- more stable than `python -m http.server` 📈
- simpler deployment 🧩
- better fit for production 🏭

### 👍 Option 2: Acceptable Option

Run the frontend locally on:

```text
127.0.0.1:5170
```

and let Apache reverse proxy requests to it.

This still works, but it is less clean than serving static files directly from Apache.

## 🏗️ Recommended Apache Layout

Recommended request flow:

```text
Internet
  -> Router 80/443
  -> Apache
     -> /       serves frontend
     -> /api/   proxies to 127.0.0.1:8888
```

## 🔁 Example Apache Reverse Proxy Idea

Typical direction:

- `/` serves files from your frontend directory 📁
- `/api/` proxies to `http://127.0.0.1:8888/api/` 🔀

Typical Apache modules you may need:

- `proxy`
- `proxy_http`
- `rewrite`
- `headers`
- `ssl` if using HTTPS 🔒

## 🛡️ Firewall Recommendation

Use `ufw` on the Linux server.

Recommended rules:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw deny 5170/tcp
sudo ufw deny 8888/tcp
sudo ufw enable
```

If SSH is restricted by IP in your environment, that is even better than leaving `22` open broadly. 🔐

## 📋 Practical Deployment Plan

1. Configure the backend service to listen on `127.0.0.1:8888`. 🔒
2. Stop forwarding router ports `5170` and `8888`. ⛔
3. Forward only `80` and `443`. 🌍
4. Configure Apache as the public entrypoint. 🌐
5. Route `/api/` to the backend. 🔁
6. Serve the frontend from Apache directly, or proxy to `127.0.0.1:5170`. 🖥️
7. Enable `ufw` and deny public access to `5170` and `8888`. 🛡️
8. Add HTTPS if the site is accessible from the internet. 🔐

## 💡 Strong Recommendation For This Project

For this specific project, the cleanest setup is:

- Apache serves files from `frontend/` 📁
- Apache proxies `/api/` to `127.0.0.1:8888` 🔀
- backend service runs only on localhost 🔒
- no public router forwarding for `5170` or `8888` ⛔

That gives you the same functionality with a much safer deployment surface. ✅
