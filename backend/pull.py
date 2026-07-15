#!/usr/bin/env python3
"""Fetch fresh copies of named backend/ scripts from GitHub `main` before
running them, so the newtab-weather container never runs stale code without
a manual redeploy. Run as: python pull.py build_feeds.py serve_feed.py
"""

import sys
import urllib.request

RAW_BASE = "https://raw.githubusercontent.com/rorybot/newTab/main/backend/"

for name in sys.argv[1:]:
    urllib.request.urlretrieve(RAW_BASE + name, name)
    print(f"pull.py: refreshed {name}", file=sys.stderr)
