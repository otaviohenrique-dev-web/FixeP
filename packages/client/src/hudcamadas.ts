/**
 * Enquanto um painel grande estiver aberto (mochila, diário/variações/caixa de NPC, loja, baú, menu), os botões
 * flutuantes do HUD (bolsa, menu, moedas, FPS, botões de ação, poção, grupo, chat, joystick) somem para não ficarem por cima
 * do painel; ao fechar, voltam. Só CSS: `body:has(...)` marca o estado, sem JavaScript por quadro.
 * Navegadores sem `:has` (antigos) mantêm o HUD visível, como antes.
 */
const CSS = `
body:has(.gm-back.open,.iv-back.open,.qst-back.open,.ec-back.open,.vt-back.open,.cf-back.open)
  :is(.hd,.gm-btn,.iv-btn,.ut-btn,.ut-pop,.ec-wallet,.st,.qd-dock,.pt,.ch,.js-zone,.js-base,.js-rest,.dica,.jg-bar){visibility:hidden!important;pointer-events:none!important}
`;

export function mountHudCamadas() {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
}
