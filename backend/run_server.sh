#!/bin/sh
# Runs serve_feed.py, re-checking every 10 min (same cadence as the builder
# loop) whether a fresh pull.py fetch changed it, and restarting if so — so a
# serve_feed.py push reaches the running container without a manual restart.
set -eu

python pull.py serve_feed.py

while true; do
  python serve_feed.py --host 0.0.0.0 --port 8765 --dir /app/out &
  server_pid=$!
  hash_before=$(md5sum serve_feed.py)

  while kill -0 "$server_pid" 2>/dev/null; do
    sleep 600
    python pull.py serve_feed.py
    hash_after=$(md5sum serve_feed.py)
    if [ "$hash_after" != "$hash_before" ]; then
      echo "run_server.sh: serve_feed.py changed, restarting"
      kill "$server_pid"
      wait "$server_pid" 2>/dev/null || true
      break
    fi
  done
done
