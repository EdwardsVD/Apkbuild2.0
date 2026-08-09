#!/usr/bin/env bash
#
# deploy.sh — buat Space HF (sdk: docker) lalu push isi cpp2apk/ ke sana.
#
# Token HF (role Write) diambil dari env HF_TOKEN atau diminta interaktif.
# Token TIDAK pernah ditulis ke file/git/history shell. Dikirim hanya via
# header Authorization pada satu perintah push.
#
# Usage:
#   ./deploy.sh <hf-username> [space-name]
#
set -euo pipefail

USERNAME="${1:?Usage: deploy.sh <hf-username> [space-name]}"
SPACE="${2:-cpp2apk}"
REPO_URL="https://huggingface.co/spaces/${USERNAME}/${SPACE}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Ambil token (env dulu, lalu prompt interaktif)
if [ -z "${HF_TOKEN:-}" ]; then
  echo "Masukkan HF token dengan role Write (dibuat di https://huggingface.co/settings/tokens):"
  read -r -s HF_TOKEN
  echo
fi
if [ -z "$HF_TOKEN" ]; then
  echo "ERROR: token kosong. Batalkan." >&2
  exit 1
fi

# 2. Buat Space (kalau belum ada) via REST API — tanpa library tambahan.
echo "[1/3] Membuat/cek Space '${USERNAME}/${SPACE}' ..."
curl -sS -o /tmp/hf_create_resp.json -w "%{http_code}" \
  -X POST "https://huggingface.co/api/repos/create" \
  -H "Authorization: Bearer ${HF_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${SPACE}\",\"type\":\"space\",\"sdk\":\"docker\"}" \
  > /tmp/hf_create_status 2>/dev/null || true

HTTP_CODE=$(cat /tmp/hf_create_status)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "409" ]; then
  echo "   Space siap: ${REPO_URL}"
else
  echo "   (code ${HTTP_CODE}) " "$(cat /tmp/hf_create_resp.json 2>/dev/null || true)"
  echo "   LANJUT mencoba push — Space mungkin sudah ada."
fi

# 3. Staging isi cpp2apk ke direktori sementara & push via git
echo "[2/3] Menyiapkan & push file ke ${REPO_URL} ..."
TMP=$(mktemp -d)
cp -r "$HERE"/. "$TMP/"          # salin isi folder space
cd "$TMP"
rm -rf .git .gitignore __pycache__ examples/deploy_cache 2>/dev/null || true

git init -q
git checkout -q -b main 2>/dev/null || git branch -q -M main
git remote add origin "$REPO_URL"
git add -A

GIT_AUTHOR_NAME="$USERNAME" \
GIT_AUTHOR_EMAIL="$USERNAME@users.noreply.huggingface.co" \
GIT_COMMITTER_NAME="$USERNAME" \
GIT_COMMITTER_EMAIL="$USERNAME@users.noreply.huggingface.co" \
git -c user.name="$USERNAME" \
    -c user.email="$USERNAME@users.noreply.huggingface.co" \
    commit -q -m "Deploy: CPP to APK builder" --allow-empty

# Push dengan token di header saja (tidak disimpan di git/config).
git -c http.extraheader="Authorization: Bearer ${HF_TOKEN}" \
    push -q -f origin "main:main"

echo "[3/3] Selesai!"
echo "   Dashboard: https://huggingface.co/spaces/${USERNAME}/${SPACE}"
echo "   Pantau build image Docker di tab Logs halaman Space tersebut."
