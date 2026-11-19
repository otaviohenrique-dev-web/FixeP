/**
 * Aviso de "o navegador está desenhando o jogo por SOFTWARE" (sem a placa de vídeo).
 * Uma página não pode escolher o backend gráfico do navegador (ANGLE/D3D11), mas pode DETECTAR o problema:
 * o WebGL diz qual renderizador usa ("Microsoft Basic Render Driver", "SwiftShader", "llvmpipe"...). Nesse caso o jogo roda no processador
 * (FPS baixo, CPU alta) e mostramos uma faixa discreta com o que fazer. Dá para dispensar (só agora ou para sempre, em localStorage).
 */
const KEY = "frixep_gpu_aviso";
const SOFTWARE = /basic render|swiftshader|llvmpipe|softpipe|software|microsoft basic|warp/i;

export function detectRenderer(): { renderer: string; software: boolean; noWebgl: boolean } {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { renderer: "", software: false, noWebgl: true };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { renderer, software: SOFTWARE.test(renderer), noWebgl: false };
  } catch {
    return { renderer: "", software: false, noWebgl: false };
  }
}

function steps(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "No Edge: abra edge://settings/system, ligue “Usar aceleração de hardware quando disponível” e reinicie. Se não resolver: edge://flags/#use-angle → D3D11.";
  if (/Firefox\//.test(ua)) return "No Firefox: Configurações → Geral → Desempenho → desmarque “Usar configurações de desempenho recomendadas” e marque “Usar aceleração de hardware quando disponível”.";
  if (/Chrome\//.test(ua)) return "No Chrome: abra chrome://settings/system, ligue “Usar aceleração gráfica quando disponível” e reinicie. Se não resolver: chrome://flags/#use-angle → D3D11.";
  return "Ative a aceleração de hardware (gráfica) nas configurações do navegador e atualize o driver da placa de vídeo.";
}

export function checkGpu(): void {
  let off = false;
  try { off = localStorage.getItem(KEY) === "off"; } catch { /* sem armazenamento: mostra sempre */ }
  if (off) return;
  const r = detectRenderer();
  if (!r.software && !r.noWebgl) return;
  console.warn(`[gpu] renderizador por software: ${r.renderer || "(sem WebGL)"}`);

  const css = document.createElement("style");
  css.textContent = `
.gpuw{position:fixed;left:50%;top:max(8px,env(safe-area-inset-top));transform:translateX(-50%);z-index:60;width:min(560px,calc(100vw - 24px));padding:10px 12px;border-radius:8px;
  background:rgba(14,10,8,.94);border:1px solid #b9823a;box-shadow:0 6px 24px rgba(0,0,0,.6);color:#eadfc8;font:13px/1.45 Georgia,serif;pointer-events:auto}
.gpuw b{color:#ffcf7a;display:block;margin-bottom:3px;font-family:Cinzel,Georgia,serif;letter-spacing:.04em}
.gpuw small{display:block;color:#bfae92;margin-top:4px}
.gpuw .gb{display:flex;gap:8px;margin-top:8px;justify-content:flex-end}
.gpuw button{font:600 12px Cinzel,Georgia,serif;color:#f4e6c8;background:#3a2412;border:1px solid #b9823a;border-radius:5px;padding:5px 10px;cursor:pointer}
.gpuw button:hover{background:#5a3818}
`;
  document.head.append(css);
  const el = document.createElement("div");
  el.className = "gpuw";
  el.setAttribute("role", "alert");
  const title = r.noWebgl ? "Seu navegador não ofereceu WebGL" : "O jogo está rodando no processador, sem a placa de vídeo";
  const body = r.noWebgl
    ? "Sem WebGL o jogo não consegue desenhar direito. Ative a aceleração de hardware ou atualize o navegador e o driver da placa de vídeo."
    : `O navegador está desenhando o jogo por software, o que derruba o FPS e esquenta o computador. ${steps()}`;
  el.innerHTML = `<b></b><span></span><small>Depois de mexer, reinicie o navegador por completo.</small>`;
  (el.querySelector("b") as HTMLElement).textContent = title;
  (el.querySelector("span") as HTMLElement).textContent = body;
  if (r.renderer) (el.querySelector("small") as HTMLElement).textContent = `Detectado: ${r.renderer}. Depois de mexer, reinicie o navegador por completo.`;
  const row = document.createElement("div");
  row.className = "gb";
  const later = document.createElement("button");
  later.textContent = "Fechar";
  later.onclick = () => el.remove();
  const never = document.createElement("button");
  never.textContent = "Não mostrar mais";
  never.onclick = () => { try { localStorage.setItem(KEY, "off"); } catch { /* ignora */ } el.remove(); };
  row.append(later, never);
  el.append(row);
  document.body.append(el);
}
