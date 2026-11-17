import { WARRIOR, type ActionId } from "@frixep/shared";

/** HUD do combate em DOM: barra de vida, botões de ação com recarga e aviso de morte. */

export interface HudOptions {
  /** chamado quando o jogador aciona uma ação e ela não está em recarga local */
  onAction(a: ActionId): void;
}
export interface Hud {
  trigger(a: ActionId): void;
  setHp(hp: number, max: number): void;
  setDead(secondsLeft: number | null): void;
  setBuff(on: boolean): void;
}

const CSS = `
.hd{position:fixed;inset:0;z-index:15;pointer-events:none;font-family:"Cinzel",Georgia,serif;color:#dbeaff}
.hd-hp{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));width:min(230px,40vw)}
.hd-hp-bar{position:relative;height:20px;border-radius:4px;overflow:hidden;background:rgba(8,14,24,.85);border:1px solid rgba(255,150,70,.45);box-shadow:0 4px 14px rgba(0,0,0,.6)}
.hd-hp-fill{position:absolute;inset:0;width:100%;transform-origin:left;background:linear-gradient(180deg,#e0472b,#8d1a0c);transition:transform .15s}
.hd-hp-lag{position:absolute;inset:0;width:100%;transform-origin:left;background:rgba(255,220,160,.55);transition:transform .7s .25s}
.hd-hp-txt{position:absolute;inset:0;display:grid;place-items:center;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-shadow:0 1px 3px #000}
.hd-buff{margin-top:6px;font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.25em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 10px rgba(255,120,40,.6);opacity:0;transition:opacity .2s}
.hd-buff.on{opacity:1}
.hd-bar{position:absolute;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:10px;align-items:flex-end;pointer-events:auto}
.hd-btn{position:relative;width:56px;height:56px;border-radius:50%;cursor:pointer;color:#eaf4ff;overflow:hidden;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;
  background:radial-gradient(circle at 50% 35%,rgba(34,52,76,.95),rgba(6,12,20,.95));border:2px solid rgba(255,150,70,.5);box-shadow:0 4px 14px rgba(0,0,0,.65),inset 0 1px 0 rgba(180,220,255,.15);
  display:grid;place-items:center;transition:transform .1s,border-color .15s,box-shadow .15s}
.hd-btn.big{width:68px;height:68px;border-color:rgba(255,170,90,.8)}
.hd-btn:active{transform:scale(.92)}
.hd-btn:hover{border-color:#ff9a4d;box-shadow:0 0 18px rgba(255,120,40,.4),0 4px 14px rgba(0,0,0,.65)}
.hd-btn:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.hd-name{font:700 9px/1.1 "Cinzel",Georgia,serif;letter-spacing:.06em;text-transform:uppercase;text-align:center;text-shadow:0 1px 3px #000;padding:0 2px;pointer-events:none}
.hd-key{position:absolute;top:3px;left:0;right:0;text-align:center;font:700 8px/1 "Cinzel",Georgia,serif;color:#ffb072;pointer-events:none;letter-spacing:.08em}
.hd-cd{position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(0,0,0,.68);pointer-events:none}
.hd-cdn{position:absolute;inset:0;display:none;place-items:center;font:700 16px/1 "Cinzel",Georgia,serif;text-shadow:0 1px 4px #000;pointer-events:none}
.hd-btn.cool .hd-cdn{display:grid}
.hd-btn.ready-pulse{animation:hd-pulse .45s ease-out}
.hd-dead{position:fixed;inset:0;z-index:16;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;pointer-events:none;
  background:radial-gradient(ellipse at center,rgba(60,0,0,.35),rgba(10,0,0,.8));font-family:"Cinzel",Georgia,serif}
.hd-dead.on{display:flex}
.hd-dead h2{margin:0;font-size:clamp(28px,7vw,54px);font-weight:900;letter-spacing:.2em;text-indent:.2em;color:#ff6a5a;text-shadow:0 0 28px rgba(255,60,30,.6)}
.hd-dead p{margin:0;font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:#cfdcec}
@keyframes hd-pulse{0%{box-shadow:0 0 0 0 rgba(255,150,70,.8)}100%{box-shadow:0 0 0 14px rgba(255,150,70,0)}}
@media (max-width:820px){.hd-bar{gap:7px}.hd-btn{width:50px;height:50px}.hd-btn.big{width:60px;height:60px}.hd-hp{bottom:90px;width:min(220px,56vw)}}
`;

export function mountHud(opts: HudOptions): Hud {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const root = document.createElement("div");
  root.className = "hd";
  root.innerHTML = `
    <div class="hd-hp"><div class="hd-hp-bar"><div class="hd-hp-lag"></div><div class="hd-hp-fill"></div><div class="hd-hp-txt"></div></div><div class="hd-buff">Grito ativo</div></div>
    <div class="hd-bar"></div>`;
  document.body.append(root);

  const dead = document.createElement("div");
  dead.className = "hd-dead";
  dead.innerHTML = `<h2>Você caiu</h2><p></p>`;
  document.body.append(dead);

  const fill = root.querySelector<HTMLElement>(".hd-hp-fill")!;
  const lag = root.querySelector<HTMLElement>(".hd-hp-lag")!;
  const txt = root.querySelector<HTMLElement>(".hd-hp-txt")!;
  const buff = root.querySelector<HTMLElement>(".hd-buff")!;
  const bar = root.querySelector<HTMLElement>(".hd-bar")!;
  const deadSub = dead.querySelector("p")!;

  const cdUntil: Partial<Record<ActionId, number>> = {};
  const els = new Map<ActionId, { btn: HTMLElement; cd: HTMLElement; n: HTMLElement }>();

  // ordem visual: esquiva, skills, ataque (maior) à direita
  const order: ActionId[] = ["dodge", "skill1", "skill2", "skill3", "attack"];
  for (const a of order) {
    const def = WARRIOR.actions[a];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hd-btn" + (a === "attack" ? " big" : "");
    b.setAttribute("aria-label", `${def.name} (${def.key})`);
    b.innerHTML = `<span class="hd-key">${def.key}</span><span class="hd-name">${def.name}</span><span class="hd-cd"></span><span class="hd-cdn"></span>`;
    // pointerdown: resposta imediata no toque, sem esperar o "click"
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      trigger(a);
    });
    bar.append(b);
    els.set(a, { btn: b, cd: b.querySelector(".hd-cd")!, n: b.querySelector(".hd-cdn")! });
  }

  function trigger(a: ActionId) {
    const now = performance.now();
    if (now < (cdUntil[a] ?? 0)) return;
    cdUntil[a] = now + WARRIOR.actions[a].cd * 1000;
    opts.onAction(a);
  }

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    for (const [a, e] of els) {
      const left = (cdUntil[a] ?? 0) - now;
      const total = WARRIOR.actions[a].cd * 1000;
      if (left > 0) {
        e.btn.classList.add("cool");
        e.cd.style.height = `${Math.min(100, (left / total) * 100)}%`;
        e.n.textContent = left > 950 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1);
      } else if (e.btn.classList.contains("cool")) {
        e.btn.classList.remove("cool");
        e.cd.style.height = "0";
        e.btn.classList.remove("ready-pulse");
        void e.btn.offsetWidth; // reinicia a animação
        e.btn.classList.add("ready-pulse");
      }
    }
  };
  raf = requestAnimationFrame(tick);
  void raf;

  return {
    trigger,
    setHp(hp, max) {
      const r = Math.max(0, Math.min(1, hp / max));
      fill.style.transform = `scaleX(${r})`;
      lag.style.transform = `scaleX(${r})`;
      txt.textContent = `${Math.ceil(hp)} / ${max}`;
    },
    setDead(secondsLeft) {
      dead.classList.toggle("on", secondsLeft !== null);
      if (secondsLeft !== null) deadSub.textContent = `Renascendo em ${Math.max(0, Math.ceil(secondsLeft))}`;
    },
    setBuff(on) {
      buff.classList.toggle("on", on);
    },
  };
}
