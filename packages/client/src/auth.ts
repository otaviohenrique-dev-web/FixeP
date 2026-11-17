const API = import.meta.env.VITE_API_URL ?? `http://${location.hostname}:2567`;
const KEY = "frixep_token";

export const apiUrl = API;
export const wsUrl = API.replace(/^http/, "ws");

const read = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
const write = (t: string | null) => {
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* modo privado */ }
};

export function logout() {
  write(null);
  location.reload();
}

/** Retorna um token válido, mostrando a tela de login se necessário. */
export async function ensureLogin(): Promise<string> {
  // retorno do OAuth: #token=... (removido da URL imediatamente)
  const params = new URLSearchParams(location.hash.slice(1));
  const fromHash = params.get("token");
  const err = params.get("error");
  if (location.hash) history.replaceState(null, "", location.pathname);
  if (fromHash) write(fromHash);

  const saved = read();
  if (saved && !isExpired(saved)) return saved;
  return showLogin(err ? "Login falhou. Tente novamente." : "");
}

function isExpired(token: string): boolean {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof exp === "number" && exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function showLogin(message: string): Promise<string> {
  return new Promise(async (resolve) => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#0b0b10;color:#ddd;font-family:system-ui,sans-serif;z-index:10";
    const h = document.createElement("h1");
    h.textContent = "FrixeP";
    h.style.cssText = "margin:0 0 8px;letter-spacing:4px;color:#ff8a3d";
    box.append(h);
    if (message) {
      const m = document.createElement("p");
      m.textContent = message;
      m.style.color = "#e66";
      box.append(m);
    }
    const btn = (label: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "min-width:240px;padding:12px 16px;font-size:16px;border:1px solid #444;border-radius:8px;background:#1a1a24;color:#eee;cursor:pointer";
      b.onclick = onClick;
      box.append(b);
    };

    let avail = { google: false, discord: false, guest: false };
    try { avail = await (await fetch(`${API}/auth/providers`)).json(); } catch {
      const m = document.createElement("p");
      m.textContent = "Servidor indisponível.";
      box.append(m);
    }
    if (avail.google) btn("Entrar com Google", () => (location.href = `${API}/auth/google`));
    if (avail.discord) btn("Entrar com Discord", () => (location.href = `${API}/auth/discord`));
    if (avail.guest)
      btn("Jogar como convidado", async () => {
        const { token } = await (await fetch(`${API}/auth/guest`, { method: "POST" })).json();
        write(token);
        box.remove();
        resolve(token);
      });
    document.body.append(box);
  });
}
