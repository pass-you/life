#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人生日历 · 一键构建桌面端 + 安卓端

用法：
  python build.py                # 按当前版本构建
  python build.py --bump patch   # 自动递增补丁版本后构建
  python build.py --bump minor
  python build.py --bump major
"""

from __future__ import annotations

import hashlib
import json
import os
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
    # 同步到安卓 build.gradle
    gradle = ROOT / "android" / "app" / "build.gradle"
    text = gradle.read_text(encoding="utf-8")
    text = text.replace('versionName "1.0.0"', 'versionName "%s"' % version)
    text = text.replace("versionName \"1.0.0\"", 'versionName "%s"' % version)
    # 用正则替换更可靠
    import re
    text = re.sub(r'versionName\s+"[^"]*"', 'versionName "%s"' % version, text)
    text = re.sub(r'versionCode\s+\d+', 'versionCode %d' % version_code(version), text)
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
        parts[0] += 1
        parts[1] = 0
        parts[2] = 0
    elif level == "minor":
        parts[1] += 1
        parts[2] = 0
    else:
        parts[2] += 1
    return ".".join(str(x) for x in parts)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(cmd: list[str], cwd: Path | None = None, env_extra: dict | None = None) -> None:
    import os
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    proc = subprocess.run(cmd, cwd=cwd, env=env)
    if proc.returncode != 0:
        raise SystemExit("命令失败（exit %d）：%s" % (proc.returncode, " ".join(str(c) for c in cmd)))


def build_desktop(version: str) -> Path:
    """构建桌面端，生成安装包（zip 压缩的文件夹结构）"""
    RELEASE.mkdir(parents=True, exist_ok=True)
    
    # 清理旧的构建产物
    dist_dir = ROOT / "desktop" / "dist"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    
    # PyInstaller 构建
    run([sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", "life.spec"], cwd=ROOT / "desktop")
    
    # 检查输出文件夹
    app_folder = dist_dir / "人生日历"
    if not app_folder.exists():
        raise SystemExit("桌面端构建失败：找不到 " + str(app_folder))
    
    # 打包成 zip 安装包
    target = RELEASE / ("人生日历-%s-x64.zip" % version)
    if target.exists():
        target.unlink()
    
    # 创建 zip 文件
    import zipfile
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for root_path, dirs, files in os.walk(app_folder):
            for file in files:
                file_path = Path(root_path) / file
                arcname = "人生日历/" + str(file_path.relative_to(app_folder)).replace("\\", "/")
                zf.write(file_path, arcname)
    
    if not target.exists():
        raise SystemExit("安装包生成失败：" + str(target))
    
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


def refresh_release(version: str, notes: str, win_zip: Path, apk: Path) -> None:
    RELEASE.mkdir(exist_ok=True)
    # 清理旧版本文件（只保留本次产物 + version.json）
    for item in RELEASE.iterdir():
        if item.is_file() and item.name not in (win_zip.name, apk.name, "version.json"):
            item.unlink()
    manifest = {
        "version": version,
        "notes": notes,
        "windows": {
            "file": win_zip.name,
            "url": "release/" + win_zip.name,
            "size": win_zip.stat().st_size,
            "sha256": sha256(win_zip),
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
    win_zip = build_desktop(version)
    print("桌面端：%s" % win_zip.name)
    apk = build_android(version)
    print("安卓端：%s" % apk.name)

    notes = "v" + version
    refresh_release(version, notes, win_zip, apk)
    print("release/version.json 已刷新，旧版本文件已清理")
    print("推送即可发布：git add release/ && git commit -m 'v%s' && git push origin github" % version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
