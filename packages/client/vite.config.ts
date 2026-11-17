import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, "../../assets");
const TYPES: Record<string, string> = { ".png": "image/png", ".json": "application/json", ".wav": "audio/wav", ".ogg": "audio/ogg", ".mp3": "audio/mpeg" };
// "source" tem os arquivos editáveis (.aseprite, .psd): pesados e não pertencem ao jogo publicado.
const BLOCKED = new Set(["source"]);

/** Lista os atlas existentes ("characters/warrior"...). O jogo só pede esses, sem 404 no console. */
function listAtlases(): string[] {
  const out: string[] = [];
  for (const dir of ["characters", "monsters"]) {
    const full = path.join(ASSETS, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith(".json") && fs.existsSync(path.join(full, f.replace(/\.json$/, ".png")))) out.push(`${dir}/${f.replace(/\.json$/, "")}`);
    }
  }
  return out;
}

/**
 * Serve a arte do repositório (pasta `assets/` na raiz) em /assets/... no desenvolvimento e a copia para o build,
 * sem a pasta source/. Assim o artista só precisa salvar em assets/ e recarregar a página.
 */
function frixepAssets(): Plugin {
  return {
    name: "frixep-assets",
    configureServer(server) {
      server.middlewares.use("/assets", (req, res, next) => {
        try {
          const rel = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
          if (rel === "_manifest.json") {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-cache");
            res.end(JSON.stringify(listAtlases()));
            return;
          }
          const file = path.resolve(ASSETS, rel);
          const top = rel.split("/")[0];
          // impede sair da pasta (../) e acessar a pasta source
          if (!file.startsWith(ASSETS + path.sep) || BLOCKED.has(top) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404;
            res.end("não encontrado");
            return;
          }
          res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
          res.setHeader("Cache-Control", "no-cache"); // o artista edita e recarrega
          fs.createReadStream(file).pipe(res);
        } catch {
          next();
        }
      });
    },
    closeBundle() {
      const out = path.resolve(here, "dist/assets");
      if (!fs.existsSync(ASSETS)) return;
      fs.cpSync(ASSETS, out, {
        recursive: true,
        filter: (src) => {
          const rel = path.relative(ASSETS, src).split(path.sep)[0];
          return !BLOCKED.has(rel) && path.basename(src) !== ".gitkeep";
        },
      });
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, "_manifest.json"), JSON.stringify(listAtlases()));
    },
  };
}

// strictPort: o servidor (CORS e retorno do OAuth) espera o cliente exatamente em 5173.
export default defineConfig({
  plugins: [frixepAssets()],
  server: { port: 5173, strictPort: true },
  build: { target: "esnext" }, // top-level await em main.ts
});
