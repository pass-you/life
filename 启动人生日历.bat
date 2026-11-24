@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 人生日历 · 本地服务

set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY where python >nul 2>&1 && set "PY=python"

if not defined PY goto nopython

%PY% serve.py
if errorlevel 1 pause
exit /b 0

:nopython
echo.
echo 没有找到 Python 3，请先安装 Python 3.8 或更高版本：
echo   https://www.python.org/downloads/
echo 安装时勾选 "Add python.exe to PATH"。
echo.
pause
exit /b 1
