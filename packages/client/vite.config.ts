import { defineConfig } from "vite";

// strictPort: o servidor (CORS e retorno do OAuth) espera o cliente exatamente em 5173.
export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: { target: "esnext" }, // top-level await em main.ts
});
