// Origens permitidas (proteção contra clones do cliente hospedados em outros sites).
// Lista = ALLOWED_ORIGINS (separada por vírgulas); sem ela: CLIENT_URL + https://frixep.com + https://www.frixep.com.
// Fora de produção, localhost / 127.0.0.1 / [::1] em qualquer porta também passam (dev e testes).
// Requisição SEM cabeçalho Origin (curl, testes, health check, servidor-a-servidor) sempre passa.

const norm = (o: string): string => o.trim().replace(/\/+$/, "").toLowerCase();

export function listaOrigens(env: NodeJS.ProcessEnv = process.env): string[] {
  const bruto = env.ALLOWED_ORIGINS?.trim()
    ? env.ALLOWED_ORIGINS.split(",")
    : [env.CLIENT_URL ?? "http://localhost:5173", "https://frixep.com", "https://www.frixep.com"];
  return [...new Set(bruto.map(norm).filter(Boolean))];
}

export function origemPermitida(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (origin === undefined || origin === "") return true;
  if (listaOrigens(env).includes(norm(origin))) return true;
  if (env.NODE_ENV !== "production") {
    try {
      const h = new URL(origin).hostname;
      if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
    } catch {}
  }
  return false;
}
