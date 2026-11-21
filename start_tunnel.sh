#!/usr/bin/env bash
set -e

PORT=8090

# Detener cualquier proceso previo de este script
pkill -f "python3 -m http.server $PORT" || true
pkill -f "cloudflared tunnel --url http://127.0.0.1:$PORT" || true

rm -f tunnel.log tunnel_out.log server.log

# Iniciar servidor web de archivos estáticos en puerto 8090
python3 -m http.server $PORT > server.log 2>&1 &
SERVER_PID=$!

# Iniciar túnel de Cloudflare hacia el puerto local 8090
./cloudflared tunnel --url "http://127.0.0.1:$PORT" --logfile tunnel.log > tunnel_out.log 2>&1 &
TUNNEL_PID=$!

echo "Servidor Python iniciado en puerto $PORT (PID: $SERVER_PID)"
echo "Túnel Cloudflared iniciado (PID: $TUNNEL_PID)"

FOUND_URL=""
for i in {1..25}; do
    if [ -f tunnel.log ]; then
        FOUND_URL=$(grep -o -E 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' tunnel.log 2>/dev/null | head -n 1 || true)
    fi
    if [ -z "$FOUND_URL" ] && [ -f tunnel_out.log ]; then
        FOUND_URL=$(grep -o -E 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' tunnel_out.log 2>/dev/null | head -n 1 || true)
    fi

    if [ -n "$FOUND_URL" ]; then
        echo "========================================="
        echo "CLOUDFLARE_URL: $FOUND_URL"
        echo "========================================="
        break
    fi
    sleep 1
done

wait $TUNNEL_PID $SERVER_PID
