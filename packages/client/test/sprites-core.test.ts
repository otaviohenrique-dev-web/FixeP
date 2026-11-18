// Testes da lógica pura do carregador de sprites. Uso (em packages/client): npm run test:sprites
import { dirFromScreen, gridAngleToDir, pickDirection, animFallbacks, parseTag, validateAtlasJson, totalDuration, DIRS, type Dir } from "../src/sprites-core";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const deg = (d: number) => (d * Math.PI) / 180;

console.log("\n== Direção na tela a partir do ângulo da grade ==");
// tabela do guia: +x da grade = SE, +y = SW, -x = NW, -y = NE; E da tela = grade (+x,-y)
check("grade +x (0°) vira SE", gridAngleToDir(0) === "se");
check("grade +y (90°) vira SW", gridAngleToDir(deg(90)) === "sw");
check("grade -x (180°) vira NW", gridAngleToDir(deg(180)) === "nw");
check("grade -y (270°) vira NE", gridAngleToDir(deg(270)) === "ne");
check("grade -45° vira E (direita pura na tela)", gridAngleToDir(deg(-45)) === "e");
check("grade 45° vira S (baixo puro na tela)", gridAngleToDir(deg(45)) === "s");
check("grade 135° vira W", gridAngleToDir(deg(135)) === "w");
check("grade 225° vira N", gridAngleToDir(deg(225)) === "n");
check("ângulos negativos e acima de 360° funcionam", gridAngleToDir(deg(-360)) === "se" && gridAngleToDir(deg(720)) === "se");
check("vetores da tela: direita, baixo, esquerda, cima", dirFromScreen(1, 0) === "e" && dirFromScreen(0, 1) === "s" && dirFromScreen(-1, 0) === "w" && dirFromScreen(0, -1) === "n");
check("todas as 8 direções são alcançáveis", new Set(Array.from({ length: 360 }, (_, i) => gridAngleToDir(deg(i)))).size === 8);

console.log("\n== Espelhamento (Fase A: só SE e NE desenhados) ==");
const faseA = (d: Dir) => d === "se" || d === "ne";
const pick = (d: Dir) => pickDirection(d, faseA);
check("SE usa o desenho de SE, sem espelho", JSON.stringify(pick("se")) === JSON.stringify({ dir: "se", flip: false }));
check("SW usa SE espelhado", JSON.stringify(pick("sw")) === JSON.stringify({ dir: "se", flip: true }));
check("NE usa o desenho de NE, sem espelho", JSON.stringify(pick("ne")) === JSON.stringify({ dir: "ne", flip: false }));
check("NW usa NE espelhado", JSON.stringify(pick("nw")) === JSON.stringify({ dir: "ne", flip: true }));
check("E usa a diagonal mais próxima (SE)", pick("e")?.dir === "se" && pick("e")?.flip === false);
check("S usa SE", pick("s")?.dir === "se");
check("W usa SE espelhado", pick("w")?.dir === "se" && pick("w")?.flip === true);
check("N usa NE", pick("n")?.dir === "ne");
check("toda direção encontra um desenho na Fase A", DIRS.every((d) => pick(d) !== null));
const faseB = (d: Dir) => ["s", "se", "e", "ne", "n"].includes(d);
check("Fase B: SW espelha SE e W espelha E", pickDirection("sw", faseB)?.flip === true && pickDirection("sw", faseB)?.dir === "se" && pickDirection("w", faseB)?.dir === "e" && pickDirection("w", faseB)?.flip === true);
check("Fase B: S, E e N usam desenho próprio, sem espelho", ["s", "e", "n"].every((d) => { const r = pickDirection(d as Dir, faseB); return r?.dir === d && !r.flip; }));
check("atlas sem nenhuma direção devolve nulo", pickDirection("se", () => false) === null);
check("atlas só com SW (sem SE): SE usa SW espelhado", JSON.stringify(pickDirection("se", (d) => d === "sw")) === JSON.stringify({ dir: "sw", flip: true }));

console.log("\n== Tags e animações ==");
check("walk_se vira animação walk, direção se", JSON.stringify(parseTag("walk_se")) === JSON.stringify({ anim: "walk", dir: "se" }));
check("maiúsculas são aceitas (Attack_NE)", JSON.stringify(parseTag("Attack_NE")) === JSON.stringify({ anim: "attack", dir: "ne" }));
check("tag sem direção é ignorada", parseTag("walk") === null && parseTag("walk_") === null && parseTag("_se") === null);
check("direção inexistente é ignorada", parseTag("walk_norte") === null);
check("nome com caracteres estranhos é ignorado", parseTag("wa lk_se") === null && parseTag("../x_se") === null);
check("skill sem desenho cai em attack", animFallbacks("skill")[1] === "attack");
check("windup sem desenho cai em idle", animFallbacks("windup")[1] === "idle");

console.log("\n== Validação do JSON do Aseprite ==");
const frame = (n: number, ms = 100, w = 64, h = 64) => ({ filename: `warrior ${n}.aseprite`, frame: { x: n * 64, y: 0, w: 64, h: 64 }, sourceSize: { w, h }, duration: ms });
const good = { frames: [0, 1, 2, 3, 4, 5].map((n) => frame(n, 100)), meta: { size: { w: 384, h: 64 }, frameTags: [{ name: "idle_se", from: 0, to: 3, direction: "forward" }, { name: "walk_se", from: 4, to: 5, direction: "forward" }] } };
const g = validateAtlasJson(good);
check("atlas correto é aceito", g.ok && g.tags.length === 2 && g.frames.length === 6);
check("duração total de 4 quadros de 100 ms = 400", g.ok && totalDuration(g.frames.slice(0, 4)) === 400);
check("JSON em formato de hash (sem lista) é recusado com dica", !validateAtlasJson({ frames: {}, meta: { frameTags: [] } }).ok);
check("sem tags é recusado e pede --list-tags", (() => { const r = validateAtlasJson({ frames: good.frames, meta: { frameTags: [] } }); return !r.ok && r.reason.includes("--list-tags"); })());
check("quadro cortado (trim) é recusado", (() => { const r = validateAtlasJson({ frames: [frame(0, 100, 40, 50)], meta: { frameTags: [{ name: "idle_se", from: 0, to: 0 }] } }); return !r.ok && r.reason.includes("trim"); })());
check("tag apontando para fora é recusada", !validateAtlasJson({ frames: good.frames, meta: { frameTags: [{ name: "idle_se", from: 0, to: 99 }] } }).ok);
check("só tags inválidas é recusado", !validateAtlasJson({ frames: good.frames, meta: { frameTags: [{ name: "lixo", from: 0, to: 1 }] } }).ok);
check("duração ausente vira 100 ms", (() => { const r = validateAtlasJson({ frames: [{ filename: "a", sourceSize: { w: 64, h: 64 } }], meta: { frameTags: [{ name: "idle_se", from: 0, to: 0 }] } }); return r.ok && r.frames[0].duration === 100; })());
check("entradas absurdas não quebram (null, texto, número, lista)", [null, undefined, "x", 5, [], {}].every((v) => !validateAtlasJson(v).ok));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
