#!/bin/bash
# Double-click to run Fretopia on this Mac. Close this window to stop it.
cd "$(dirname "$0")"
PORT=8000
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo ""
echo "  Fretopia is running at  http://localhost:$PORT"
IP=$(ipconfig getifaddr en0 2>/dev/null)
[ -n "$IP" ] && echo "  On your phone (same Wi-Fi): http://$IP:$PORT  (looks and plays; phones only allow the mic on https)"
echo "  Close this window to stop."
echo ""
(sleep 1; open "http://localhost:$PORT") &
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 0.0.0.0
elif command -v npx >/dev/null 2>&1; then
  npx --yes http-server -p $PORT -c-1
else
  echo "Python 3 or Node is needed. Install Python from python.org, then double-click again."; read -r
fi
