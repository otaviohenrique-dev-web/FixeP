import { mountLogin } from "./login";

const API =import.meta.env.VITE_API_URL ?? `http://${location.hostname}:2567`;
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

async function showLogin(message: string): Promise<string> {
  let providers = { google: false, discord: false, guest: false };
  let msg = message;
  try {
    providers = await (await fetch(`${API}/auth/providers`)).json();
  } catch {
    msg = "Servidor indisponível. Tente novamente em instantes.";
  }

  return new Promise((resolve) => {
    const ui = mountLogin({
      message: msg,
      providers,
      onGoogle: () => { location.href = `${API}/auth/google`; },
      onDiscord: () => { location.href = `${API}/auth/discord`; },
      onGuest: async () => {
        try {
          const res = await fetch(`${API}/auth/guest`, { method: "POST" });
          const { token } = await res.json();
          if (!token) throw new Error("sem token");
          write(token);
          ui.destroy();
          resolve(token);
        } catch {
          ui.setMessage("Não foi possível entrar como convidado.");
        }
      },
    });
  });
}
