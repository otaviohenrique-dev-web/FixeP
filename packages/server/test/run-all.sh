#!/usr/bin/env bash
# Roda as suítes de packages/server/test/ (usado pelo CI e localmente: npm run test:ci -w @frixep/server).
# A lista é gerada AUTOMATICAMENTE: todo test/*.unit.ts (e ../shared/src/*.unit.ts) e todo test/*.mjs entram,
# menos os da lista EXCLUIR abaixo. Suíte nova não precisa editar este arquivo, só se exigir variáveis próprias
# (aí ganha uma linha em config_suite).
# Cada suíte com servidor ganha um servidor de teste NOVO, com as variáveis que ela exige (ver README: "reinicie o
# servidor entre as suítes"). O servidor é iniciado com as variáveis inline, em memória (PGLITE_DIR=memory); nada lê o .env.
#
# Uso (a partir de packages/server):
#   bash test/run-all.sh                     tudo (unitárias + suítes com servidor)
#   bash test/run-all.sh --so-unit           só as unitárias (sem servidor)
#   bash test/run-all.sh --grupo N --de M    só as suítes com servidor do grupo N de M (divisão fixa, CI em paralelo)
#   bash test/run-all.sh --listar            só imprime o que rodaria (com os filtros acima)
set -u
cd "$(dirname "$0")/.." || exit 1

# Arquivos .mjs que NÃO são suítes do CI (utilitários ou testes manuais/longos).
EXCLUIR=(
  test/remote-db.mjs      # utilitário para banco real (Supabase), não é teste
  test/quests_cadeia.mjs  # cadeia C1.5 inteira (PD-11): longa, roda à mão
)

MODO=tudo; GRUPO=0; DE=0; LISTAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --so-unit) MODO=unit ;;
    --grupo) GRUPO="$2"; MODO=grupo; shift ;;
    --de) DE="$2"; shift ;;
    --listar) LISTAR=1 ;;
    *) echo "argumento desconhecido: $1"; exit 2 ;;
  esac
  shift
done
if [ "$MODO" = grupo ] && { [ "$DE" -lt 1 ] || [ "$GRUPO" -lt 1 ] || [ "$GRUPO" -gt "$DE" ]; }; then
  echo "uso: --grupo N --de M (1 <= N <= M)"; exit 2
fi

excluido() { local f; for f in "${EXCLUIR[@]}"; do [ "$f" = "$1" ] && return 0; done; return 1; }

# Casos de uma suíte com servidor: uma linha "variáveis do servidor|variáveis da suíte" por execução, em ordem.
# Sem entrada aqui = padrão "TEST_START_ZONE=1 API_RATE_MULT=100".
config_suite() {
  case "$1" in
    test/morte.mjs|test/zones.mjs) echo "|" ;;
    # Economia, mercado e cidade (kit inicial; mercado com TTL curto).
    test/economy.mjs|test/market.mjs) echo "ECON_TEST=1 LOOT_TEST=1 MARKET_TTL_S=4|" ;;
    test/cidade.mjs) echo "ECON_TEST=1|" ;;
    test/autopocao.mjs|test/autopocao-disparo.mjs|test/cura-numeros.mjs) echo "ECON_TEST=1 TEST_START_ZONE=1 API_RATE_MULT=100|" ;;
    # Classes e inventário com loot garantido. DANO_FIXO_TEST=1: sem crítico nem variação (PD-01/PD-02).
    test/inventory.mjs|test/classes.mjs|test/mago.mjs|test/guerreiro.mjs|test/curandeiro.mjs|test/rebalance.mjs|test/poder.mjs)
      echo "LOOT_TEST=1 API_RATE_MULT=100 TEST_START_ZONE=1 DANO_FIXO_TEST=1|" ;;
    # Itens no chão e chefe de 1 de vida.
    test/loot.mjs) echo "LOOT_TEST=1 LOOT_LOCK_S=3 BOSS_TEST=1 TEST_START_ZONE=1|" ;;
    # Regras de combate e grupo (coleira curta).
    test/combate.mjs) echo "LOOT_TEST=1 LOOT_LOCK_S=3 ENEMY_LEASH_TEST=9 TEST_START_ZONE=1|" ;;
    # Grupo (convites e ausência encurtados) e chegada nas Cinzas.
    test/party.mjs) echo "PARTY_TEST=1 TEST_START_ZONE=1 API_RATE_MULT=100|PARTY_TEST=1" ;;
    test/chegada.mjs) echo "TEST_START_ZONE=1|" ;;
    # Buffs próprios (ícones do HUD).
    test/buffs.mjs) echo "LOOT_TEST=1 API_RATE_MULT=100 TEST_START_ZONE=1|" ;;
    # Moderação (C0.6): a primeira conta criada vira admin (só não-produção).
    test/moderacao.mjs) echo "ADMIN_TEST_FIRST_GUEST=1 API_RATE_MULT=100 TEST_START_ZONE=1|" ;;
    # Painel de administração (F1): o código de 2FA vai para um arquivo que o teste lê (só fora de produção).
    test/painel_admin.mjs) echo "ADMIN_TEST_FIRST_GUEST=1 API_RATE_MULT=100 TEST_START_ZONE=1 PAINEL_CODIGO_ARQUIVO=$PAINEL_ARQ|PAINEL_CODIGO_FILE=$PAINEL_ARQ" ;;
    # Modo Deus (ferramenta de admin): o admin é a 1ª conta; o código do painel vai para o arquivo que o teste lê.
    test/modo_deus.mjs)
      echo "ADMIN_TEST_FIRST_GUEST=1 API_RATE_MULT=100 TEST_START_ZONE=4 PAINEL_CODIGO_ARQUIVO=$PAINEL_ARQ|PAINEL_CODIGO_FILE=$PAINEL_ARQ MODO_FASE=1"
      echo "ADMIN_TEST_FIRST_GUEST=1 API_RATE_MULT=100 TEST_START_ZONE=1 PAINEL_CODIGO_ARQUIVO=$PAINEL_ARQ|PAINEL_CODIGO_FILE=$PAINEL_ARQ MODO_FASE=2" ;;
    # Quests (C1.1) e quest de abate REAL (PD-07).
    test/quests.mjs) echo "QUEST_TEST=1 QUEST_FIXTURE=1 API_RATE_MULT=100|" ;;
    test/quests_combate.mjs) echo "QUEST_TEST=1 QUEST_FIXTURE=1 LOOT_TEST=1 API_RATE_MULT=100|" ;;
    # Tutorial (C1.4) e dicas (C1.6).
    test/tutorial.mjs) echo "QUEST_TEST=1 API_RATE_MULT=100|" ;;
    test/dicas.mjs|test/pvp.mjs) echo "API_RATE_MULT=100|" ;;
    test/engaste.mjs) echo "ECON_TEST=1 API_RATE_MULT=100|" ;;
    # Variações (C2.2): na cidade e numa zona de combate.
    test/variacoes.mjs)
      echo "VARIACAO_TEST_LEVEL=10 API_RATE_MULT=100|VARIACAO_MODO=cidade"
      echo "VARIACAO_TEST_LEVEL=10 API_RATE_MULT=100 TEST_START_ZONE=1|VARIACAO_MODO=zona" ;;
    # Afixos de item: o drop de teste traz "afiado" e "vigor".
    test/afixos.mjs) echo "LOOT_TEST=1 AFIXO_TEST=1 API_RATE_MULT=100 TEST_START_ZONE=1|" ;;
    # Craft, refino e desmontar na Ferreira.
    test/craft.mjs) echo "ECON_TEST=1 CRAFT_TEST=1 VARIACAO_TEST_LEVEL=40 API_RATE_MULT=100|" ;;
    test/refino.mjs|test/desmontar.mjs) echo "ECON_TEST=1 CRAFT_TEST=1 API_RATE_MULT=100|" ;;
    # Talentos (C2.3): na cidade e fora dela.
    test/talentos.mjs)
      echo "VARIACAO_TEST_LEVEL=10 ECON_TEST=1 API_RATE_MULT=100|"
      echo "VARIACAO_TEST_LEVEL=10 ECON_TEST=1 API_RATE_MULT=100 TEST_START_ZONE=1|TALENTO_MODO=zona" ;;
    # Balanceamento ao vivo: fase 1 (permissão, limites, efeito na hora, desfazer) e fase 2 (reinício, mesmo banco em arquivo).
    test/balanceamento.mjs)
      echo "ADMIN_TEST_FIRST_GUEST=1 API_RATE_MULT=100 TEST_START_ZONE=2 PGLITE_DIR=$BAL_DB PAINEL_CODIGO_ARQUIVO=$BAL_PAINEL|BALANCE_FASE=1 PAINEL_CODIGO_FILE=$BAL_PAINEL"
      echo "ADMIN_TEST_FIRST_GUEST=1 API_RATE_MULT=100 TEST_START_ZONE=2 PGLITE_DIR=$BAL_DB PAINEL_CODIGO_ARQUIVO=$BAL_PAINEL|BALANCE_FASE=2 PAINEL_CODIGO_FILE=$BAL_PAINEL" ;;
    # Loadouts (C2.4): fase 1 (nível 10) e fase 2 (nível 6) no MESMO banco em arquivo; zona recusa (ver run_loadouts).
    test/loadouts.mjs)
      echo "VARIACAO_TEST_LEVEL=10 ECON_TEST=1 API_RATE_MULT=100 PGLITE_DIR=$LOADOUT_DB|LOADOUT_FASE=1 LOADOUT_TOKEN_FILE=$LOADOUT_TOKEN"
      echo "VARIACAO_TEST_LEVEL=6 ECON_TEST=1 API_RATE_MULT=100 PGLITE_DIR=$LOADOUT_DB|LOADOUT_FASE=2 LOADOUT_TOKEN_FILE=$LOADOUT_TOKEN"
      echo "ECON_TEST=1 API_RATE_MULT=100 TEST_START_ZONE=1|LOADOUT_FASE=zona" ;;
    *) echo "TEST_START_ZONE=1 API_RATE_MULT=100|" ;;
  esac
}
LOADOUT_DB="../../.data/loadouts-test-pglite"; LOADOUT_TOKEN="../../.data/loadouts-test-token.txt"
BAL_DB="../../.data/balanceamento-test-pglite"
BAL_PAINEL="../../.data/balanceamento-test-codigo.txt"
PAINEL_ARQ="../../.data/painel-test-codigo.txt"

# Listas geradas por glob (ordem alfabética estável, LC_ALL=C).
export LC_ALL=C
UNITS=(); for f in test/*.unit.ts ../shared/src/*.unit.ts; do [ -e "$f" ] && UNITS+=("$f"); done
SUITES=(); for f in test/*.mjs; do excluido "$f" || SUITES+=("$f"); done

# Divisão determinística em grupos: rodízio (suíte i vai para o grupo (i mod M)+1). Todos os casos de uma suíte
# ficam no mesmo grupo (ex.: as 3 fases de loadouts, que dividem o banco).
if [ "$MODO" = grupo ]; then
  SEL=(); i=0; for f in "${SUITES[@]}"; do [ $((i % DE + 1)) -eq "$GRUPO" ] && SEL+=("$f"); i=$((i + 1)); done
  SUITES=("${SEL[@]}"); UNITS=()
elif [ "$MODO" = unit ]; then
  SUITES=()
fi

if [ "$LISTAR" = 1 ]; then
  for f in "${UNITS[@]}"; do echo "unit   $f"; done
  for f in "${SUITES[@]}"; do while IFS='|' read -r srv suite; do echo "server $f  [$srv] [$suite]"; done < <(config_suite "$f"); done
  exit 0
fi

TEST_JWT="ci-only-secret-nao-e-producao-0123456789abcdef"
FAILS=()
FLAKY=()
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

# Uma tentativa de uma suíte, com servidor novo. Argumentos: variáveis do servidor, arquivo, variáveis da suíte. Devolve 0 se passou.
attempt_case() {
  local srv="$1" file="$2" suite="$3" port rc=1
  # porta própria a cada tentativa: no Windows o node filho pode sobreviver e segurar a porta
  port=$((PORT_NEXT++))
  # pula portas já em uso (servidor esquecido de outra rodada responderia no lugar do novo e falsearia o resultado)
  while curl -s -o /dev/null --max-time 1 "http://localhost:$port/health"; do port=$((PORT_NEXT++)); done
  if start_server "$port" "$srv"; then
    # shellcheck disable=SC2086
    # limite de 5 min por tentativa: uma suíte travada falha e repete, em vez de gastar o limite do job inteiro
    timeout 300 env SERVER="http://localhost:$port" $suite node "$file" && rc=0
  fi
  stop_server
  return $rc
}

# Os testes de ponta a ponta são sensíveis ao tempo (o CI do GitHub é lento): se falhar, repete UMA vez com servidor novo.
# Passou na repetição = "FLAKY" (aparece no log e no resumo, ver docs/PROGRESSO.md); falhou nas 2 = falha real e o CI fica vermelho.
run_case() {
  local srv="$1" file="$2" suite="$3" label="$2"
  [ -n "$suite" ] && label="$file ($suite)"
  RAN=$((RAN + 1))
  echo "::group::$label"
  if attempt_case "$srv" "$file" "$suite"; then
    echo "OK  $label"
  else
    echo "TENTATIVA 1 FALHOU  $label  -> repetindo uma vez com servidor novo"
    if attempt_case "$srv" "$file" "$suite"; then
      echo "OK  $label  (FLAKY: passou só na repetição)"; FLAKY+=("$label")
    else
      echo "FALHA  $label"; FAILS+=("$label")
    fi
  fi
  echo "::endgroup::"
}

if [ ${#UNITS[@]} -gt 0 ]; then
  echo "== Suítes sem servidor (${#UNITS[@]})"
  for file in "${UNITS[@]}"; do
    RAN=$((RAN + 1))
    echo "::group::$file"
    if npx tsx "$file"; then echo "OK  $file"; else echo "FALHA  $file"; FAILS+=("$file"); fi
    echo "::endgroup::"
  done
fi

if [ ${#SUITES[@]} -gt 0 ]; then
  echo "== Suítes com servidor de teste (${#SUITES[@]} arquivos, um servidor novo por caso)"
  for file in "${SUITES[@]}"; do
    [ "$file" = test/loadouts.mjs ] && { rm -rf "$LOADOUT_DB" "$LOADOUT_TOKEN"; mkdir -p ../../.data; }
    [ "$file" = test/balanceamento.mjs ] && { rm -rf "$BAL_DB" "$BAL_PAINEL"; mkdir -p ../../.data; }
    # fd 3: o node da suíte não pode consumir a lista de casos pela entrada padrão
    while IFS='|' read -r -u 3 srv suite; do run_case "$srv" "$file" "$suite"; done 3< <(config_suite "$file")
    [ "$file" = test/loadouts.mjs ] && rm -rf "$LOADOUT_DB" "$LOADOUT_TOKEN"
    [ "$file" = test/balanceamento.mjs ] && rm -rf "$BAL_DB" "$BAL_PAINEL"
  done
fi

echo
echo "Suítes executadas: $RAN"
if [ ${#FLAKY[@]} -gt 0 ]; then echo "ATENÇÃO, intermitentes (passaram só na repetição): ${FLAKY[*]}"; fi
if [ ${#FAILS[@]} -gt 0 ]; then
  echo "FALHARAM (${#FAILS[@]}): ${FAILS[*]}"
  exit 1
fi
echo "Todas as suítes passaram."
