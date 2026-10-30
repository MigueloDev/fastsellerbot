#!/usr/bin/env bash
# Prueba manual de los cambios fase 2 (app móvil de vendedores).
# Uso: BASE_URL=http://localhost:3600 TOKEN=<clerk-jwt> ACCOUNT_ID=<cash-account-id> \
#      CUSTOMER_ID=<customer-id> PRODUCT_ID=<product-id> ./scripts/mobile-smoke.sh
#
# Requiere curl + jq. No borra ni modifica nada fuera de crear 1 venta y 1 pago de prueba.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3600}"
: "${TOKEN:?export TOKEN=<clerk jwt>}"
: "${ACCOUNT_ID:?export ACCOUNT_ID=<cash account id, moneda BS>}"
: "${CUSTOMER_ID:?export CUSTOMER_ID=<customer id>}"
: "${PRODUCT_ID:?export PRODUCT_ID=<product id activo, sin variantes, con precio REF_BS>}"

auth=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo "== 1) Idempotencia: dos POST /sales con el mismo clientId =="
CLIENT_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())')
SALE_BODY=$(printf '{"clientId":"%s","customerId":"%s","priceRef":"REF_BS","items":[{"productId":"%s","quantity":1}]}' \
  "$CLIENT_ID" "$CUSTOMER_ID" "$PRODUCT_ID")

first=$(curl -s -o /tmp/mobile-smoke-sale1.json -w '%{http_code}' -X POST "$BASE_URL/sales" "${auth[@]}" -d "$SALE_BODY")
second=$(curl -s -o /tmp/mobile-smoke-sale2.json -w '%{http_code}' -D /tmp/mobile-smoke-sale2.headers -X POST "$BASE_URL/sales" "${auth[@]}" -d "$SALE_BODY")
sale_id_1=$(jq -r '.id' /tmp/mobile-smoke-sale1.json)
sale_id_2=$(jq -r '.id' /tmp/mobile-smoke-sale2.json)
echo "  primer POST: $first (id=$sale_id_1)"
echo "  segundo POST: $second (id=$sale_id_2) — esperado 200 + mismo id + header Idempotent-Replay"
grep -i "idempotent-replay" /tmp/mobile-smoke-sale2.headers || echo "  ⚠️  sin header Idempotent-Replay"
[ "$sale_id_1" = "$sale_id_2" ] && echo "  ✅ mismo id, sin reserva doble" || echo "  ❌ ids distintos"

echo
echo "== 2) Pago en Bs con paidAt de hace 2 días =>  tasa BCV de ese momento =="
PAID_AT=$(date -u -d '2 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-2d +%Y-%m-%dT%H:%M:%SZ)
PAY_BODY=$(printf '{"method":"PAGO_MOVIL","amount":1,"accountId":"%s","paidAt":"%s"}' "$ACCOUNT_ID" "$PAID_AT")
curl -s -X POST "$BASE_URL/sales/$sale_id_1/payments" "${auth[@]}" -d "$PAY_BODY" | jq '{rateUsed, paidAt: .payments[-1].paidAt}'
echo "  comparar rateUsed arriba contra GET /rates/history cerca de $PAID_AT:"
curl -s "$BASE_URL/rates/history?limit=20" "${auth[@]}" | jq '.items[] | select(.fetchedAt < "'"$PAID_AT"'") | .rate' | head -1

TOO_OLD=$(date -u -d '10 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-10d +%Y-%m-%dT%H:%M:%SZ)
echo "  paidAt de hace 10 días (fuera de MAX_OFFLINE_PAYMENT_DAYS) → esperado 422:"
curl -s -o /dev/null -w '  status: %{http_code}\n' -X POST "$BASE_URL/sales/$sale_id_1/payments" "${auth[@]}" \
  -d "$(printf '{"method":"PAGO_MOVIL","amount":1,"accountId":"%s","paidAt":"%s"}' "$ACCOUNT_ID" "$TOO_OLD")"

echo
echo "== 3) Evidencia: subir WebP, luego PDF (reemplaza), y firmar la URL =="
# WebP mínimo válido (RIFF + tamaño + WEBP)
WEBP_B64=$(printf 'RIFF\x04\x00\x00\x00WEBP' | base64 | tr -d '\n')
curl -s -X POST "$BASE_URL/sales/$sale_id_1/evidence" "${auth[@]}" \
  -d "{\"fileBase64\":\"$WEBP_B64\",\"contentType\":\"image/webp\"}" | jq '.hasEvidence'

PDF_B64=$(printf '%%PDF-1.4\n' | base64 | tr -d '\n')
curl -s -X POST "$BASE_URL/sales/$sale_id_1/evidence" "${auth[@]}" \
  -d "{\"fileBase64\":\"$PDF_B64\",\"contentType\":\"application/pdf\"}" | jq '.hasEvidence'

curl -s "$BASE_URL/sales/$sale_id_1/evidence-url" "${auth[@]}" | jq '.url | test("\\.pdf")'
echo "  ✅ true arriba = la URL firmada apunta al PDF (reemplazó el WebP)"

echo
echo "== 4) Tamaño del payload de GET /mobile/bootstrap =="
curl -s "$BASE_URL/mobile/bootstrap" "${auth[@]}" -o /tmp/mobile-smoke-bootstrap.json
wc -c /tmp/mobile-smoke-bootstrap.json
jq '{products: (.products|length), stock: (.stock|length), customers: (.customers|length), cashAccounts: (.cashAccounts|length)}' /tmp/mobile-smoke-bootstrap.json
