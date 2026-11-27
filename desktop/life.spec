# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 打包配置：人生日历桌面版（文件夹模式）
# 生成 人生日历/ 文件夹，内含 exe + 依赖文件，更符合正规软件结构。

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
    [],
    exclude_binaries=True,
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

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="人生日历",
)

# .NET Framework 需要与 exe 同级的 <exe>.config 才生效：
# 从浏览器下载的 zip 解压后程序集带 Mark-of-the-Web，默认策略会拒绝 Assembly.LoadFrom。
APP_CONFIG = """<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <startup useLegacyV2RuntimeActivationPolicy="true">
    <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.7.2" />
  </startup>
  <runtime>
    <loadFromRemoteSources enabled="true" />
  </runtime>
</configuration>
"""
(Path(DISTPATH) / "人生日历" / "人生日历.exe.config").write_text(APP_CONFIG, encoding="utf-8")
