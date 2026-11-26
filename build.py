#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人生日历 · 一键构建桌面端 + 安卓端

    python build.py                # 构建两端并刷新 release/
    python build.py --bump patch   # 版本 +0.0.1 再构建
    python build.py --bump minor   # 版本 +0.1.0 再构建

产物（release/，随 git push 发布到 GitHub Pages）：
    release/version.json           版本清单（含 sha256 / 大小）
    release/人生日历-<版本>-x64.exe   Windows 桌面端
    release/人生日历-<版本>.apk       Android 端

旧版本文件构建时自动清理，下载端只保留最新。
签名 keystore 首次自动生成到 android/keystore/（不进 git），
本机构建签名稳定，安卓覆盖安装升级不冲突。
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOOLS = ROOT / ".tools"
JDK = TOOLS / "jdk-17.0.21.1+2"
GRADLE = TOOLS / "gradle-8.7" / "bin" / "gradle.bat"
RELEASE = ROOT / "release"
VERSION_FILE = ROOT / "desktop" / "version.json"

KEYSTORE = ROOT / "android" / "keystore" / "life.jks"
KEYSTORE_PASSWORD = "lifecalendar"
KEY_ALIAS = "life"


def current_version() -> str:
    try:
        return json.loads(VERSION_FILE.read_text(encoding="utf-8"))["version"]
    except Exception:
        return "0.0.0"


def write_version(version: str) -> None:
    VERSION_FILE.write_text(json.dumps({"version": version}, ensure_ascii=False, indent=2), encoding="utf-8")
    # 安卓 versionName 与 versionCode 同步：code 取 00000 格式（0.0.0 -> 0）
    gradle = ROOT / "android" / "app" / "build.gradle"
    text = gradle.read_text(encoding="utf-8")
    text = re.sub(r"versionCode \d+", "versionCode " + str(version_code(version)), text)
    text = re.sub(r'versionName "[^"]+"', 'versionName "%s"' % version, text)
    gradle.write_text(text, encoding="utf-8")


def version_code(version: str) -> int:
    parts = [int(x) for x in version.split(".")]
    while len(parts) < 3:
        parts.append(0)
    return parts[0] * 10000 + parts[1] * 100 + parts[2]


def bump(version: str, level: str) -> str:
    parts = [int(x) for x in version.split(".")]
    while len(parts) < 3:
        parts.append(0)
    if level == "major":
        parts[0] += 1; parts[1] = 0; parts[2] = 0
    elif level == "minor":
        parts[1] += 1; parts[2] = 0
    else:
        parts[2] += 1
    return ".".join(str(x) for x in parts)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(cmd: list[str], cwd: Path | None = None, env_extra: dict | None = None) -> None:
    import os
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    print(">>", " ".join(str(c) for c in cmd), flush=True)
    proc = subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env)
    if proc.returncode != 0:
        raise SystemExit("命令失败（exit %d）：%s" % (proc.returncode, " ".join(str(c) for c in cmd)))


def build_desktop(version: str) -> Path:
    RELEASE.mkdir(parents=True, exist_ok=True)
    out = ROOT / "desktop" / "dist" / "人生日历.exe"
    if out.exists():
        out.unlink()
    run([sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", "life.spec"], cwd=ROOT / "desktop")
    if not out.exists():
        raise SystemExit("桌面端构建失败：找不到 " + str(out))
    target = RELEASE / ("人生日历-%s-x64.exe" % version)
    shutil.copy2(out, target)
    return target


def ensure_keystore() -> None:
    KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    if KEYSTORE.exists():
        return
    keytool = JDK / "bin" / "keytool.exe"
    run([str(keytool), "-genkeypair", "-v",
         "-keystore", str(KEYSTORE),
         "-storepass", KEYSTORE_PASSWORD,
         "-keypass", KEYSTORE_PASSWORD,
         "-alias", KEY_ALIAS,
         "-keyalg", "RSA", "-keysize", "2048", "-validity", "36500",
         "-dname", "CN=LifeCalendar,O=Personal,C=CN"])


def build_android(version: str) -> Path:
    ensure_keystore()
    gradle_props = ROOT / "android" / "app" / "build.gradle"
    text = gradle_props.read_text(encoding="utf-8")
    if "signingConfigs" not in text:
        text = text.replace(
            "    buildTypes {",
            """    signingConfigs {
        release {
            storeFile file('../keystore/life.jks')
            storePassword 'lifecalendar'
            keyAlias 'life'
            keyPassword 'lifecalendar'
        }
    }
    buildTypes {""")
        text = text.replace(
            "        release {\n            minifyEnabled false",
            "        release {\n            signingConfig signingConfigs.release\n            minifyEnabled false")
        gradle_props.write_text(text, encoding="utf-8")

    import os
    env = {"JAVA_HOME": str(JDK), "PATH": str(JDK / "bin") + os.pathsep + os.environ.get("PATH", "")}
    run([str(GRADLE), "--no-daemon", "assembleRelease"], cwd=ROOT / "android", env_extra=env)

    apk = ROOT / "android" / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"
    if not apk.exists():
        raise SystemExit("安卓构建失败：找不到 " + str(apk))
    target = RELEASE / ("人生日历-%s.apk" % version)
    shutil.copy2(apk, target)
    return target


def refresh_release(version: str, notes: str, win_exe: Path, apk: Path) -> None:
    RELEASE.mkdir(exist_ok=True)
    # 清理旧版本文件（只保留本次产物 + version.json）
    for item in RELEASE.iterdir():
        if item.is_file() and item.name not in (win_exe.name, apk.name, "version.json"):
            item.unlink()
    manifest = {
        "version": version,
        "notes": notes,
        "windows": {
            "file": win_exe.name,
            "url": "release/" + win_exe.name,
            "size": win_exe.stat().st_size,
            "sha256": sha256(win_exe),
        },
        "android": {
            "file": apk.name,
            "url": "release/" + apk.name,
            "size": apk.stat().st_size,
            "sha256": sha256(apk),
        },
    }
    (RELEASE / "version.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def sync_android_assets() -> None:
    """网页资源同步进安卓 assets/（构建前调用，保证两端一致）。"""
    src = ROOT
    dst = ROOT / "android" / "app" / "src" / "main" / "assets"
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src / "index.html", dst / "index.html")
    if (dst / "assets").exists():
        shutil.rmtree(dst / "assets")
    shutil.copytree(src / "assets", dst / "assets",
                    ignore=shutil.ignore_patterns())


def main() -> int:
    args = sys.argv[1:]
    level = None
    if "--bump" in args:
        i = args.index("--bump")
        level = args[i + 1] if i + 1 < len(args) else "patch"

    version = current_version()
    if level:
        version = bump(version, level)
        write_version(version)
        print("版本：%s" % version)

    sync_android_assets()
    win_exe = build_desktop(version)
    print("桌面端：%s" % win_exe.name)
    apk = build_android(version)
    print("安卓端：%s" % apk.name)

    notes = "v" + version
    refresh_release(version, notes, win_exe, apk)
    print("release/version.json 已刷新，旧版本文件已清理")
    print("推送即可发布：git add release/ && git commit -m 'v%s' && git push origin github" % version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
