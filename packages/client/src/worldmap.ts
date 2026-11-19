import { ZONES, type ZoneDef } from "@frixep/shared";

/**
 * Mapa-mundo do portão de Brasalume: lista de destinos montada a partir de ZONES (toda zona de combate nova aparece sozinha).
 * É só DOM, criado uma vez e escondido/mostrado: custo zero por quadro. A escolha sai por `onPick`; quem decide é o servidor.
 */
export interface WorldMap { open(): void; close(): void; readonly visible: boolean }

const levels = (z: ZoneDef) => {
  const all = [...z.enemies.map((e) => e.level), ...(z.boss ? [z.boss.level] : [])];
  return all.length ? [Math.min(...all), Math.max(...all)] : [0, 0];
};

export function mountWorldMap(onPick: (zoneId: number) => void): WorldMap {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(6,4,10,.72);font-family:Cinzel,Georgia,serif;color:#f1e6c4";
  const box = document.createElement("div");
  box.style.cssText = "width:min(440px,92vw);max-height:88vh;overflow:auto;padding:18px 18px 14px;background:linear-gradient(#2a1f1a,#1b1410);border:2px solid #8a6a45;border-radius:8px;box-shadow:0 8px 40px #000";
  const h = document.createElement("div");
  h.textContent = "Portão de Brasalume";
  h.style.cssText = "text-align:center;font-size:22px;letter-spacing:.1em;margin-bottom:4px";
  const sub = document.createElement("div");
  sub.textContent = "Para onde você vai?";
  sub.style.cssText = "text-align:center;font-size:13px;opacity:.75;margin-bottom:12px";
  box.append(h, sub);
  for (const z of Object.values(ZONES)) {
    if (z.safe) continue;
    const [lo, hi] = levels(z);
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText = "display:block;width:100%;text-align:left;margin:8px 0;padding:10px 12px;background:#3a2b20;color:inherit;border:1px solid #6a5238;border-radius:6px;cursor:pointer;font:inherit";
    b.innerHTML = `<b style="font-size:16px">${z.name}</b><br><span style="font-size:12px;opacity:.8">Inimigos nível ${lo}–${hi} · saque x${z.lootMult}</span>`;
    b.onclick = () => { api.close(); onPick(z.id); };
    box.append(b);
  }
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "Ficar na cidade";
  x.style.cssText = "display:block;margin:12px auto 0;padding:6px 16px;background:none;color:#cbbd96;border:1px solid #6a5238;border-radius:6px;cursor:pointer;font:inherit";
  x.onclick = () => api.close();
  box.append(x);
  root.append(box);
  root.addEventListener("pointerdown", (e) => { if (e.target === root) api.close(); });
  document.body.appendChild(root);
  const api: WorldMap = {
    open() { root.style.display = "flex"; },
    close() { root.style.display = "none"; },
    get visible() { return root.style.display !== "none"; },
  };
  return api;
}
