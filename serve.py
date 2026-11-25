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
import gzip
import hashlib
import html
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
import webbrowser
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

LOCAL_ORIGIN = re.compile(r"^(?:null|https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?)$", re.I)


def cors_origin(origin: str) -> str:
    """只把 /api/movie/ 开放给本机来源：file:// 打开时 Origin 为 null，也算本机。"""
    origin = (origin or "").strip()
    return origin if origin and LOCAL_ORIGIN.match(origin) else ""


def health_url(host: str, port: int) -> str:
    return "http://%s:%d/api/movie/health" % ("127.0.0.1" if host in ("0.0.0.0", "::") else host, port)


def running_instance(host: str, port: int) -> bool:
    """端口上是否已经有本服务在跑（重复双击启动脚本时复用）。"""
    request = urllib.request.Request(health_url(host, port), headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=1.5) as response:
            payload = json.loads(response.read(4096).decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError):
        return False
    return isinstance(payload, dict) and payload.get("source") == "douban"


class Throttle:
    """串行化豆瓣接口请求，避免短时间内触发风控。"""

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

    def __enter__(self) -> "Throttle":
        self.wait()
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False


# 豆瓣的 JSON / 条目页接口才需要限速；海报和条目页里的静态资源走图片 CDN，
# 共用一个 0.35 秒的串行队列会让一个条目页的 40 多个资源排到十几秒。
THROTTLE = Throttle(0.35)
MEDIA_SLOTS = threading.BoundedSemaphore(8)   # CDN 资源：并发 8，不限间隔


def http_get(url: str, referer: str, accept: str = "*/*",
             ua: str | None = None, lane: str = "api",
             timeout: float = 15) -> tuple[bytes, str]:
    """带重试的 GET，返回 (body, content_type)。

    lane="api" 走限速队列（豆瓣接口），lane="media" 只限制并发（图片 CDN）。
    """
    headers = {
        "User-Agent": ua or USER_AGENT,
        "Referer": referer,
        "Accept": accept,
        "Accept-Language": "zh-CN,zh;q=0.9",
    }
    last_error: Exception | None = None
    for attempt in range(3):
        request = urllib.request.Request(url, headers=headers)
        try:
            if lane == "media":
                with MEDIA_SLOTS:
                    with urllib.request.urlopen(request, timeout=timeout) as response:
                        return response.read(), response.headers.get("Content-Type", "")
            with THROTTLE:
                with urllib.request.urlopen(request, timeout=timeout) as response:
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


TITLE_NOISE_RE = re.compile(r"[\s·・:：,，.。!！?？'\"“”‘’()（）\[\]【】<>《》\-—_/\\|]+")
FALLBACK_SCAN_PAGES = 3


def title_key(text: str) -> str:
    return TITLE_NOISE_RE.sub("", text).lower()


def douban_search_by_title(keyword: str, start: int, query: dict[str, list[str]]) -> dict:
    """关键词搜索无结果时，回退到 discover 接口（new_search_subjects），按片名匹配召回。"""
    params = {
        "sort": DOUBAN_SORT.get((query.get("sort") or ["U"])[0].upper(), "U"),
        "range": "0,10",
        "tags": "",
        "keyword": keyword,
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
    key = "search-title:" + urllib.parse.urlencode(params)
    cached = cache_read_json(key, API_TTL)
    if cached is None:
        needle = title_key(keyword)
        matches: list[dict] = []
        seen: set[str] = set()
        page_start = 0
        for _ in range(FALLBACK_SCAN_PAGES):
            page_params = dict(params, start=str(page_start))
            url = "https://movie.douban.com/j/new_search_subjects?" + urllib.parse.urlencode(page_params)
            payload = http_get_json(url, "https://movie.douban.com/explore")
            raw_items = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(raw_items, list) or not raw_items:
                break
            for raw in raw_items:
                if not isinstance(raw, dict):
                    continue
                item = normalize_subject(raw)
                if not item["id"] or not item["title"] or item["id"] in seen:
                    continue
                if needle and needle not in title_key(item["title"]):
                    continue
                seen.add(item["id"])
                matches.append(item)
            if len(raw_items) < PAGE_SIZE:
                break
            page_start += PAGE_SIZE
        cached = {"matches": matches, "keyword": keyword}
        cache_write_json(key, cached)
    matches = cached.get("matches") or []
    items = matches[start:start + PAGE_SIZE]
    if matches:
        note = "关键词匹配为空，已按片名从豆瓣全库召回 %d 部" % len(matches)
    else:
        note = "关键词没有结果，豆瓣全库也没有片名包含「%s」的影片" % keyword
    return {
        "items": items,
        "hasMore": len(matches) > start + len(items),
        "start": start,
        "fallback": True,
        "note": note,
    }


def douban_search(query: dict[str, list[str]]) -> dict:
    keyword = (query.get("q") or [""])[0].strip()[:60]
    if not keyword:
        return {"items": [], "hasMore": False, "start": 0, "fallback": False}
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
        result = cached
    else:
        payload = http_get_json(url, "https://movie.douban.com/")
        raw_items = payload.get("subjects") if isinstance(payload, dict) else None
        items = [normalize_subject(item) for item in (raw_items or []) if isinstance(item, dict)]
        items = [item for item in items if item["id"] and item["title"]]
        result = {"items": items, "hasMore": len(items) >= PAGE_SIZE, "start": int(start), "fallback": False}
        cache_write_json(key, result)
    if result.get("items") or int(start) > 0:
        return result
    # 关键词接口无结果：回退到 discover 接口按片名召回（如《两京十五日》）。
    return douban_search_by_title(keyword, int(start), query)


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


def sniff_image_type(body: bytes) -> str:
    if body[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return "image/webp"
    if body[:3] == b"GIF":
        return "image/gif"
    return "image/jpeg"


# 记住哪些图片域名在反爬，后续请求直接跳过，不再每次都白等一次超时。
DOWN_HOSTS: dict[str, float] = {}
DOWN_TTL = 30 * 60


def host_down(host: str) -> bool:
    until = DOWN_HOSTS.get(host, 0)
    return until > time.time()


def fetch_poster(url: str) -> tuple[bytes, str] | None:
    """下载海报；豆瓣部分图片域名对非浏览器客户端返回反爬页面，换镜像域名重试。"""
    parsed = urllib.parse.urlparse(url)
    candidates = [url]
    for host in POSTER_MIRRORS:
        if host != parsed.hostname:
            candidates.append(urllib.parse.urlunparse(parsed._replace(netloc=host)))
    # 已知失效的域名排到最后，省掉一轮无谓的超时。
    candidates.sort(key=lambda item: host_down(urllib.parse.urlparse(item).hostname or ""))
    for candidate in candidates:
        host = urllib.parse.urlparse(candidate).hostname or ""
        if host_down(host):
            continue
        try:
            body, content_type = http_get(candidate, "https://movie.douban.com/",
                                          lane="media", timeout=8)
        except Exception:  # noqa: BLE001 单个镜像失败就换下一个
            DOWN_HOSTS[host] = time.time() + DOWN_TTL
            continue
        mime = content_type.split(";")[0].strip()
        if mime.startswith("image/") and 0 < len(body) <= POSTER_MAX_BYTES:
            return body, sniff_image_type(body)
        DOWN_HOSTS[host] = time.time() + DOWN_TTL
    return None


# ---------- 豆瓣条目页（在弹层里内嵌展示） ----------

# PC 版条目页会被 sec.douban.com 拦下，移动版可以直接拿到静态 HTML。
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
MOBILE_REFERER = "https://m.douban.com/"
PAGE_TTL = 6 * 60 * 60
PAGE_MAX_BYTES = 4 * 1024 * 1024
ASSET_MAX_BYTES = 8 * 1024 * 1024

DOUBANIO_HOST_RE = re.compile(r"^(?:[a-z0-9-]+\.)*doubanio\.com$", re.I)
DOUBANIO_URL_RE = re.compile(
    r"(?:https?:)?//((?:[a-z0-9-]+\.)*doubanio\.com)(/[^\s\"'<>()\\]*)", re.I)
CSS_URL_RE = re.compile(r"url\(\s*(['\"]?)([^'\")]+)\1\s*\)", re.I)
SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.I | re.S)
EMPTY_SCRIPT_RE = re.compile(r"<script\b[^>]*/>", re.I)
REFRESH_RE = re.compile(r"<meta[^>]+http-equiv=[\"']?refresh[\"']?[^>]*>", re.I)
HEAD_RE = re.compile(r"<head[^>]*>", re.I)


def asset_url(url: str, origin: str = "") -> str:
    # 页面里注入了 <base href="https://m.douban.com/…">，相对路径会被解析到豆瓣，
    # 所以内嵌页里的资源必须写成带本站 origin 的绝对地址。
    # 原文里的 &amp; 必须还原成 &，否则带签名的图片地址会 403。
    url = html.unescape(url)
    return origin + "/api/movie/asset?u=" + urllib.parse.quote(url, safe="")


def asset_allowed(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        return False
    return bool(DOUBANIO_HOST_RE.match(parsed.hostname or ""))


def rewrite_douban_page(html: str, base: str, origin: str = "") -> str:
    """把豆瓣条目页变成可以内嵌的静态页：去脚本、资源走本地代理。"""
    html = SCRIPT_RE.sub("", html)
    html = EMPTY_SCRIPT_RE.sub("", html)
    html = REFRESH_RE.sub("", html)

    def repl(match: re.Match) -> str:
        url = match.group(0)
        if url.startswith("//"):
            url = "https:" + url
        return asset_url(url, origin)

    html = DOUBANIO_URL_RE.sub(repl, html)
    # 页面里的脚本已删除，内联事件处理器（例如 ga(...)）只会报错。
    html = re.sub(r"\son[a-z]+=\"[^\"]*\"", "", html, flags=re.I)
    html = re.sub(r"\son[a-z]+='[^']*'", "", html, flags=re.I)
    # 去掉「下载豆瓣 App」横幅，剩下的是条目正文。
    html = re.sub(r"</head>",
                  "<style>.subject-banner,.promo_top_banner,.vendor-go-app{"
                  "display:none !important}</style></head>", html, count=1, flags=re.I)
    if "<base" not in html.lower():
        html = HEAD_RE.sub(
            lambda m: m.group(0) + '<base href="%s">' % base, html, count=1)
    return html


def rewrite_css(css: str, base: str) -> str:
    def repl(match: re.Match) -> str:
        raw = match.group(2).strip()
        if raw.startswith(("data:", "blob:", "#")):
            return match.group(0)
        absolute = urllib.parse.urljoin(base, raw)
        if not asset_allowed(absolute):
            return match.group(0)
        return 'url("%s")' % asset_url(absolute)

    return CSS_URL_RE.sub(repl, css)


def douban_page(subject_id: str, origin: str = "") -> str:
    path = cache_path("pages", subject_id)
    html = ""
    try:
        if path.is_file() and time.time() - path.stat().st_mtime <= PAGE_TTL:
            html = path.read_text("utf-8")
    except OSError:
        html = ""
    base = "https://m.douban.com/movie/subject/%s/" % subject_id
    if not html:
        body, content_type = http_get(
            base, MOBILE_REFERER, accept="text/html,application/xhtml+xml", ua=MOBILE_UA)
        if "text/html" not in content_type and "text/html" not in body[:200].decode(
                "utf-8", "replace"):
            raise ValueError("豆瓣没有返回条目页面")
        html = body[:PAGE_MAX_BYTES].decode("utf-8", "replace")
        if len(html) < 3000 or "sec.douban.com" in html:
            raise ValueError("豆瓣返回了安全校验页，稍后再试")
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(html, "utf-8")
            os.replace(tmp, path)
        except OSError:
            pass
    # 原始页面进缓存，重写（含本站 origin）每次请求都做，端口变化也不会留下坏链接。
    return rewrite_douban_page(html, base, origin)


def page_error_html(subject_id: str, message: str) -> str:
    link = "https://movie.douban.com/subject/%s/" % subject_id
    return (
        "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
        "<title>豆瓣条目加载失败</title><style>"
        "body{margin:0;padding:34px 22px;background:#fff;color:#333;"
        "font:14px/1.7 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;}"
        "h1{margin:0 0 10px;font-size:16px;font-weight:600;}"
        "p{margin:0 0 8px;color:#777;}"
        "a{color:#42bd56;text-decoration:none;}"
        "</style></head><body><h1>豆瓣条目暂时打不开</h1>"
        "<p>%s</p><p><a href=\"%s\" target=\"_blank\" rel=\"noopener\">在豆瓣打开这一页 ↗</a></p>"
        "</body></html>" % (message.replace("<", "&lt;"), link)
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeCalendar/2.0"
    protocol_version = "HTTP/1.1"


    def log_message(self, fmt: str, *args) -> None:  # 安静一点，只留错误
        if args and isinstance(args[0], str) and args[0].startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

    # ---------- 基础响应 ----------

    def send_bytes(self, status: int, body: bytes, content_type: str,
                   cache_control: str = "no-store", head_only: bool = False,
                   compress: bool = False, extra: dict[str, str] | None = None) -> None:
        encoding = ""
        # 条目页 HTML 和 CSS 体积不小，压缩后首屏明显更快。
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
        origin = getattr(self, "cors", "")
        if origin:
            # 页面由 file:// 或别的本地端口打开时，找电影也能直连这个服务。
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def send_json(self, status: int, payload: object, head_only: bool = False) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, body, "application/json; charset=utf-8", "no-store",
                        head_only, compress=True)

    # ---------- 路由 ----------

    def do_GET(self) -> None:  # noqa: N802
        self.handle_request(head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self.handle_request(head_only=True)

    def handle_request(self, head_only: bool) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)
        self.cors = cors_origin(self.headers.get("Origin", "")) if path.startswith("/api/movie/") else ""
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
            elif action == "page":
                self.handle_page(query, head_only)
            elif action == "stop":
                self.handle_stop(head_only)
            elif action == "asset":
                self.handle_asset(query, head_only)
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
            self.send_bytes(200, body, sniff_image_type(body),
                            "public, max-age=604800, immutable", head_only)
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

    def handle_page(self, query: dict[str, list[str]], head_only: bool) -> None:
        subject_id = (query.get("id") or [""])[0].strip()
        if not re.fullmatch(r"\d{4,12}", subject_id):
            self.send_bytes(400, page_error_html("0", "电影 id 不合法").encode("utf-8"),
                            "text/html; charset=utf-8", "no-store", head_only)
            return
        try:
            origin = "http://" + (self.headers.get("Host") or "127.0.0.1:8765")
            html = douban_page(subject_id, origin)
        except urllib.error.HTTPError as exc:
            html = page_error_html(subject_id, "豆瓣返回 %d。" % exc.code)
        except Exception as exc:  # noqa: BLE001 页面打不开时给出可点击的兜底
            html = page_error_html(subject_id, "原因：%s" % exc)
        # 页面内资源已经是本站绝对地址，同一端口下可以让浏览器缓存几分钟，
        # 再次点开同一部电影时直接命中缓存，不用重新请求。
        self.send_bytes(200, html.encode("utf-8"), "text/html; charset=utf-8",
                        "private, max-age=300", head_only, compress=True)

    def handle_stop(self, head_only: bool) -> None:
        """无控制台启动（pythonw）时，用这个接口优雅停掉本地服务。"""
        remote = self.client_address[0] if self.client_address else ""
        if remote not in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
            self.send_json(403, {"error": "只允许本机停止服务"}, head_only)
            return
        self.send_json(200, {"ok": True, "stopping": True}, head_only)
        threading.Timer(0.2, shutdown_server).start()

    def handle_asset(self, query: dict[str, list[str]], head_only: bool) -> None:
        url = html.unescape((query.get("u") or [""])[0])
        if not asset_allowed(url):
            self.send_json(400, {"error": "只允许代理豆瓣静态资源"}, head_only)
            return
        path = cache_path("assets", url)
        body: bytes | None = None
        content_type = mimetypes.guess_type(urllib.parse.urlparse(url).path)[0] or ""
        try:
            if path.is_file():
                body = path.read_bytes()
            else:
                fetched, header_type = http_get(
                    url, MOBILE_REFERER, accept="*/*", ua=MOBILE_UA,
                    lane="media", timeout=10)
                if len(fetched) > ASSET_MAX_BYTES:
                    raise ValueError("资源过大")
                body = fetched
                content_type = header_type.split(";")[0].strip() or content_type
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    tmp = path.with_suffix(".tmp")
                    tmp.write_bytes(body)
                    os.replace(tmp, path)
                except OSError:
                    pass
        except Exception as exc:  # noqa: BLE001 单个资源失败不影响整页
            self.send_json(502, {"error": "资源加载失败：%s" % exc}, head_only)
            return
        is_css = "css" in content_type or url.lower().split("?")[0].endswith(".css")
        if is_css:
            css = rewrite_css(body.decode("utf-8", "replace"), url)
            body = css.encode("utf-8")
            content_type = "text/css; charset=utf-8"
        self.send_bytes(200, body, content_type or "application/octet-stream",
                        "public, max-age=86400", head_only, compress=is_css)

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
            stat = target.stat()
        except OSError:
            self.send_json(404, {"error": "not found"}, head_only)
            return
        # 浏览器刷新时用 ETag 换 304，不必重新下载 vditor 等大文件。
        etag = '"%x-%x"' % (int(stat.st_mtime * 1000), stat.st_size)
        if (self.headers.get("If-None-Match") or "").strip() == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", cache_control)
            self.send_header("Vary", "Accept-Encoding")
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
LOG_DIR = BASE_DIR / ".run"


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


def open_browser(address: str) -> None:
    try:
        webbrowser.open(address)
    except Exception as exc:  # noqa: BLE001 打不开浏览器不影响服务
        sys.stderr.write("无法自动打开浏览器（%s），请手动访问 %s\n" % (exc, address))


def main() -> int:
    setup_stdio()
    global SERVER
    parser = argparse.ArgumentParser(description="人生日历本地服务：静态站点 + 豆瓣电影代理")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，默认 127.0.0.1")
    parser.add_argument("--port", type=int, default=8765, help="端口，默认 8765")
    parser.add_argument("--no-browser", action="store_true", help="启动后不自动打开浏览器")
    args = parser.parse_args()

    address = "http://%s:%d/" % ("127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host, args.port)

    if running_instance(args.host, args.port):
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
    print("找电影使用豆瓣电影片库（%s/api/movie/），海报会缓存在 .cache/。" % address.rstrip("/"))
    print("按 Ctrl+C 停止。")
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
