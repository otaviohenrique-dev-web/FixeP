/** Auxiliares de tela do painel. Tudo que vem do servidor entra por textContent (nomes de jogadores são texto livre). */

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", texto = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto) e.textContent = texto;
  return e;
};

export function botao(texto: string, onclick: () => void, cls = "pn-btn"): HTMLButtonElement {
  const b = el("button", cls, texto);
  b.type = "button";
  b.onclick = onclick;
  return b;
}

export const fmtNum = (n: unknown) => Number(n ?? 0).toLocaleString("pt-BR");

export const fmtData = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—";

/** linha "rótulo: valor" */
export function linha(rotulo: string, valor: string | number | null | undefined): HTMLElement {
  const d = el("div", "pn-linha");
  d.append(el("span", "pn-rot", rotulo), el("span", "pn-val", valor === null || valor === undefined || valor === "" ? "—" : String(valor)));
  return d;
}

/** bloco com título (seção da ficha ou da aba) */
export function secao(titulo: string, ...filhos: HTMLElement[]): HTMLElement {
  const s = el("section", "pn-sec");
  s.append(el("h3", "pn-h3", titulo), ...filhos);
  return s;
}

export function vazio(texto: string): HTMLElement {
  return el("p", "pn-vazio", texto);
}

export const ACOES_LEGIVEIS: Record<string, string> = {
  entrar_painel: "Entrou no painel",
  revelar_email: "Revelou o e-mail",
  silenciar: "Silenciou",
  dessilenciar: "Retirou o silêncio",
  banir: "Baniu",
  desbanir: "Desbaniu",
  expulsar: "Expulsou da sessão",
  resolver_denuncia: "Resolveu denúncia",
};

export const CSS = `
.pn-back{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(2,5,11,.7);
  backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:12px;font-family:"Cinzel",Georgia,serif;color:#dbeaff}
.pn-win{display:flex;flex-direction:column;width:min(860px,100%);max-height:min(88vh,820px);border-radius:10px;overflow:hidden;
  background:linear-gradient(180deg,rgba(20,34,52,.98),rgba(6,12,20,.99));border:1px solid rgba(255,150,70,.45);box-shadow:0 18px 50px rgba(0,0,0,.75)}
.pn-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,150,70,.25)}
.pn-title{flex:1;margin:0;font-size:14px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:#ffb072}
.pn-x{width:36px;height:36px;border-radius:50%;cursor:pointer;color:#dbeaff;background:rgba(8,16,28,.8);border:1px solid rgba(160,200,240,.35);font-size:18px;line-height:1}
.pn-x:focus-visible,.pn-btn:focus-visible,.pn-tab:focus-visible,.pn-in:focus-visible,.pn-sel:focus-visible,.pn-item:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.pn-tabs{display:flex;gap:6px;padding:8px 10px;overflow-x:auto;border-bottom:1px solid rgba(255,150,70,.18);-webkit-overflow-scrolling:touch}
.pn-tab{flex:none;min-height:40px;padding:0 12px;border-radius:6px;cursor:pointer;color:#bcd0e6;background:rgba(10,20,34,.7);border:1px solid rgba(160,200,240,.25);
  font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
.pn-tab[aria-selected="true"]{color:#fff;border-color:#ff9a4d;background:rgba(90,36,12,.6)}
.pn-body{flex:1;overflow-y:auto;padding:14px;font:400 14px/1.45 Georgia,serif;color:#dbeaff}
.pn-aviso{margin:0 0 10px;padding:8px 10px;border-radius:6px;font:400 13px/1.35 Georgia,serif;background:rgba(10,30,20,.7);border:1px solid rgba(120,220,150,.4);color:#bdf0cf}
.pn-aviso.erro{background:rgba(40,10,10,.75);border-color:rgba(255,110,90,.5);color:#ffc2b8}
.pn-aviso[hidden]{display:none}
.pn-btn{min-height:40px;padding:0 14px;border-radius:6px;cursor:pointer;color:#eaf4ff;background:linear-gradient(180deg,rgba(24,40,60,.9),rgba(7,13,22,.95));
  border:1px solid rgba(255,150,70,.4);font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase}
.pn-btn:hover{border-color:#ff9a4d}
.pn-btn.perigo{border-color:rgba(255,110,90,.6);color:#ffc2b8}
.pn-btn:disabled{opacity:.55;cursor:wait}
.pn-in,.pn-sel{min-height:40px;padding:0 10px;border-radius:6px;background:rgba(4,10,18,.9);color:#eaf4ff;border:1px solid rgba(160,200,240,.3);font:400 14px Georgia,serif;box-sizing:border-box;max-width:100%}
.pn-in.codigo{letter-spacing:.4em;font-size:20px;text-align:center;width:180px}
.pn-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.pn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.pn-card{padding:12px;border-radius:8px;background:rgba(10,20,34,.7);border:1px solid rgba(160,200,240,.2)}
.pn-card b{display:block;font-size:22px;color:#ffd08a;font-family:Georgia,serif}
.pn-card span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8fb0cf}
.pn-sec{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:rgba(8,14,24,.6);border:1px solid rgba(160,200,240,.15)}
.pn-h3{margin:0 0 8px;font:700 12px/1.2 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#ffb072}
.pn-linha{display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px dashed rgba(160,200,240,.1)}
.pn-rot{color:#8fb0cf;font-size:13px}
.pn-val{text-align:right;word-break:break-word}
.pn-list{list-style:none;margin:0;padding:0}
.pn-list li{padding:6px 0;border-bottom:1px dashed rgba(160,200,240,.12)}
.pn-item{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;width:100%;min-height:48px;padding:8px 10px;margin-bottom:6px;border-radius:6px;cursor:pointer;text-align:left;color:#eaf4ff;background:rgba(10,20,34,.75);border:1px solid rgba(160,200,240,.18);font:400 14px Georgia,serif}
.pn-item:hover{border-color:#ff9a4d}
.pn-tag{font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;padding:4px 7px;border-radius:4px;color:#bdf0cf;border:1px solid rgba(120,220,150,.4)}
.pn-tag.off{color:#8fb0cf;border-color:rgba(160,200,240,.25)}
.pn-tag.ban{color:#ffc2b8;border-color:rgba(255,110,90,.5)}
.pn-tag.mute{color:#ffd08a;border-color:rgba(255,190,90,.5)}
.pn-vazio{margin:8px 0;color:#8fb0cf;font-style:italic}
.pn-mono{font-family:Consolas,monospace;font-size:12px;color:#9fc0e0;word-break:break-all}
.pn-campo{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
.pn-campo>span{font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#8fb0cf}
.pn-login{display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;padding:10px 4px}
.pn-login p{margin:0;max-width:420px}
.pn-hide{display:none!important}
.pn-small{font-size:12px;color:#8fb0cf}
body.mob .pn-back{padding:0}
body.mob .pn-win{width:100%;height:100%;max-height:none;border-radius:0;border:0}
body.mob .pn-body{padding:12px}
body.mob .pn-in,body.mob .pn-sel{font-size:16px}
body.mob .pn-tab{min-height:44px}
@media (prefers-reduced-motion:reduce){.pn-back{backdrop-filter:none}}
`;
