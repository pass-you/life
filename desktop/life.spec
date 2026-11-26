# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 打包配置：人生日历桌面版（单文件 exe）
# 站点资源（index.html、assets/）随包携带，桥版本号放包外由构建写入。

import json
from pathlib import Path

PROJECT_ROOT = Path(SPECPATH).resolve().parent
SITE = PROJECT_ROOT
VERSION_FILE = Path(SPECPATH).resolve() / "version.json"

version = "0.0.0"
try:
    version = json.loads(VERSION_FILE.read_text(encoding="utf-8"))["version"]
except Exception:
    pass

block_cipher = None

a = Analysis(
    ["main.py"],
    pathex=[str(Path(SPECPATH).resolve())],
    binaries=[],
    datas=[
        (str(SITE / "index.html"), "."),
        (str(SITE / "assets"), "assets"),
        (str(VERSION_FILE), "."),
    ],
    hiddenimports=["webview.platforms.edgechromium", "webview.platforms.winforms"],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="人生日历",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    console=False,
    icon=str(SITE / "assets" / "favicon.ico") if (SITE / "assets" / "favicon.ico").exists() else None,
    version=str(Path(SPECPATH).resolve() / "version_info.txt") if (Path(SPECPATH) / "version_info.txt").exists() else None,
)
