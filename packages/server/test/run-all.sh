#!/usr/bin/env bash
# Roda todas as suítes de packages/server/test/ (usado pelo CI e localmente: npm run test:ci -w @frixep/server).
# Cada suíte ganha um servidor de teste NOVO, com as variáveis que ela exige (ver README: "reinicie o servidor
# entre as suítes"). O servidor é iniciado com as variáveis inline, em memória (PGLITE_DIR=memory); nada lê o .env.
# Uso: bash test/run-all.sh   (a partir de packages/server)
set -u
cd "$(dirname "$0")/.." || exit 1

TEST_JWT="ci-only-secret-nao-e-producao-0123456789abcdef"
FAILS=()
RAN=0
PORT_NEXT=3400
LOG_DIR="${TMPDIR:-/tmp}/frixep-test-logs"
mkdir -p "$LOG_DIR"

# Sobe o servidor de teste numa porta. Argumentos: porta, variáveis do servidor (string, ex. "LOOT_TEST=1 X=1").
start_server() {
  local port="$1" srv="$2"
  # shellcheck disable=SC2086
  env PORT="$port" PGLITE_DIR=memory JWT_SECRET="$TEST_JWT" $srv npx tsx src/index.ts > "$LOG_DIR/server-$port.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 90); do
    if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then return 0; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
    sleep 1
  done
  echo "FALHA: servidor de teste não subiu na porta $port"; cat "$LOG_DIR/server-$port.log"
  return 1
}

stop_server() {
  pkill -P "$SERVER_PID" 2>/dev/null
  kill "$SERVER_PID" 2>/dev/null
  # Windows (Git Bash): o node filho sobrevive ao kill e segura porta e memória; encerra a árvore inteira pelo PID do Windows
  if [ -r "/proc/$SERVER_PID/winpid" ] && command -v taskkill > /dev/null 2>&1; then
    taskkill //F //T //PID "$(cat "/proc/$SERVER_PID/winpid")" > /dev/null 2>&1
  fi
  wait "$SERVER_PID" 2>/dev/null
}

# Uma suíte com servidor próprio. Argumentos: porta, variáveis do servidor, arquivo, variáveis da suíte.
run_case() {
  # porta própria a cada caso: no Windows o node filho pode sobreviver e segurar a porta
  local port srv="$2" file="$3" suite="$4"
  # pula portas já em uso (servidor esquecido de outra rodada responderia no lugar do novo e falsearia o resultado)
  port=$((PORT_NEXT++))
  while curl -s -o /dev/null --max-time 1 "http://localhost:$port/health"; do port=$((PORT_NEXT++)); done
  RAN=$((RAN + 1))
  echo "::group::$file"
  if start_server "$port" "$srv"; then
    # shellcheck disable=SC2086
    if env SERVER="http://localhost:$port" $suite node "$file"; then
      echo "OK  $file"
    else
      echo "FALHA  $file"; FAILS+=("$file")
    fi
  else
    echo "FALHA  $file (servidor)"; FAILS+=("$file")
  fi
  stop_server
  echo "::endgroup::"
}

# Suítes que não precisam de servidor.
echo "== Suítes sem servidor"
for file in test/balance.unit.ts test/boss.unit.ts test/chegada.unit.ts test/economy.unit.ts \
            test/inventory.unit.ts test/market.unit.ts test/vault.unit.ts; do
  RAN=$((RAN + 1))
  echo "::group::$file"
  if npx tsx "$file"; then echo "OK  $file"; else echo "FALHA  $file"; FAILS+=("$file"); fi
  echo "::endgroup::"
done

echo "== Suítes com servidor de teste (um servidor novo por suíte)"
# Padrão: sem variáveis extras.
for file in test/anticheat.mjs test/chat.mjs test/mana.mjs test/pvp.mjs test/morte.mjs \
            test/zones.mjs test/persistence.mjs; do
  if [ "$file" = test/morte.mjs ] || [ "$file" = test/zones.mjs ]; then run_case 2991 "" "$file" ""; elif [ "$file" = test/persistence.mjs ]; then run_case 2991 "TEST_START_ZONE=1 API_RATE_MULT=100" "$file" ""; else run_case 2991 "TEST_START_ZONE=1 API_RATE_MULT=100" "$file" ""; fi
done
# Economia, mercado e cidade (kit inicial; mercado com TTL curto).
run_case 2992 "ECON_TEST=1 LOOT_TEST=1 MARKET_TTL_S=4" test/economy.mjs ""
run_case 2992 "ECON_TEST=1 LOOT_TEST=1 MARKET_TTL_S=4" test/market.mjs ""
run_case 2992 "ECON_TEST=1" test/cidade.mjs ""
# Classes e inventário com loot garantido.
for file in test/inventory.mjs test/classes.mjs test/mago.mjs test/guerreiro.mjs test/curandeiro.mjs; do
  run_case 2993 "LOOT_TEST=1 API_RATE_MULT=100 TEST_START_ZONE=1" "$file" ""
done
# Itens no chão e chefe de 1 de vida.
run_case 2994 "LOOT_TEST=1 LOOT_LOCK_S=3 BOSS_TEST=1 TEST_START_ZONE=1" test/loot.mjs ""
# Regras de combate e grupo (coleira curta).
run_case 2995 "LOOT_TEST=1 LOOT_LOCK_S=3 ENEMY_LEASH_TEST=9 TEST_START_ZONE=1" test/combate.mjs ""
# Grupo (convites e ausência encurtados) e chegada nas Cinzas.
run_case 2996 "PARTY_TEST=1 TEST_START_ZONE=1 API_RATE_MULT=100" test/party.mjs "PARTY_TEST=1"
run_case 2996 "TEST_START_ZONE=1" test/chegada.mjs ""

echo
echo "Suítes executadas: $RAN"
if [ ${#FAILS[@]} -gt 0 ]; then
  echo "FALHARAM (${#FAILS[@]}): ${FAILS[*]}"
  exit 1
fi
echo "Todas as suítes passaram."
