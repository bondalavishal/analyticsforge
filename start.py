#!/usr/bin/env python3
"""
AnalyticsForge — Launcher
Run this script to start the app: python start.py
"""

import os
import sys
import subprocess
import time
import webbrowser
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = ROOT / "venv"
STATIC = BACKEND / "static"

APP_URL = "http://localhost:8000"
COLORS = {
    "reset": "\033[0m",
    "bold": "\033[1m",
    "orange": "\033[38;5;214m",
    "green": "\033[32m",
    "red": "\033[31m",
    "gray": "\033[90m",
    "cyan": "\033[36m",
}

def c(color, text):
    return f"{COLORS.get(color, '')}{text}{COLORS['reset']}"

def header():
    print()
    print(c("orange", "  📊 AnalyticsForge"))
    print(c("gray",   "  SQL & Python analytics practice platform"))
    print()

def run(cmd, cwd=None, env=None, check=True):
    result = subprocess.run(cmd, cwd=cwd, env=env, shell=isinstance(cmd, str))
    if check and result.returncode != 0:
        print(c("red", f"  ✗ Command failed: {cmd}"))
        sys.exit(1)
    return result

def check_python():
    print(c("gray", "  Checking Python version..."))
    major, minor = sys.version_info[:2]
    if major < 3 or (major == 3 and minor < 10):
        print(c("red", f"  ✗ Python 3.10–3.13 required. Found {major}.{minor}"))
        sys.exit(1)
    if major == 3 and minor >= 14:
        print(c("red", f"  ✗ Python {major}.{minor} is too new — pydantic-core requires Python ≤ 3.13"))
        print(c("gray",   "    Install Python 3.13:  brew install python@3.13"))
        print(c("gray",   "    Then run:             python3.13 start.py"))
        sys.exit(1)
    print(c("green", f"  ✓ Python {major}.{minor}"))

def setup_venv():
    if not (VENV / "bin" / "python").exists():
        print(c("gray", "  Creating virtual environment..."))
        run([sys.executable, "-m", "venv", str(VENV)])
        print(c("green", "  ✓ Virtual environment created"))
    else:
        print(c("green", "  ✓ Virtual environment exists"))

def get_python():
    p = VENV / "bin" / "python"
    if not p.exists():
        p = VENV / "Scripts" / "python.exe"
    return str(p)

def install_backend():
    print(c("gray", "  Installing backend dependencies..."))
    pip = VENV / "bin" / "pip"
    if not pip.exists():
        pip = VENV / "Scripts" / "pip.exe"
    run([str(pip), "install", "-r", str(BACKEND / "requirements.txt"), "-q", "--no-cache-dir"])
    print(c("green", "  ✓ Backend dependencies installed"))

def check_node():
    if not shutil.which("node"):
        print(c("red", "  ✗ Node.js not found. Install from https://nodejs.org"))
        sys.exit(1)
    if not shutil.which("npm"):
        print(c("red", "  ✗ npm not found. Install Node.js from https://nodejs.org"))
        sys.exit(1)
    print(c("green", "  ✓ Node.js + npm found"))

def install_frontend():
    if not (FRONTEND / "node_modules").exists():
        print(c("gray", "  Installing frontend dependencies (first time, may take a minute)..."))
        run(["npm", "install", "--silent"], cwd=FRONTEND)
        print(c("green", "  ✓ Frontend dependencies installed"))
    else:
        print(c("green", "  ✓ Frontend dependencies already installed"))

def build_frontend():
    print(c("gray", "  Building frontend..."))
    STATIC.mkdir(parents=True, exist_ok=True)
    run(["npm", "run", "build"], cwd=FRONTEND)
    print(c("green", "  ✓ Frontend built"))

def open_browser():
    time.sleep(1.5)
    webbrowser.open(APP_URL)

def start_server():
    python = get_python()
    print()
    print(c("orange", f"  🚀 Starting AnalyticsForge at {APP_URL}"))
    print(c("gray",   "  Press Ctrl+C to stop"))
    print()

    # Open browser in background
    import threading
    t = threading.Thread(target=open_browser, daemon=True)
    t.start()

    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND)

    try:
        subprocess.run(
            [python, "-m", "uvicorn", "app.main:app",
             "--host", "0.0.0.0", "--port", "8000",
             "--reload", "--reload-dir", str(BACKEND / "app")],
            cwd=BACKEND,
            env=env,
        )
    except KeyboardInterrupt:
        print()
        print(c("orange", "  AnalyticsForge stopped. See you next time! 👋"))


def main():
    header()

    print(c("bold", "  Setting up..."))
    check_python()
    setup_venv()
    install_backend()
    check_node()
    install_frontend()
    build_frontend()

    start_server()


if __name__ == "__main__":
    main()
