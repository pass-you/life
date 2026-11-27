#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人生日历 · 桌面壳

把网页（index.html + assets/）包成 Windows 桌面应用：
  - 内嵌静态服务（127.0.0.1 随机端口，逻辑沿用 serve.py）
  - pywebview(Edge WebView2) 渲染窗口
  - LifeBridge：给网页的原生能力桥（文件选择/读写/自更新）

启动参数：
  python main.py                      正常启动
  python main.py --cleanup A B        启动前清理更新残留（旧目录、临时安装包）
"""

from __future__ import annotations

import argparse
import gzip
import json
import mimetypes
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_NAME = "人生日历"
APP_ID = "LifeCalendar"

# pywebview 在 Windows 依赖 .NET Framework 4.7.2+（pythonnet + WinForms）。
# 启动前做一次版本检测，缺失时给出中文说明而不是英文崩溃弹窗。
MIN_NETFX_RELEASE = 461808  # .NET Framework 4.7.2


def _webview():
    """惰性导入：pythonnet 会在这里加载 .NET，失败由 main() 统一提示。"""
    import webview

    return webview

VERSION = "0.0.0"
VERSION_URL = "https://pass-you.github.io/life/release/version.json"

# 资源目录：PyInstaller onedir 把 datas 放进 _internal（sys._MEIPASS），
# 只认 exe 同级目录会读不到 index.html；源码运行时在项目根。
if getattr(sys, "frozen", False):
    RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", None) or Path(sys.executable).resolve().parent)
    VERSION_FILE = RESOURCE_DIR / "version.json"
else:
    RESOURCE_DIR = Path(__file__).resolve().parent.parent
    VERSION_FILE = Path(__file__).resolve().parent / "version.json"

if VERSION_FILE.is_file():
    try:
        VERSION = json.loads(VERSION_FILE.read_text(encoding="utf-8"))["version"]
    except Exception:
        pass

CONFIG_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / APP_ID
CONFIG_FILE = CONFIG_DIR / "config.json"


def load_config() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_config(cfg: dict) -> None:
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


# ---------------- 内嵌静态服务（沿 serve.py 的实现） ----------------

LOCAL_ORIGIN = "null"


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeCalendarDesktop/" + VERSION
    protocol_version = "HTTP/1.1"
    base_dir: Path = RESOURCE_DIR

    def log_message(self, fmt, *args) -> None:  # noqa: N802
        if args and isinstance(args[0], str) and args[0].startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/":
            path = "/index.html"
        target = (self.base_dir / path.lstrip("/")).resolve()
        try:
            inside = os.path.commonpath([str(self.base_dir), str(target)]) == str(self.base_dir)
        except ValueError:
            inside = False
        if not inside:
            self.send_json(404, {"error": "not found"})
            return
        if not target.is_file():
            self.send_json(404, {"error": "not found"})
            return
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript", "image/svg+xml"):
            if "charset" not in content_type:
                content_type += "; charset=utf-8"
        try:
            body = target.read_bytes()
            stat = target.stat()
        except OSError:
            self.send_json(404, {"error": "not found"})
            return
        etag = '"%x-%x"' % (int(stat.st_mtime * 1000), stat.st_size)
        if (self.headers.get("If-None-Match") or "").strip() == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Vary", "Accept-Encoding")
            self.end_headers()
            return
        compressible = content_type.startswith("text/") or content_type in ("application/javascript", "image/svg+xml")
        encoding = ""
        if compressible and len(body) > 1024 and "gzip" in (self.headers.get("Accept-Encoding") or ""):
            body = gzip.compress(body, 6)
            encoding = "gzip"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("ETag", etag)
        if encoding:
            self.send_header("Content-Encoding", encoding)
            self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"

    def server_bind(self) -> None:
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def start_server(preferred_port: int = 0) -> tuple[ThreadingHTTPServer, str]:
    """优先占用固定端口；被占用时退回随机端口，保证总能启动。"""
    ports = [preferred_port] if preferred_port else []
    ports.append(0)
    server = None
    last_error: OSError | None = None
    for port in ports:
        try:
            server = LocalServer(("127.0.0.1", port), Handler)
            break
        except OSError as exc:
            last_error = exc
    if server is None:
        raise last_error or OSError("无法绑定本地端口")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, "http://127.0.0.1:%d/" % server.server_address[1]


# ---------------- 原生桥 ----------------

def result(ok: bool = True, **kw) -> str:
    payload = {"ok": ok}
    payload.update(kw)
    return json.dumps(payload, ensure_ascii=False)


class Bridge:
    """网页调用 window.pywebview.api.request(method, argsJson)。"""

    def __init__(self, window_holder: dict):
        self.window_holder = window_holder  # {"window": webview 窗口对象}
        self.saved_path: str = ""

    def request(self, method: str, args_json: str) -> str:
        try:
            args = json.loads(args_json or "{}")
        except ValueError:
            args = {}
        handler = getattr(self, "op_" + method, None)
        if handler is None:
            return result(False, error="未知操作 " + method)
        try:
            return handler(args)
        except Exception as exc:  # noqa: BLE001 桥内任何异常都转成 JSON 错误
            return result(False, error=str(exc) or "操作失败")

    # ---- 基础信息 ----

    def op_info(self, args) -> str:
        return result(platform="desktop", version=VERSION, app=APP_NAME)

    # ---- 文件 ----

    def _window(self):
        return self.window_holder.get("window")

    def op_pick_save_location(self, args) -> str:
        default_name = args.get("defaultName") or "人生日历.md"
        window = self._window()
        if window is None:
            return result(False, error="窗口未就绪")
        # SAVE_DIALOG 的 save_filename 才是默认文件名参数
        paths = window.create_file_dialog(
            _webview().FileDialog.SAVE, save_filename=default_name,
            file_types=("Markdown (*.md;*.markdown)", "所有文件 (*.*)"))
        if not paths:
            return result(canceled=True)
        path = paths if isinstance(paths, str) else paths[0]
        if not path.lower().endswith((".md", ".markdown")):
            path += ".md"
        self.saved_path = path
        return result(name=Path(path).name, path=path)

    def op_open_file(self, args) -> str:
        window = self._window()
        if window is None:
            return result(False, error="窗口未就绪")
        paths = window.create_file_dialog(
            _webview().FileDialog.OPEN, allow_multiple=False,
            file_types=("Markdown (*.md;*.markdown;*.txt)", "所有文件 (*.*)"))
        if not paths:
            return result(canceled=True)
        path = paths if isinstance(paths, str) else paths[0]
        try:
            data = Path(path).read_bytes()
        except OSError as exc:
            return result(False, error="读取失败：" + str(exc))
        if len(data) > 5 * 1024 * 1024:
            return result(False, error="文件超过 5 MB")
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("utf-8", "replace")
        self.saved_path = path
        cfg = load_config()
        cfg["file"] = path
        save_config(cfg)
        return result(name=Path(path).name, text=text)

    def op_write_file(self, args) -> str:
        if not self.saved_path:
            return result(False, error="尚未选择保存位置")
        text = args.get("text")
        if not isinstance(text, str):
            return result(False, error="写入内容为空")
        tmp = self.saved_path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
            os.replace(tmp, self.saved_path)
        except OSError as exc:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            return result(False, error="写入失败：" + str(exc))
        cfg = load_config()
        cfg["file"] = self.saved_path
        save_config(cfg)
        return result()

    def _release_url(self, relative_or_url: str) -> str:
        if relative_or_url.startswith("http"):
            return urllib.parse.quote(relative_or_url, safe=":/?#[]@!$&'()*+,;=%")
        base = "https://pass-you.github.io/life/release/"
        return base + urllib.parse.quote(relative_or_url.rsplit("/", 1)[-1])

    def op_restore_saved_file(self, args) -> str:
        path = self.saved_path or load_config().get("file") or ""
        if not path or not Path(path).is_file():
            return result(none=True)
        try:
            data = Path(path).read_bytes()
        except OSError:
            return result(none=True)
        if len(data) > 5 * 1024 * 1024:
            return result(none=True)
        self.saved_path = path
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("utf-8", "replace")
        return result(name=Path(path).name, text=text)

    def op_clear_saved_file(self, args) -> str:
        self.saved_path = ""
        cfg = load_config()
        cfg.pop("file", None)
        save_config(cfg)
        return result()

    # ---- 更新 ----

    def _fetch_version_manifest(self) -> dict | None:
        request = urllib.request.Request(
            VERSION_URL, headers={"User-Agent": "LifeCalendar/" + VERSION})
        with urllib.request.urlopen(request, timeout=10) as response:
            data = response.read()
        return json.loads(data.decode("utf-8"))

    def op_check_update(self, args) -> str:
        try:
            manifest = self._fetch_version_manifest()
        except Exception as exc:  # noqa: BLE001 网络问题不算软件错误
            return result(False, error="检查更新失败：" + str(exc))
        latest = str(manifest.get("version", "0"))
        has_update = compare_version(latest, VERSION) > 0
        win = manifest.get("windows") or {}
        return result(hasUpdate=has_update, current=VERSION, latest=latest,
                      notes=manifest.get("notes", ""), size=win.get("size", 0))

    def op_apply_update(self, args) -> str:
        try:
            return self._apply_update()
        except Exception as exc:  # noqa: BLE001
            return result(False, error="更新失败：" + str(exc))

    def _apply_update(self) -> str:
        manifest = self._fetch_version_manifest()
        win = manifest.get("windows") or {}
        url = win.get("url")
        if not url:
            raise RuntimeError("版本清单缺少 Windows 安装包地址")
        url = self._release_url(url)

        expected = win.get("sha256", "")
        
        # 下载 zip 安装包到临时目录
        temp_dir = Path(tempfile.gettempdir()) / "LifeCalendar-update"
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        zip_path = temp_dir / "update.zip"
        digest = download(url, zip_path, expected)

        # 解压到临时目录
        extract_dir = temp_dir / "new"
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
        
        # 找到解压后的应用目录（应该是 "人生日历/"）
        app_dir = None
        for item in extract_dir.iterdir():
            if item.is_dir() and item.name == "人生日历":
                app_dir = item
                break
        
        if app_dir is None:
            raise RuntimeError("安装包格式异常：找不到应用目录")

        # 当前安装目录
        current_exe = Path(sys.executable).resolve()
        install_dir = current_exe.parent  # 当前 exe 所在的目录

        # 创建批处理脚本来执行替换
        # 批处理会：等待当前进程退出 → 删除旧目录 → 移动新目录 → 启动新 exe → 删除自身
        bat_path = temp_dir / "update.bat"
        old_dir_name = install_dir.name  # 当前目录名（如 "人生日历"）
        parent_dir = install_dir.parent  # 父目录
        
        bat_content = f'''@echo off
chcp 65001 >nul
echo 正在更新人生日历...

REM 等待当前进程退出
timeout /t 2 /nobreak >nul
:wait_loop
tasklist /FI "IMAGENAME eq {current_exe.name}" 2>NUL | find /I "{current_exe.name}" >NUL
if NOT ERRORLEVEL 1 (
    timeout /t 1 /nobreak >nul
    goto wait_loop
)

REM 删除旧版本目录
if exist "{install_dir}" (
    rmdir /s /q "{install_dir}" 2>nul
)

REM 移动新版本到安装位置
if exist "{app_dir}" (
    move "{app_dir}" "{install_dir}" >nul
)

REM 启动新版本
start "" "{current_exe}"

REM 清理临时文件
rmdir /s /q "{temp_dir}" 2>nul

REM 删除自身
del "%~f0" 2>nul
'''
        bat_path.write_text(bat_content, encoding="utf-8")

        # 启动批处理脚本（隐藏窗口）
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0  # SW_HIDE
        subprocess.Popen(
            ["cmd.exe", "/c", str(bat_path)],
            startupinfo=startupinfo,
            creationflags=get_creation_flags()
        )

        # 退出当前应用
        threading.Timer(0.5, quit_app, args=(self.window_holder,)).start()
        return result(message="正在更新到 " + manifest.get("version", "?") +
                      (digest and "（校验通过）" or ""), version=manifest.get("version"))


def compare_version(a: str, b: str) -> int:
    def parts(v: str):
        return [int(x) for x in re_split(v)]
    pa, pb = parts(a), parts(b)
    for i in range(max(len(pa), len(pb))):
        x = pa[i] if i < len(pa) else 0
        y = pb[i] if i < len(pb) else 0
        if x != y:
            return 1 if x > y else -1
    return 0


def re_split(v: str):
    out = []
    num = ""
    for ch in v:
        if ch.isdigit():
            num += ch
        else:
            if num:
                out.append(num)
                num = ""
    if num:
        out.append(num)
    return out or ["0"]


def download(url: str, target: Path, expected_sha256: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "LifeCalendar/" + VERSION})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    import hashlib
    digest = hashlib.sha256(data).hexdigest()
    if expected_sha256 and digest.lower() != expected_sha256.lower():
        raise RuntimeError("安装包校验失败")
    target.write_bytes(data)
    return digest


def get_creation_flags() -> int:
    if os.name == "nt":
        return getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    return 0


def quit_app(window_holder: dict) -> None:
    window = window_holder.get("window")
    if window is not None:
        try:
            window.destroy()
        except Exception:
            pass
    os._exit(0)


def cleanup_files(paths: list[str]) -> None:
    """新进程启动时删除更新残留；旧进程可能还没退出，重试若干次。"""
    for raw in paths:
        p = Path(raw)
        for _ in range(40):
            try:
                if p.exists() and p.is_dir():
                    shutil.rmtree(p, ignore_errors=True)
                elif p.exists():
                    p.unlink()
                break
            except OSError:
                time.sleep(0.25)


def netfx_release() -> int:
    """读取 .NET Framework 4.x 的 Release 号；没有则返回 0。"""
    if os.name != "nt":
        return 0
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full",
        ) as key:
            release, _ = winreg.QueryValueEx(key, "Release")
        return int(release)
    except Exception:  # noqa: BLE001 没有该键就是没装
        return 0


def log_line(text: str) -> None:
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_DIR / "desktop.log", "a", encoding="utf-8") as fh:
            fh.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), text))
    except OSError:
        pass


def show_message(title: str, text: str, error: bool = True) -> None:
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, text, title, 0x10 if error else 0x40)
    except Exception:  # noqa: BLE001
        sys.stderr.write(text + "\n")


WEB_URL = "https://pass-you.github.io/life/"


def strip_motw() -> None:
    """删除安装目录里的 Mark-of-the-Web 标记。

    从浏览器下载 zip 再解压时，Windows 会给每个文件写 Zone.Identifier，
    .NET Framework 随后拒绝 Assembly.LoadFrom 这些程序集（pythonnet/WebView2），
    导致「Failed to resolve Python.Runtime.Loader.Initialize」。目录不可写时静默跳过，
    由随包的 exe.config（loadFromRemoteSources）兜底。
    """
    if not getattr(sys, "frozen", False):
        return
    try:
        import ctypes

        delete = ctypes.windll.kernel32.DeleteFileW
    except Exception:  # noqa: BLE001 非 Windows / 无 kernel32
        return
    cleaned = 0
    for dirpath, _dirs, files in os.walk(RESOURCE_DIR):
        for name in files:
            try:
                if delete(str(Path(dirpath) / name) + ":Zone.Identifier"):
                    cleaned += 1
            except Exception:  # noqa: BLE001 单文件失败不影响启动
                pass
    if cleaned:
        log_line("已解除 %d 个文件的下载标记（Mark-of-the-Web）" % cleaned)


def ask_open_web(reason: str) -> None:
    """桌面窗口起不来时给一次中文说明，并让用户选择是否打开在线版。"""
    log_line("窗口启动失败：%s" % reason)
    text = (
        "%s\n\n"
        "桌面窗口依赖 Windows 自带的 .NET Framework 4.7.2+ 与 WebView2 组件。\n"
        "· 安装 .NET Framework 4.8 后重新打开「人生日历」即可；\n"
        "· 或点「是」用浏览器打开在线版（日历仍可导入 / 导出 md 文件）。\n\n"
        "诊断日志：%s" % (reason, CONFIG_DIR / "desktop.log")
    )
    try:
        import ctypes

        answer = ctypes.windll.user32.MessageBoxW(
            None, text, APP_NAME, 0x04 | 0x40)  # MB_YESNO | MB_ICONINFORMATION
    except Exception:  # noqa: BLE001
        return
    if answer == 6:  # IDYES
        webbrowser.open(WEB_URL)


def run_pywebview(url: str) -> None:
    """默认渲染路径：pywebview(Edge WebView2) + 原生能力桥。"""
    webview = _webview()
    window_holder: dict = {}
    bridge = Bridge(window_holder)
    window = webview.create_window(
        APP_NAME, url,
        js_api=bridge,
        width=1180, height=800, min_size=(375, 600),
        background_color="#faf7f5")
    window_holder["window"] = window
    webview.start(gui="edgechromium")


def main() -> int:
    strip_motw()
    parser = argparse.ArgumentParser(description=APP_NAME + " 桌面版")
    parser.add_argument("--cleanup", nargs="*", default=[], help="清理更新残留文件")
    parser.add_argument("--port", type=int, default=0, help="调试用固定端口")
    args = parser.parse_args()

    if args.cleanup:
        cleanup_files([p for p in args.cleanup if p])

    # 每次启动清理更新残留
    cleanup_files([str(Path(tempfile.gettempdir()) / "LifeCalendar-update")])

    try:
        server, url = start_server(args.port)
    except Exception as exc:  # noqa: BLE001
        log_line("本地服务启动失败：%r" % (exc,))
        show_message(APP_NAME, "本地服务启动失败：\n%s" % exc)
        return 1

    try:
        release = netfx_release()
        if release < MIN_NETFX_RELEASE:
            ask_open_web(
                "当前系统未检测到可用的 .NET Framework 4.7.2+"
                "（Release=%d）。" % release)
            return 0
        try:
            run_pywebview(url)
            return 0
        except BaseException as exc:  # noqa: BLE001 缺组件时给中文说明
            ask_open_web("桌面窗口启动失败：%s" % exc)
            return 1
    finally:
        try:
            server.shutdown()
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except BaseException as exc:  # noqa: BLE001 绝不把英文 Traceback 弹给用户
        log_line("未捕获异常：%r" % (exc,))
        show_message(APP_NAME, "启动失败：\n%s\n\n诊断日志：%s"
                     % (exc, CONFIG_DIR / "desktop.log"))
        raise SystemExit(1)
