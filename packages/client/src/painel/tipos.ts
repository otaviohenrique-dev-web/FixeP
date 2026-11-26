/**
 * Contrato entre a janela do painel e cada aba. Para acrescentar uma aba (fases seguintes):
 * 1) crie painel/abas/<nome>.ts exportando um AbaPainel;
 * 2) inclua-a em painel/registro.ts;
 * 3) crie o arquivo de rotas no servidor e monte-o em packages/server/src/painel/rotas.ts.
 */

export type MetodoPainel = "GET" | "POST";

/** o que a janela entrega a cada aba */
export interface Painel {
  /** chamada ao servidor (/api/admin + caminho). Erros viram exceção com mensagem em português. */
  api<T = any>(metodo: MetodoPainel, caminho: string, corpo?: unknown): Promise<T>;
  /** troca de aba; `param` é entregue ao `abrir` da aba destino (ex.: a ficha de um jogador) */
  irPara(abaId: string, param?: unknown): void;
  /** aviso discreto no topo da janela */
  aviso(texto: string, tipo?: "ok" | "erro"): void;
}

/** uma aba montada: o elemento e o que fazer quando ela entra e sai de vista */
export interface InstanciaAba {
  el: HTMLElement;
  /** a aba entrou na tela: carregue os dados aqui. `param` vem de irPara. */
  abrir(param?: unknown): void | Promise<void>;
  /** a aba saiu da tela ou o painel fechou: pare temporizadores aqui */
  fechar?(): void;
}

export interface AbaPainel {
  id: string;
  titulo: string;
  montar(p: Painel): InstanciaAba;
}
