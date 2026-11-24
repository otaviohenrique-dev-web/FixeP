# Regras para sessões do Claude neste projeto (economia de memória)

A máquina do dev trava (falta de memória virtual) quando várias sessões rodam suítes de integração ao mesmo tempo:
cada suíte sobe um servidor com banco embutido (PGlite, ~300 MB) e a suíte completa sobe um servidor novo por arquivo.

1. **No máximo 2 sessões filhas trabalhando ao mesmo tempo.** A coordenadora só inicia a terceira quando uma terminar.
2. **Não rode `run-all.sh` (suíte completa) localmente.** Quem roda é o CI do GitHub. Localmente rode só `typecheck`,
   os testes unitários (`*.unit.ts`) e, no máximo, o teste de integração do que você mudou, UM por vez.
3. **Encerre o que você iniciou**: servidor de teste, vite e tsx ao terminar (veja a porta e mate o processo).
4. Antes de iniciar servidores de teste, rode `powershell -ExecutionPolicy Bypass -File tools\limpar-testes.ps1` (lista) e, se houver esquecidos, `-Matar`.
5. Um servidor de teste por vez por sessão (portas 2999/5174 são do dev padrão; escolha outra porta se estiver ocupada).
6. Só diga "pronto" depois de ler o resultado do CI (nunca assuma verde).
