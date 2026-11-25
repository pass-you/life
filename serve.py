#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人生日历 · 本地预览服务器

网页是纯静态的：日历数据存在你选择的 Markdown 文件里，电影片库随站点自带，
所以这里不需要任何后端接口，只做两件事：

1. 用 http 打开站点（比 file:// 少一层浏览器限制，地址固定好记）；
2. 提供 /api/stop，供「停止人生日历.vbs」优雅退出后台进程。

    python serve.py                # http://127.0.0.1:8765
    python serve.py --port 8080
    python serve.py --host 0.0.0.0 # 允许局域网访问

只用标准库。不需要它也能用：GitHub Pages 或任意静态托管打开网页即可，
「找电影」的片库随站点一起发布，不依赖本机进程。
"""

from __future__ import annotations

import argparse
import gzip
import mimetypes
import os
import socket
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
LOG_DIR = BASE_DIR / ".run"


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeCalendar/3.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:  # 安静一点，只留错误
        if args and isinstance(args[0], str) and args[0].startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

    def send_bytes(self, status: int, body: bytes, content_type: str,
                   cache_control: str = "no-cache", head_only: bool = False,
                   compress: bool = False, extra: dict[str, str] | None = None) -> None:
        encoding = ""
        if compress and len(body) > 1024 and "gzip" in (self.headers.get("Accept-Encoding") or ""):
            body = gzip.compress(body, 6)
            encoding = "gzip"
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_control)
        self.send_header("X-Content-Type-Options", "nosniff")
        if encoding:
            self.send_header("Content-Encoding", encoding)
            self.send_header("Vary", "Accept-Encoding")
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        self.handle_request(head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self.handle_request(head_only=True)

    def handle_request(self, head_only: bool) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/stop":
            self.handle_stop(head_only)
            return
        self.handle_static(path, head_only)

    def handle_stop(self, head_only: bool) -> None:
        """pythonw 无控制台，用这个接口优雅停掉本地服务。"""
        remote = self.client_address[0] if self.client_address else ""
        if remote not in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
            body = '{"error":"只允许本机停止服务"}'.encode("utf-8")
            self.send_bytes(403, body, "application/json; charset=utf-8", head_only=head_only)
            return
        self.send_bytes(200, b'{"ok":true,"stopping":true}',
                        "application/json; charset=utf-8", head_only=head_only)
        threading.Timer(0.2, shutdown_server).start()

    def handle_static(self, path: str, head_only: bool) -> None:
        if path == "/":
            path = "/index.html"
        target = (BASE_DIR / path.lstrip("/")).resolve()
        try:
            inside = os.path.commonpath([str(BASE_DIR), str(target)]) == str(BASE_DIR)
        except ValueError:
            inside = False
        if not inside or any(part.startswith(".") for part in target.relative_to(BASE_DIR).parts):
            self.send_bytes(404, b"not found", "text/plain; charset=utf-8", head_only=head_only)
            return
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            self.send_bytes(404, b"not found", "text/plain; charset=utf-8", head_only=head_only)
            return

        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript",
                                                                "image/svg+xml"):
            if "charset" not in content_type:
                content_type += "; charset=utf-8"
        suffix = target.suffix.lower()
        cache_control = ("no-cache" if suffix in (".html", ".js", ".css", ".json")
                         else "public, max-age=86400")
        try:
            body = target.read_bytes()
            stat = target.stat()
        except OSError:
            self.send_bytes(404, b"not found", "text/plain; charset=utf-8", head_only=head_only)
            return

        # 浏览器刷新时用 ETag 换 304，不必重新下载 vditor 与片库。
        etag = '"%x-%x"' % (int(stat.st_mtime * 1000), stat.st_size)
        if (self.headers.get("If-None-Match") or "").strip() == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", cache_control)
            self.end_headers()
            return
        compressible = content_type.startswith("text/") or content_type in (
            "application/javascript", "image/svg+xml")
        self.send_bytes(200, body, content_type, cache_control, head_only,
                        compress=compressible, extra={"ETag": etag})


class LocalServer(ThreadingHTTPServer):
    """Windows 的 SO_REUSEADDR 允许别的进程重复绑定同一端口，这里改成独占绑定。"""

    allow_reuse_address = os.name != "nt"

    def server_bind(self) -> None:
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


SERVER: ThreadingHTTPServer | None = None


def setup_stdio() -> None:
    """pythonw.exe 没有控制台：sys.stdout / sys.stderr 可能是 None，print 会直接抛错。"""
    if sys.stdout is not None and sys.stderr is not None:
        return
    try:
        LOG_DIR.mkdir(exist_ok=True)
        stream = open(LOG_DIR / "serve.log", "a", encoding="utf-8", buffering=1)
    except OSError:
        stream = open(os.devnull, "w", encoding="utf-8")
    if sys.stdout is None:
        sys.stdout = stream
    if sys.stderr is None:
        sys.stderr = stream


def shutdown_server() -> None:
    server = SERVER
    if server is not None:
        server.shutdown()


def port_in_use(host: str, port: int) -> bool:
    """端口上是否已经有人在监听（重复双击启动脚本时复用，不再报端口占用）。"""
    probe_host = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    try:
        with socket.create_connection((probe_host, port), timeout=1.0):
            return True
    except OSError:
        return False


def open_browser(address: str) -> None:
    try:
        webbrowser.open(address)
    except Exception as exc:  # noqa: BLE001 打不开浏览器不影响服务
        sys.stderr.write("无法自动打开浏览器（%s），请手动访问 %s\n" % (exc, address))


def main() -> int:
    setup_stdio()
    global SERVER
    parser = argparse.ArgumentParser(description="人生日历本地预览服务器（纯静态）")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，默认 127.0.0.1")
    parser.add_argument("--port", type=int, default=8765, help="端口，默认 8765")
    parser.add_argument("--no-browser", action="store_true", help="启动后不自动打开浏览器")
    args = parser.parse_args()

    address = "http://%s:%d/" % ("127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host,
                                 args.port)
    if port_in_use(args.host, args.port):
        print("人生日历已经在运行：%s" % address)
        if not args.no_browser:
            open_browser(address)
        return 0

    try:
        server = LocalServer((args.host, args.port), Handler)
    except OSError as exc:
        sys.stderr.write("端口 %d 无法使用：%s\n" % (args.port, exc))
        return 1
    server.daemon_threads = True
    SERVER = server
    print("人生日历已启动：%s" % address)
    print("停止：运行 停止人生日历.vbs，或按 Ctrl+C。")
    if not args.no_browser:
        threading.Timer(0.3, open_browser, (address,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
