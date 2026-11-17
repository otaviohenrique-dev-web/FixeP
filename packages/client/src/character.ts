import { NAME_MAX, NAME_MIN, PLAYABLE_CLASSES, type CharClass, type CharacterInfo } from "@frixep/shared";
import { apiUrl, logout } from "./auth";
import { mountScreen } from "./login";

const CLASSES: { id: CharClass; name: string; role: string }[] = [
  { id: "warrior", name: "Guerreiro", role: "Tanque" },
  { id: "archer", name: "Arqueiro", role: "Dano à distância" },
  { id: "cleric", name: "Clérigo", role: "Suporte" },
];

const CSS = `
.fc-field{display:flex;flex-direction:column;gap:6px}
.fc-label{font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.3em;text-transform:uppercase;color:#8fb0cf}
.fc-input{width:100%;box-sizing:border-box;min-height:50px;padding:0 14px;border-radius:5px;font:700 16px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;color:#fff;text-align:center;
  background:rgba(6,12,20,.85);border:1px solid rgba(255,150,70,.4);box-shadow:inset 0 2px 8px rgba(0,0,0,.5);outline:none;transition:border-color .18s,box-shadow .18s}
.fc-input::placeholder{color:#5f7893;font-weight:400}
.fc-input:focus{border-color:#ff9a4d;box-shadow:inset 0 2px 8px rgba(0,0,0,.5),0 0 18px rgba(255,120,40,.3)}
.fc-cls{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.fc-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:5px;cursor:pointer;color:#dbeaff;text-align:center;
  background:linear-gradient(180deg,rgba(24,40,60,.82),rgba(7,13,22,.9));border:1px solid rgba(160,200,240,.25);transition:border-color .18s,box-shadow .18s}
.fc-card b{font:700 12px/1.1 "Cinzel",Georgia,serif;letter-spacing:.08em;text-transform:uppercase}
.fc-card span{font:400 10px/1.2 Georgia,serif;color:#8fb0cf}
.fc-card[aria-checked=true]{border-color:#ff9a4d;box-shadow:0 0 18px rgba(255,120,40,.3);background:linear-gradient(180deg,rgba(120,50,12,.85),rgba(50,18,6,.95))}
.fc-card:disabled{opacity:.45;cursor:not-allowed}
.fc-card:focus-visible,.fc-link:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.fc-link{align-self:center;margin-top:2px;background:none;border:0;color:#7fa6cc;font:400 12px/1 Georgia,serif;letter-spacing:.08em;cursor:pointer;text-decoration:underline;padding:8px}
`;

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Garante que a conta tem personagem: se não tiver, mostra a criação. Devolve o personagem. */
export async function ensureCharacter(token: string): Promise<CharacterInfo> {
  for (;;) {
    let res: Response | null = null;
    try {
      res = await fetch(`${apiUrl}/api/me`, { headers: authHeaders(token) });
    } catch { /* sem rede: cai no aviso abaixo */ }

    if (res?.status === 401) { logout(); return new Promise(() => {}); } // sessão inválida: volta ao login
    if (res?.ok) {
      const { character } = (await res.json()) as { character: CharacterInfo | null };
      return character ?? (await createScreen(token));
    }
    await retryScreen(); // servidor indisponível: o jogador decide tentar de novo
  }
}

function retryScreen(): Promise<void> {
  return new Promise((resolve) => {
    const s = mountScreen("Conexão", "Não foi possível falar com o servidor.");
    s.button("Tentar novamente", "&#8635;", true, () => { s.destroy(); resolve(); });
  });
}

function createScreen(token: string): Promise<CharacterInfo> {
  return new Promise((resolve) => {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);

    const s = mountScreen("Crie seu Portador");

    const field = document.createElement("div");
    field.className = "fc-field";
    field.innerHTML = `<label class="fc-label" for="fc-name">Nome do personagem</label>`;
    const input = document.createElement("input");
    input.id = "fc-name";
    input.className = "fc-input";
    input.maxLength = NAME_MAX;
    input.placeholder = `${NAME_MIN} a ${NAME_MAX} caracteres`;
    input.autocomplete = "off";
    input.spellcheck = false;
    field.append(input);

    const clsWrap = document.createElement("div");
    clsWrap.className = "fc-field";
    clsWrap.innerHTML = `<span class="fc-label" id="fc-cls-l">Classe</span>`;
    const grid = document.createElement("div");
    grid.className = "fc-cls";
    grid.setAttribute("role", "radiogroup");
    grid.setAttribute("aria-labelledby", "fc-cls-l");
    let chosen: CharClass = PLAYABLE_CLASSES[0];
    for (const c of CLASSES) {
      const playable = PLAYABLE_CLASSES.includes(c.id);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fc-card";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(playable && c.id === chosen));
      b.disabled = !playable;
      b.innerHTML = `<b></b><span></span>`;
      b.querySelector("b")!.textContent = c.name;
      b.querySelector("span")!.textContent = playable ? c.role : "Em breve";
      b.onclick = () => {
        chosen = c.id;
        grid.querySelectorAll(".fc-card").forEach((el) => el.setAttribute("aria-checked", String(el === b)));
      };
      grid.append(b);
    }
    clsWrap.append(grid);

    s.panel.insertBefore(field, s.msg);
    s.panel.insertBefore(clsWrap, s.msg);

    const submit = async () => {
      const name = input.value.trim().replace(/\s+/g, " ");
      if (name.length < NAME_MIN || name.length > NAME_MAX) return s.setMessage(`O nome deve ter de ${NAME_MIN} a ${NAME_MAX} caracteres.`);
      s.setMessage("");
      try {
        const res = await fetch(`${apiUrl}/api/character`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ name, class: chosen }) });
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) return logout();
        if (!res.ok) return s.setMessage(body.error ?? "Não foi possível criar o personagem.");
        s.destroy();
        style.remove();
        resolve(body.character as CharacterInfo);
      } catch {
        s.setMessage("Servidor indisponível. Tente novamente.");
      }
    };
    const go = s.button("Começar a jornada", "&#10022;", true, submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go.click(); });

    const out = document.createElement("button");
    out.type = "button";
    out.className = "fc-link";
    out.textContent = "Voltar ao login";
    out.onclick = () => logout();
    s.panel.insertBefore(out, s.msg);

    setTimeout(() => input.focus(), 900); // depois da animação de entrada
  });
}
