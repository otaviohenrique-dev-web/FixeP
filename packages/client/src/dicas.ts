import type { DicaId, DicasVistasEvent } from "@frixep/shared";

/**
 * Dicas contextuais (C1.6): um balão discreto no canto superior direito, mostrado UMA vez por personagem quando o
 * gatilho acontece pela primeira vez. Some sozinho em ~8 s ou ao tocar no X. Fica longe do joystick (esquerda) e das
 * habilidades (canto inferior direito). Enquanto a faixa do tutorial estiver aberta, a dica espera (não aparece por cima).
 * O servidor guarda quais já foram vistas (dica_vista); ao entrar, recebe a lista (dicas_vistas) e não repete.
 */

export interface Dicas {
  /** Chamado pelo jogo quando o gatilho acontece. Não faz nada se a dica já foi vista ou ainda não chegou a lista. */
  gatilho(id: DicaId): void;
  /** Chega a lista de dicas já vistas (ao entrar na sala). */
  carregar(ev: DicasVistasEvent): void;
}

export interface DicasOpts {
  /** Envia ao servidor que a dica foi vista. */
  enviar(id: DicaId): void;
  /** Diz se a faixa do tutorial está aberta (a dica espera). */
  tutorialAberto(): boolean;
}

/** Texto curto de cada dica: versão de toque e versão de teclado/mouse. */
export const TEXTO_DICA: Record<DicaId, { toque: string; teclado: string }> = {
  primeiro_ataque: { toque: "Toque no botão de ataque para bater no alvo travado.", teclado: "Aperte ESPAÇO para atacar o alvo travado." },
  primeira_skill: { toque: "Habilidades gastam recurso e têm recarga, por isso o botão pode ficar cinza por um tempo.", teclado: "Q, W e E usam habilidades. Elas gastam recurso e têm recarga." },
  vida_baixa: { toque: "Vida baixa! Toque no botão de poção para se curar.", teclado: "Vida baixa! Aperte F para beber uma poção." },
  primeira_pocao: { toque: "Poção bebida. Ela tem recarga: use de novo quando ela voltar.", teclado: "Poção bebida. Ela tem recarga: aperte F de novo quando ela voltar." },
  item_no_chao: { toque: "Itens no chão: chegue perto e toque no item para pegar.", teclado: "Itens no chão: chegue perto e clique no item para pegar." },
  mochila_cheia: { toque: "Mochila cheia: venda, use ou guarde itens no baú da cidade.", teclado: "Mochila cheia: venda, use ou guarde itens no baú da cidade." },
  recurso_insuficiente: { toque: "Falta recurso para essa habilidade. Ele volta com o tempo; use o ataque básico.", teclado: "Falta recurso para essa habilidade. Ele volta com o tempo; use o ataque básico." },
};

const TEMPO_S = 8;

const CSS = `
.dica{position:fixed;z-index:16;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 92px);left:50%;transform:translateX(-50%);width:max-content;max-width:min(300px,calc(100vw - 24px));
  padding:7px 34px 7px 11px;border-radius:7px;pointer-events:auto;
  font:600 12px/1.35 "Cinzel",Georgia,serif;color:#f4e6b8;
  background:linear-gradient(180deg,rgba(20,34,52,.93),rgba(6,12,20,.93));border:1px solid rgba(120,200,255,.5);box-shadow:0 6px 18px rgba(0,0,0,.55)}
.dica[hidden]{display:none}
.dica small{display:block;margin-bottom:2px;font:700 9px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#8fd0ff}
.dica-x{position:absolute;top:2px;right:2px;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:#cfe6ff;font:700 16px/1 Georgia,serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
@media (max-width:640px){.dica{font-size:11px;max-width:calc(100vw - 24px)}}
`;

/** A faixa do tutorial está aberta (não minimizada) na tela? Lê o próprio elemento, sem depender do módulo tutorial. */
export function tutorialFaixaAberta(): boolean {
  const b = document.querySelector<HTMLElement>(".tut");
  return !!b && !b.hidden && !b.classList.contains("min");
}

/** Monta o balão de dicas. Sem dependências do jogo: quem usa passa `enviar` e `tutorialAberto`. */
export function mountDicas(opts: DicasOpts): Dicas {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const box = document.createElement("div");
  box.className = "dica";
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.hidden = true;
  document.body.append(box);

  let vistas: Set<string> | null = null; // null = a lista do servidor ainda não chegou
  const pendentes = new Set<DicaId>(); // gatilhos que aconteceram antes da lista chegar ou com o tutorial aberto
  let mostrando: DicaId | null = null;
  let timer = 0;

  function fechar() {
    clearTimeout(timer);
    box.hidden = true;
    mostrando = null;
  }

  function mostrar(id: DicaId) {
    vistas?.add(id);
    opts.enviar(id); // uma vez só: o servidor grava e não manda de novo
    const txt = TEXTO_DICA[id];
    const touch = matchMedia("(pointer: coarse)").matches;
    box.replaceChildren();
    const small = document.createElement("small");
    small.textContent = "Dica";
    const p = document.createElement("span");
    p.textContent = touch ? txt.toque : txt.teclado;
    const x = document.createElement("button");
    x.className = "dica-x";
    x.type = "button";
    x.textContent = "×";
    x.title = x.ariaLabel = "Fechar dica";
    x.addEventListener("click", fechar);
    box.append(small, p, x);
    box.hidden = false;
    mostrando = id;
    timer = window.setTimeout(fechar, TEMPO_S * 1000);
  }

  /** Mostra a próxima pendente, se a tela permitir (sem balão ativo e sem faixa do tutorial aberta). */
  function proxima() {
    if (!vistas || mostrando || opts.tutorialAberto()) return;
    for (const id of pendentes) {
      pendentes.delete(id);
      if (!vistas.has(id)) { mostrar(id); return; }
    }
  }

  // a faixa do tutorial pode fechar sem gatilho novo: confere de tempos em tempos (barato: só lê o estado)
  window.setInterval(proxima, 1000);

  return {
    gatilho(id) {
      if (vistas?.has(id) || pendentes.has(id)) return;
      pendentes.add(id);
      proxima();
    },
    carregar(ev) {
      vistas = new Set(ev.ids);
      for (const id of vistas) pendentes.delete(id as DicaId);
      proxima();
    },
  };
}
