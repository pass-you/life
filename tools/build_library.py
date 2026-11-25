#!/usr/bin/env python3
"""把豆瓣「找电影」结果抓成站点自带的静态片库。

静态托管（GitHub Pages）里网页既不能跨域请求豆瓣，也不能外链豆瓣海报，
所以片库必须提前抓成同源 JSON + 本地海报：打开网页即可用，无需本地服务。

数据源是豆瓣老接口 j/search_subjects（按 tag 筛选、每页 100 条）
+ 移动版 rexxar 条目接口（补年份 / 类型 / 地区 / 导演 / 主演 / 短评）。

分步执行，都可断点续跑（缓存放在 .cache/library/）：
    python tools/build_library.py discover
    python tools/build_library.py details --max 400
    python tools/build_library.py posters --max 400
    python tools/build_library.py pack
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "library"
DETAIL_DIR = CACHE / "detail"
POSTER_DIR = ROOT / "assets" / "library" / "p"
OUT = ROOT / "assets" / "library" / "movies.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
MOBILE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
             "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")

PER_TAG = 200            # 每个筛选条件抓多少部（年代更深，见 DECADE_PER_TAG）
DECADE_PER_TAG = 500     # 年代标签总量少，多抓一些，减少组合筛选落空
PAGE_LIMIT = 100         # 该接口一次最多 100
DELAY = 0.35

GENRE_TAGS = ["喜剧", "爱情", "动作", "科幻", "动画", "悬疑", "惊悚", "恐怖", "犯罪", "同性",
              "音乐", "歌舞", "传记", "历史", "战争", "西部", "奇幻", "冒险", "灾难", "武侠",
              "情色", "剧情"]

# 豆瓣 tag → 站内筛选标签（中国大陆/中国香港/中国台湾 在豆瓣是「大陆/香港/台湾」）
REGION_TAGS = {
    "华语": "华语", "欧美": "欧美", "韩国": "韩国", "日本": "日本",
    "大陆": "中国大陆", "香港": "中国香港", "台湾": "中国台湾",
    "美国": "美国", "英国": "英国", "法国": "法国", "德国": "德国",
    "意大利": "意大利", "西班牙": "西班牙", "印度": "印度", "泰国": "泰国",
    "俄罗斯": "俄罗斯", "加拿大": "加拿大", "澳大利亚": "澳大利亚",
    "爱尔兰": "爱尔兰", "瑞典": "瑞典", "巴西": "巴西", "丹麦": "丹麦",
}

# 豆瓣「2020年代」标签为空，用年份 tag 合成。
DECADE_TAGS = [("2020年代", ["2020", "2021", "2022", "2023", "2024", "2025", "2026"]),
               ("2010年代", ["2010年代"]), ("2000年代", ["2000年代"]),
               ("1990年代", ["1990年代"]), ("1980年代", ["1980年代"]),
               ("1970年代", ["1970年代"]), ("1960年代", ["1960年代"]),
               ("1950年代", ["1950年代"]), ("更早", ["更早"])]

TOP_TAGS = ["热门", "最新", "豆瓣高分", "冷门佳片"]

# 移动版列表一次返回 50 部完整卡片（年份 / 地区 / 类型 / 导演 / 演员），
# 用它补详情比逐条请求条目接口省 50 倍请求，也避开 subject_ip_rate_limit。
CARD_SORTS = [("S", 3000), ("U", 1500), ("T", 1500)]
CARD_PAGE = 50

_last = [0.0]


def throttle() -> None:
    wait = DELAY - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()


def http_get(url: str, referer: str, ua: str = UA, retries: int = 3) -> bytes:
    last_error = None
    for attempt in range(retries):
        throttle()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua, "Referer": referer})
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.read()
        except Exception as error:  # noqa: BLE001 网络错误统一退避重试
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("请求失败 %s：%s" % (url, last_error))


def get_json(url: str, referer: str, ua: str = UA) -> object:
    return json.loads(http_get(url, referer, ua).decode("utf-8"))


def tag_page(tag: str, start: int) -> list[dict]:
    params = {"type": "movie", "page_limit": str(PAGE_LIMIT), "page_start": str(start),
              "sort": "rank", "tag": tag}
    url = "https://movie.douban.com/j/search_subjects?" + urllib.parse.urlencode(params)
    payload = get_json(url, "https://movie.douban.com/")
    rows = payload.get("subjects") if isinstance(payload, dict) else None
    return [row for row in (rows or []) if isinstance(row, dict)]


def tasks() -> list[tuple[str, str, str, int]]:
    """(抓取 tag, 站内标签, 分组说明, 抓取上限)"""
    out = []
    for tag in TOP_TAGS:
        out.append((tag, "总榜", tag, PER_TAG))
    for tag in GENRE_TAGS:
        out.append((tag, tag, "类型:" + tag, PER_TAG))
    for tag, label in REGION_TAGS.items():
        out.append((tag, label, "地区:" + label, PER_TAG))
    for label, tags in DECADE_TAGS:
        for tag in tags:
            out.append((tag, label, "年代:" + label, DECADE_PER_TAG))
    return out


def cmd_discover(_args: argparse.Namespace) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    items_path = CACHE / "items.jsonl"
    seen: dict[str, dict] = {}
    if items_path.exists():
        for line in items_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if item.get("id"):
                # 旧版本缓存用的是 facets 字段，标签体系也不同，迁移成 tags 继续用。
                if "tags" not in item:
                    tags = []
                    for facet in item.pop("facets", []):
                        label = facet.rsplit(":", 1)[-1]
                        if label and label not in tags:
                            tags.append(label)
                    item["tags"] = tags
                item.setdefault("directors", [])
                item.setdefault("casts", [])
                seen[item["id"]] = item

    all_tasks = tasks()
    for index, (tag, label, facet, depth) in enumerate(all_tasks, 1):
        added = 0
        for start in range(0, depth, PAGE_LIMIT):
            try:
                rows = tag_page(tag, start)
            except Exception as error:  # noqa: BLE001 单个 tag 失败不影响整体
                print("  %s start=%d 失败：%s" % (tag, start, error), flush=True)
                continue
            if not rows:
                break
            for row in rows:
                sid = str(row.get("id") or "").strip()
                if not sid or not row.get("title"):
                    continue
                item = seen.get(sid)
                if item is None:
                    item = {"id": sid, "title": row.get("title") or "",
                            "rating": row.get("rate") or "", "cover": row.get("cover") or "",
                            "directors": [], "casts": [], "tags": []}
                    seen[sid] = item
                    added += 1
                if label not in item["tags"]:
                    item["tags"].append(label)
        print("[%d/%d] %s（%s）+%d → 共 %d 部"
              % (index, len(all_tasks), facet, tag, added, len(seen)), flush=True)

    items_path.write_text(
        "\n".join(json.dumps(item, ensure_ascii=False) for item in seen.values()),
        encoding="utf-8")
    print("discover 完成：%d 部 -> %s" % (len(seen), items_path), flush=True)


def clean_intro(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = text.replace("\u00a0", " ")
    # 条目简介后半段常跟着「©豆瓣」「剧照」「预告片」等噪音，只留正文段落。
    text = re.split(r"\n\s*©豆瓣|© 豆瓣", text)[0]
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line and not re.match(r"^[（(]?剧照|^预告片|^图片\d*$", line)]
    text = re.sub(r"\s+\n", "\n", "\n".join(lines)).strip()
    return text[:400]


def cmd_details(args: argparse.Namespace) -> None:
    items_path = CACHE / "items.jsonl"
    if not items_path.exists():
        raise SystemExit("先跑 discover")
    items = [json.loads(line) for line in items_path.read_text(encoding="utf-8").splitlines()
             if line.strip()]
    DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    pending = [item for item in items if not (DETAIL_DIR / (item["id"] + ".json")).exists()]
    limit = args.max or len(pending)
    print("detail 待抓 %d / 共 %d，本批 %d" % (len(pending), len(items), min(limit, len(pending))),
          flush=True)
    done = 0
    for item in pending[:limit]:
        sid = item["id"]
        try:
            payload = get_json("https://m.douban.com/rexxar/api/v2/movie/" + sid,
                               "https://m.douban.com/movie/subject/%s/" % sid, MOBILE_UA)
        except Exception as error:  # noqa: BLE001 单条失败不影响整批
            print("  跳过 %s：%s" % (sid, error), flush=True)
            continue
        rating = payload.get("rating") if isinstance(payload.get("rating"), dict) else {}
        record = {
            "id": sid,
            "title": payload.get("title") or item["title"],
            "year": str(payload.get("year") or ""),
            "rating": rating.get("value") or item.get("rating") or "",
            "genres": [x for x in (payload.get("genres") or []) if isinstance(x, str)][:6],
            "countries": [x for x in (payload.get("countries") or []) if isinstance(x, str)][:4],
            "duration": (payload.get("durations") or [""])[0] if payload.get("durations") else "",
            "directors": [x.get("name") for x in (payload.get("directors") or [])
                          if isinstance(x, dict) and x.get("name")][:4],
            "casts": [x.get("name") for x in (payload.get("actors") or [])
                      if isinstance(x, dict) and x.get("name")][:12],
            "summary": clean_intro(payload.get("intro") or ""),
            "cover": item.get("cover") or "",
        }
        (DETAIL_DIR / (sid + ".json")).write_text(
            json.dumps(record, ensure_ascii=False), encoding="utf-8")
        done += 1
        if done % 25 == 0:
            print("  detail %d/%d（本批）" % (done, min(limit, len(pending))), flush=True)
    left = len(pending) - done
    print("detail 完成：本批 %d 条，剩余 %d 条" % (done, max(0, left)), flush=True)


def split_card(card: str) -> list[str]:
    return [part.strip() for part in str(card or "").split(" / ")]


def cmd_cards(_args: argparse.Namespace) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    out_path = CACHE / "cards.jsonl"
    seen: dict[str, dict] = {}
    if out_path.exists():
        for line in out_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("id"):
                    seen[row["id"]] = row

    for sort, limit in CARD_SORTS:
        start = 0
        added = 0
        while start < limit:
            url = ("https://m.douban.com/rexxar/api/v2/movie/tag?tags=&start=%d&count=%d&sort=%s"
                   % (start, CARD_PAGE, sort))
            try:
                payload = get_json(url, "https://m.douban.com/movie/", MOBILE_UA)
            except Exception as error:  # noqa: BLE001
                print("  sort=%s start=%d 失败：%s" % (sort, start, error), flush=True)
                break
            rows = payload.get("data") or []
            if not rows:
                break
            for row in rows:
                sid = str(row.get("id") or "").strip()
                if not sid or not row.get("title"):
                    continue
                if sid in seen:
                    continue
                parts = split_card(row.get("card_subtitle") or "")
                rating = row.get("rating") if isinstance(row.get("rating"), dict) else {}
                seen[sid] = {
                    "id": sid,
                    "title": row.get("title") or "",
                    "year": str(row.get("year") or (parts[0] if parts and parts[0].isdigit() else "")),
                    "rating": rating.get("value") or 0,
                    "votes": rating.get("count") or 0,
                    "genres": [x for x in (row.get("genres") or []) if isinstance(x, str)][:6],
                    # card_subtitle 形如「1984 / 英国 / 喜剧 / 导演 / 演员」
                    "regions": [parts[1]] if len(parts) > 1 and parts[1] else [],
                    "directors": [x.get("name") for x in (row.get("directors") or [])
                                  if isinstance(x, dict) and x.get("name")][:4],
                    "casts": [x.get("name") for x in (row.get("actors") or [])
                              if isinstance(x, dict) and x.get("name")][:12],
                    "cover": row.get("cover_url") or "",
                }
                added += 1
            start += len(rows)
            if len(rows) < CARD_PAGE:
                break
        print("cards sort=%s 完成：新增 %d，累计 %d" % (sort, added, len(seen)), flush=True)

    out_path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in seen.values()),
                        encoding="utf-8")
    print("cards 完成：%d 部 -> %s" % (len(seen), out_path), flush=True)


def cmd_posters(args: argparse.Namespace) -> None:
    from concurrent.futures import ThreadPoolExecutor
    from PIL import Image

    items_path = CACHE / "items.jsonl"
    if not items_path.exists():
        raise SystemExit("先跑 discover")
    items = [json.loads(line) for line in items_path.read_text(encoding="utf-8").splitlines()
             if line.strip()]
    covers = {item["id"]: item.get("cover") or "" for item in items}
    cards_path = CACHE / "cards.jsonl"
    if cards_path.exists():
        for line in cards_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("id") and not covers.get(row["id"]):
                covers[row["id"]] = row.get("cover") or ""

    POSTER_DIR.mkdir(parents=True, exist_ok=True)
    pending = [sid for sid, url in covers.items()
               if url and not (POSTER_DIR / (sid + ".webp")).exists()]
    limit = args.max or len(pending)
    todo = pending[:limit]
    print("poster 待抓 %d / 共 %d，本批 %d" % (len(pending), len(covers), len(todo)), flush=True)

    stats = {"ok": 0, "fail": 0}

    def one(sid: str) -> None:
        try:
            raw = http_get(covers[sid], "https://movie.douban.com/")
            image = Image.open(io.BytesIO(raw)).convert("RGB")
            width = 168
            height = max(1, round(image.height * width / image.width))
            image = image.resize((width, height), Image.LANCZOS)
            image.save(POSTER_DIR / (sid + ".webp"), "WEBP", quality=72, method=4)
            stats["ok"] += 1
        except Exception:  # noqa: BLE001 单张失败不影响整批
            stats["fail"] += 1
        total = stats["ok"] + stats["fail"]
        if total % 100 == 0:
            print("  poster %d/%d（失败 %d）" % (total, len(todo), stats["fail"]), flush=True)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, todo))
    print("poster 完成：成功 %d，失败 %d" % (stats["ok"], stats["fail"]), flush=True)


def cmd_pack(_args: argparse.Namespace) -> None:
    items = [json.loads(line) for line in
             (CACHE / "items.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    cards: dict[str, dict] = {}
    cards_path = CACHE / "cards.jsonl"
    if cards_path.exists():
        for line in cards_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                if row.get("id"):
                    cards[row["id"]] = row

    movies = []
    seen = set()
    for item in items:
        sid = item["id"]
        card = cards.get(sid) or {}
        try:
            rating = round(float(str(card.get("rating") or item.get("rating") or 0) or 0), 1)
        except ValueError:
            rating = 0.0
        if rating > 10:
            rating = 0.0
        regions = card.get("regions") or []
        movies.append({
            "id": sid,
            "title": card.get("title") or item["title"],
            "year": card.get("year") or "",
            "rating": rating,
            "genres": card.get("genres") or [],
            "region": regions[0] if regions else "",
            "duration": card.get("duration") or "",
            "directors": card.get("directors") or [],
            "casts": card.get("casts") or [],
            "summary": card.get("summary") or "",
            "poster": (sid + ".webp") if (POSTER_DIR / (sid + ".webp")).exists() else "",
            "tags": item.get("tags") or [],
        })
        seen.add(sid)
    # 移动版列表里额外抓到的片子（不在 tag 集合里）也保留，按类型标签兜底。
    for sid, card in cards.items():
        if sid in seen:
            continue
        try:
            rating = round(float(str(card.get("rating") or 0) or 0), 1)
        except ValueError:
            rating = 0.0
        regions = card.get("regions") or []
        movies.append({
            "id": sid,
            "title": card.get("title") or "",
            "year": card.get("year") or "",
            "rating": 0.0 if rating > 10 else rating,
            "genres": card.get("genres") or [],
            "region": regions[0] if regions else "",
            "duration": card.get("duration") or "",
            "directors": card.get("directors") or [],
            "casts": card.get("casts") or [],
            "summary": card.get("summary") or "",
            "poster": (sid + ".webp") if (POSTER_DIR / (sid + ".webp")).exists() else "",
            "tags": list(card.get("genres") or []),
        })

    movies.sort(key=lambda row: (-row["rating"], row["title"]))
    payload = {"generated": time.strftime("%Y-%m-%d"), "count": len(movies), "movies": movies}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    with_poster = sum(1 for row in movies if row["poster"])
    with_year = sum(1 for row in movies if row["year"])
    print("pack 完成：%d 部（海报 %d，有年份 %d），%.1f KB -> %s"
          % (len(movies), with_poster, with_year, OUT.stat().st_size / 1024, OUT), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="构建站点自带电影片库")
    parser.add_argument("step", choices=["discover", "cards", "details", "posters", "pack"])
    parser.add_argument("--max", type=int, default=0, help="本批最多处理多少条")
    args = parser.parse_args()
    {"discover": cmd_discover, "cards": cmd_cards, "details": cmd_details,
     "posters": cmd_posters, "pack": cmd_pack}[args.step](args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
