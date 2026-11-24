#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人生日历 · 本地服务

一条命令同时做两件事：

1. 托管网站静态文件（index.html、assets/…）；
2. 把豆瓣电影的公开资料代理到 /api/movie/，供网页里的「找电影」使用。

    python serve.py                # http://127.0.0.1:8765
    python serve.py --port 8080
    python serve.py --host 0.0.0.0 # 允许局域网访问

只用标准库，无需安装依赖。豆瓣接口没有 CORS 头、海报也禁止外链，
所以浏览器无法直接请求；由这个本地服务转发并缓存。

接口：
    GET /api/movie/health
    GET /api/movie/discover?genres=&countries=&from=&to=&sort=&start=
    GET /api/movie/search?q=&start=
    GET /api/movie/detail?id=
    GET /api/movie/poster?u=<豆瓣图片地址>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / ".cache"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
API_TTL = 6 * 60 * 60          # 列表/详情缓存 6 小时
POSTER_MAX_BYTES = 6 * 1024 * 1024
PAGE_SIZE = 20                 # 豆瓣每页固定 20 条

SORT_VALUES = {"U", "S", "R", "T"}   # 综合 / 评分 / 评价人数 / 最新
DOUBAN_SORT = {"U": "U", "S": "S", "R": "R", "T": "T"}

TRANSIENT_STATUS = {403, 418, 429, 500, 502, 503, 504}


class Throttle:
    """串行化豆瓣请求，避免短时间内触发风控。"""

    def __init__(self, interval: float) -> None:
        self.interval = interval
        self._lock = threading.Lock()
        self._last = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            delay = self._last + self.interval - now
            if delay > 0:
                time.sleep(delay)
            self._last = time.monotonic()


THROTTLE = Throttle(0.35)


def http_get(url: str, referer: str, accept: str = "*/*") -> tuple[bytes, str]:
    """带重试的 GET，返回 (body, content_type)。"""
    headers = {
        "User-Agent": USER_AGENT,
        "Referer": referer,
        "Accept": accept,
        "Accept-Language": "zh-CN,zh;q=0.9",
    }
    last_error: Exception | None = None
    for attempt in range(3):
        THROTTLE.wait()
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return response.read(), response.headers.get("Content-Type", "")
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code in TRANSIENT_STATUS and attempt < 2:
                time.sleep(0.9 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.6 * (attempt + 1))
                continue
            raise
    raise last_error if last_error else RuntimeError("请求失败")


def http_get_json(url: str, referer: str) -> object:
    body, _ = http_get(url, referer, accept="application/json, text/plain, */*")
    text = body.decode("utf-8", "replace").strip()
    # 豆瓣偶尔返回带安全前缀的 JSON，这里只取第一个 { 或 [ 之后的部分。
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0] or [0])
    return json.loads(text[start:])


def cache_path(kind: str, key: str) -> Path:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return CACHE_DIR / kind / digest


def cache_read_json(key: str, ttl: float) -> object | None:
    path = cache_path("api", key)
    try:
        if not path.is_file() or time.time() - path.stat().st_mtime > ttl:
            return None
        return json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return None


def cache_write_json(key: str, payload: object) -> None:
    path = cache_path("api", key)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), "utf-8")
        os.replace(tmp, path)
    except OSError:
        pass


def as_float(value: object, default: float = 0.0) -> float:
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return default
    return number if number == number else default  # 排除 NaN


def as_text(value: object, limit: int = 400) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def as_list(value: object, limit: int = 8) -> list[str]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value[:limit]:
        if isinstance(item, str) and item.strip():
            result.append(item.strip()[:80])
    return result


def normalize_subject(raw: dict) -> dict:
    """列表项（discover / search）统一结构。"""
    rating = as_float(raw.get("rate") or (raw.get("rating") or {}).get("value"))
    cover = raw.get("cover") or (raw.get("pic") or {}).get("large") or (raw.get("pic") or {}).get("normal") or ""
    subject_id = as_text(raw.get("id"), 32)
    if not subject_id:
        match = re.search(r"/subject/(\d+)", as_text(raw.get("url"), 200))
        subject_id = match.group(1) if match else ""
    return {
        "id": subject_id,
        "title": as_text(raw.get("title"), 120),
        "rating": round(rating, 1),
        "cover": cover if isinstance(cover, str) else "",
        "directors": as_list(raw.get("directors"), 3),
        "casts": as_list(raw.get("casts") or raw.get("actors"), 4),
    }


def normalize_detail(raw: dict) -> dict:
    title = as_text(raw.get("title"), 160)
    name = title
    year = as_text(raw.get("release_year"), 4)
    # 形如「肖申克的救赎 The Shawshank Redemption‎ (1994)」
    match = re.match(r"^(.*?)\s*\((\d{4})\)\s*$", title)
    if match:
        name = match.group(1).strip()
        year = year or match.group(2)
    summary = ""
    short_comment = raw.get("short_comment")
    if isinstance(short_comment, dict):
        summary = as_text(short_comment.get("content"), 600)
        author = as_text(short_comment.get("author"), 40)
        if summary and author:
            summary = summary + " —— " + author
    return {
        "id": as_text(raw.get("id"), 32),
        "title": name,
        "year": year,
        "rating": round(as_float(raw.get("rate")), 1),
        "genres": as_list(raw.get("types"), 6),
        "region": as_text(raw.get("region"), 80),
        "duration": as_text(raw.get("duration"), 40),
        "directors": as_list(raw.get("directors"), 4),
        "actors": as_list(raw.get("actors"), 10),
        "summary": summary,
        "url": as_text(raw.get("url"), 200),
    }


def douban_discover(query: dict[str, list[str]]) -> dict:
    params = {
        "sort": DOUBAN_SORT.get((query.get("sort") or ["U"])[0].upper(), "U"),
        "range": "0,10",
        "tags": "",
        "start": str(max(0, int((query.get("start") or ["0"])[0] or 0))),
    }
    genres = (query.get("genres") or [""])[0].strip()
    countries = (query.get("countries") or [""])[0].strip()
    if genres and genres != "全部":
        params["genres"] = genres
    if countries and countries != "全部":
        params["countries"] = countries
    year_from = (query.get("from") or [""])[0].strip()
    year_to = (query.get("to") or [""])[0].strip()
    if year_from.isdigit() or year_to.isdigit():
        params["year_range"] = "%s,%s" % (
            year_from if year_from.isdigit() else "1900",
            year_to if year_to.isdigit() else "2030",
        )
    url = "https://movie.douban.com/j/new_search_subjects?" + urllib.parse.urlencode(params)
    key = "discover:" + urllib.parse.urlencode(params)
    cached = cache_read_json(key, API_TTL)
    if cached is not None:
        return cached
    payload = http_get_json(url, "https://movie.douban.com/explore")
    raw_items = payload.get("data") if isinstance(payload, dict) else None
    items = [normalize_subject(item) for item in (raw_items or []) if isinstance(item, dict)]
    items = [item for item in items if item["id"] and item["title"]]
    result = {"items": items, "hasMore": len(items) >= PAGE_SIZE, "start": int(params["start"])}
    cache_write_json(key, result)
    return result


def douban_search(query: dict[str, list[str]]) -> dict:
    keyword = (query.get("q") or [""])[0].strip()[:60]
    if not keyword:
        return {"items": [], "hasMore": False, "start": 0}
    start = str(max(0, int((query.get("start") or ["0"])[0] or 0)))
    params = {
        "type": "movie",
        "tag": keyword,
        "sort": "recommend",
        "page_limit": str(PAGE_SIZE),
        "page_start": start,
    }
    url = "https://movie.douban.com/j/search_subjects?" + urllib.parse.urlencode(params)
    key = "search:" + urllib.parse.urlencode(params)
    cached = cache_read_json(key, API_TTL)
    if cached is not None:
        return cached
    payload = http_get_json(url, "https://movie.douban.com/")
    raw_items = payload.get("subjects") if isinstance(payload, dict) else None
    items = [normalize_subject(item) for item in (raw_items or []) if isinstance(item, dict)]
    items = [item for item in items if item["id"] and item["title"]]
    result = {"items": items, "hasMore": len(items) >= PAGE_SIZE, "start": int(start)}
    cache_write_json(key, result)
    return result


def douban_detail(query: dict[str, list[str]]) -> dict:
    subject_id = (query.get("id") or [""])[0].strip()
    if not re.fullmatch(r"\d{4,12}", subject_id):
        raise ValueError("电影 id 不合法")
    key = "detail:" + subject_id
    cached = cache_read_json(key, API_TTL)
    if cached is not None:
        return cached
    url = "https://movie.douban.com/j/subject_abstract?subject_id=" + subject_id
    payload = http_get_json(url, "https://movie.douban.com/subject/" + subject_id + "/")
    subject = payload.get("subject") if isinstance(payload, dict) else None
    if not isinstance(subject, dict):
        raise ValueError("豆瓣没有返回该条目")
    result = normalize_detail(subject)
    cache_write_json(key, result)
    return result


POSTER_HOST_RE = re.compile(r"(^|\.)doubanio\.com$")


def poster_allowed(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    if not POSTER_HOST_RE.search(host):
        return False
    return parsed.path.startswith("/view/photo/")


POSTER_MIRRORS = ("img1.doubanio.com", "img2.doubanio.com", "img3.doubanio.com")


def fetch_poster(url: str) -> tuple[bytes, str] | None:
    """下载海报；豆瓣部分图片域名对非浏览器客户端返回反爬页面，换镜像域名重试。"""
    parsed = urllib.parse.urlparse(url)
    candidates = [url]
    for host in POSTER_MIRRORS:
        if host != parsed.hostname:
            candidates.append(urllib.parse.urlunparse(parsed._replace(netloc=host)))
    for candidate in candidates:
        try:
            body, content_type = http_get(candidate, "https://movie.douban.com/")
        except Exception:  # noqa: BLE001 单个镜像失败就换下一个
            continue
        mime = content_type.split(";")[0].strip()
        if mime.startswith("image/") and 0 < len(body) <= POSTER_MAX_BYTES:
            return body, mime
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeCalendar/2.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:  # 安静一点，只留错误
        if args and isinstance(args[0], str) and args[0].startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

    # ---------- 基础响应 ----------

    def send_bytes(self, status: int, body: bytes, content_type: str,
                   cache_control: str = "no-store", head_only: bool = False) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_control)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def send_json(self, status: int, payload: object, head_only: bool = False) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, body, "application/json; charset=utf-8", "no-store", head_only)

    # ---------- 路由 ----------

    def do_GET(self) -> None:  # noqa: N802
        self.handle_request(head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self.handle_request(head_only=True)

    def handle_request(self, head_only: bool) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if path.startswith("/api/movie/"):
                self.handle_api(path[len("/api/movie/"):], query, head_only)
            else:
                self.handle_static(path, head_only)
        except BrokenPipeError:
            pass

    def handle_api(self, action: str, query: dict[str, list[str]], head_only: bool) -> None:
        try:
            if action == "health":
                self.send_json(200, {"ok": True, "source": "douban", "version": 1}, head_only)
            elif action == "discover":
                self.send_json(200, douban_discover(query), head_only)
            elif action == "search":
                self.send_json(200, douban_search(query), head_only)
            elif action == "detail":
                self.send_json(200, douban_detail(query), head_only)
            elif action == "poster":
                self.handle_poster(query, head_only)
            else:
                self.send_json(404, {"error": "未知接口"}, head_only)
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)}, head_only)
        except urllib.error.HTTPError as exc:
            message = "豆瓣返回 %d" % exc.code
            if exc.code in (403, 418):
                message += "（请求过于频繁，稍后再试）"
            self.send_json(502, {"error": message}, head_only)
        except Exception as exc:  # noqa: BLE001 网络异常统一转成 502
            self.send_json(502, {"error": "豆瓣请求失败：%s" % exc}, head_only)

    def handle_poster(self, query: dict[str, list[str]], head_only: bool) -> None:
        url = (query.get("u") or [""])[0]
        if not poster_allowed(url):
            self.send_json(400, {"error": "只允许代理豆瓣图片"}, head_only)
            return
        path = cache_path("posters", url)
        if path.is_file():
            body = path.read_bytes()
            self.send_bytes(200, body, "image/jpeg", "public, max-age=604800, immutable", head_only)
            return
        fetched = fetch_poster(url)
        if not fetched:
            self.send_json(502, {"error": "海报下载失败"}, head_only)
            return
        body, content_type = fetched
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(body)
            os.replace(tmp, path)
        except OSError:
            pass
        self.send_bytes(200, body, content_type, "public, max-age=604800, immutable", head_only)

    def handle_static(self, path: str, head_only: bool) -> None:
        if path == "/":
            path = "/index.html"
        relative = path.lstrip("/")
        target = (BASE_DIR / relative).resolve()
        try:
            inside = os.path.commonpath([str(BASE_DIR), str(target)]) == str(BASE_DIR)
        except ValueError:
            inside = False
        if not inside:
            self.send_json(404, {"error": "not found"}, head_only)
            return
        if any(part.startswith(".") for part in target.relative_to(BASE_DIR).parts):
            self.send_json(404, {"error": "not found"}, head_only)
            return
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            self.send_json(404, {"error": "not found"}, head_only)
            return
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript", "image/svg+xml"):
            if "charset" not in content_type:
                content_type += "; charset=utf-8"
        suffix = target.suffix.lower()
        if suffix in (".html", ".js", ".css", ".json"):
            cache_control = "no-cache"
        else:
            cache_control = "public, max-age=86400"
        try:
            body = target.read_bytes()
        except OSError:
            self.send_json(404, {"error": "not found"}, head_only)
            return
        self.send_bytes(200, body, content_type, cache_control, head_only)


def main() -> int:
    parser = argparse.ArgumentParser(description="人生日历本地服务：静态站点 + 豆瓣电影代理")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，默认 127.0.0.1")
    parser.add_argument("--port", type=int, default=8765, help="端口，默认 8765")
    args = parser.parse_args()

    try:
        server = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as exc:
        sys.stderr.write("端口 %d 无法使用：%s\n" % (args.port, exc))
        return 1
    server.daemon_threads = True
    address = "http://%s:%d/" % ("127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host, args.port)
    print("人生日历已启动：%s" % address)
    print("找电影使用豆瓣电影片库（%s/api/movie/），海报会缓存在 .cache/。" % address.rstrip("/"))
    print("按 Ctrl+C 停止。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
