// ─────────────────────────── Jogo do Impostor ───────────────────────────
"use strict";

const state = {
  players: [],        // nomes
  impostorMode: "manual",
  impostorCount: 1,
  roles: [],          // por jogador: { name, isImpostor }
  word: null,         // { p, d, c }
  revealIndex: 0,
  starter: null,
};

// ── Helpers ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  window.scrollTo(0, 0);
}

function randInt(min, max) { // inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function maxImpostorsManual(n) {
  return Math.max(1, Math.floor(n / 3)); // até 1/3, no mínimo 1
}

// ─────────────────── PALAVRAS DE ATUALIDADE (online) ───────────────────
function mergeTrending(extra) {
  if (!extra || !extra.length) return 0;
  const have = new Set(WORDS.map((w) => w.p.toLowerCase()));
  let added = 0;
  extra.forEach((w) => {
    if (w && w.p && w.d && !have.has(w.p.toLowerCase())) {
      WORDS.push(w);
      have.add(w.p.toLowerCase());
      added++;
    }
  });
  return added;
}

function setTrendStatus(text, busy) {
  const el = document.getElementById("trend-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("busy", !!busy);
}

let trendingCount = 0; // quantas palavras de atualidade estão no pool

async function refreshTrending(force) {
  if (!window.loadTrendingWords) { setTrendStatus(""); return; }
  setTrendStatus("🔥 A procurar palavras de atualidade…", true);
  try {
    const extra = await window.loadTrendingWords(force);
    // remove as antigas de atualidade antes de juntar as novas (evita acumular)
    if (force) {
      for (let i = WORDS.length - 1; i >= 0; i--) {
        if (WORDS[i].c && WORDS[i].c.indexOf("Atualidade") === 0) WORDS.splice(i, 1);
      }
    }
    mergeTrending(extra);
    trendingCount = WORDS.filter((w) => w.c && w.c.indexOf("Atualidade") === 0).length;
    setTrendStatus(
      trendingCount
        ? `🔥 ${trendingCount} palavras de atualidade · tocar para atualizar`
        : "🔥 Sem ligação — a usar o banco fixo"
    );
  } catch (e) {
    setTrendStatus("🔥 Sem ligação — a usar o banco fixo");
  }
}

// ─────────────────────────── ECRÃ: JOGADORES ───────────────────────────
function renderPlayers() {
  const list = $("#players-list");
  list.innerHTML = "";
  state.players.forEach((name, i) => {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <input type="text" placeholder="Jogador ${i + 1}" value="${escapeHtml(name)}"
             autocomplete="off" autocapitalize="words" data-i="${i}" />
      <button class="remove" data-i="${i}" aria-label="Remover">✕</button>`;
    list.appendChild(row);
  });

  list.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      state.players[+e.target.dataset.i] = e.target.value;
      validatePlayers();
    });
  });
  list.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      state.players.splice(+e.currentTarget.dataset.i, 1);
      renderPlayers();
      validatePlayers();
    });
  });
  validatePlayers();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function cleanNames() {
  return state.players.map((n) => n.trim()).filter(Boolean);
}

function validatePlayers() {
  $("#btn-players-next").disabled = cleanNames().length < 3;
}

// ─────────────────────────── ECRÃ: IMPOSTORES ──────────────────────────
function setupImpostorScreen() {
  const n = cleanNames().length;
  $("#total-players").textContent = n;
  $("#imp-max").textContent = maxImpostorsManual(n);
  $("#rand-max").textContent = n;
  state.impostorCount = Math.min(state.impostorCount, maxImpostorsManual(n));
  if (state.impostorCount < 1) state.impostorCount = 1;
  updateCounter();
}

function updateCounter() {
  $("#imp-count").textContent = state.impostorCount;
  const max = maxImpostorsManual(cleanNames().length);
  $("#imp-minus").disabled = state.impostorCount <= 1;
  $("#imp-plus").disabled = state.impostorCount >= max;
}

function setMode(mode) {
  state.impostorMode = mode;
  $$(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#manual-box").classList.toggle("hidden", mode !== "manual");
  $("#random-box").classList.toggle("hidden", mode !== "random");
}

// ─────────────────────────── DISTRIBUIR PAPÉIS ─────────────────────────
function assignRoles() {
  const names = cleanNames();
  state.players = names; // normaliza
  const n = names.length;

  let count;
  if (state.impostorMode === "random") {
    count = randInt(1, n); // pode calhar de 1 a todos
  } else {
    count = Math.min(state.impostorCount, maxImpostorsManual(n));
  }

  // escolher palavra
  state.word = WORDS[Math.floor(Math.random() * WORDS.length)];

  // escolher quais jogadores são impostores
  const idxs = shuffle(names.map((_, i) => i)).slice(0, count);
  const impostorSet = new Set(idxs);

  state.roles = names.map((name, i) => ({ name, isImpostor: impostorSet.has(i) }));
  state.revealIndex = 0;
}

// ─────────────────────────── ECRÃ: REVELAÇÃO ───────────────────────────
function renderRevealCard() {
  const role = state.roles[state.revealIndex];
  $("#reveal-index").textContent = state.revealIndex + 1;
  $("#reveal-total").textContent = state.roles.length;
  $("#card-name").textContent = role.name;

  // cor rotativa no card frontal de cada jogador
  const palette = ["#ffe14d", "#c9a3ff", "#f7a8d8", "#b8e6c8", "#9bc4ff", "#ffb86b"];
  const front = document.querySelector("#reveal-card .card-front");
  if (front) front.style.background = palette[state.revealIndex % palette.length];

  const back = $("#card-back");
  back.className = "card-face card-back " + (role.isImpostor ? "is-impostor" : "is-word");
  const hasHint = !!(state.word.d && state.word.d.trim());
  if (role.isImpostor) {
    back.innerHTML = hasHint
      ? `
        <div class="role-label">🤫 És o impostor</div>
        <div class="the-word">${escapeHtml(state.word.d)}</div>
        <div class="the-hint">A tua única pista. Disfarça.</div>`
      : `
        <div class="role-label">🤫 És o impostor</div>
        <div class="the-impostor">Sem pista</div>
        <div class="the-hint">Desenrasca-te! 😅</div>`;
  } else {
    back.innerHTML = `
      <div class="role-label">A tua palavra</div>
      <div class="the-word">${escapeHtml(state.word.p)}</div>`;
  }

  // botão final muda no último jogador
  const last = state.revealIndex === state.roles.length - 1;
  $("#btn-next-player").textContent = last ? "Começar jogo" : "Próximo jogador";

  // garantir card escondido
  $("#reveal-card").classList.remove("flipped");
}

function bindHoldToReveal() {
  const card = $("#reveal-card");
  const reveal = () => card.classList.add("flipped");
  const hide = () => card.classList.remove("flipped");

  // pointer events cobrem toque + rato
  card.addEventListener("pointerdown", (e) => { e.preventDefault(); reveal(); });
  card.addEventListener("pointerup", hide);
  card.addEventListener("pointerleave", hide);
  card.addEventListener("pointercancel", hide);
  card.addEventListener("contextmenu", (e) => e.preventDefault());
}

function nextPlayer() {
  if (state.revealIndex < state.roles.length - 1) {
    state.revealIndex++;
    renderRevealCard();
  } else {
    startPlay();
  }
}

// ─────────────────────────── ECRÃ: JOGO ────────────────────────────────
function startPlay() {
  state.starter = state.roles[Math.floor(Math.random() * state.roles.length)].name;
  $("#starter-name").textContent = state.starter;
  showScreen("screen-play");
}

// ─────────────────────────── ECRÃ: RESULTADO ───────────────────────────
function showResult() {
  $("#result-word").textContent = state.word.p;
  const box = $("#impostor-names");
  box.innerHTML = "";
  state.roles.filter((r) => r.isImpostor).forEach((r) => {
    const d = document.createElement("div");
    d.className = "imp";
    d.textContent = "🕵️ " + r.name;
    box.appendChild(d);
  });
  showScreen("screen-result");
}

// ─────────────────────────── NOVO JOGO ─────────────────────────────────
function newGame() {
  state.players = [];
  state.impostorCount = 1;
  showScreen("screen-home");
}

function replaySamePlayers() {
  assignRoles();
  renderRevealCard();
  showScreen("screen-reveal");
}

// ─────────────────────────── LIGAÇÕES (EVENTOS) ────────────────────────
function init() {
  // Início
  $("#btn-start").addEventListener("click", () => {
    if (state.players.length === 0) state.players = ["", "", ""];
    renderPlayers();
    showScreen("screen-players");
  });

  // Botões "voltar"
  $$("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => showScreen(b.dataset.goto)));

  // Jogadores
  $("#btn-add-player").addEventListener("click", () => {
    state.players.push("");
    renderPlayers();
    const inputs = $$("#players-list input");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  $("#btn-players-next").addEventListener("click", () => {
    state.players = cleanNames();
    setupImpostorScreen();
    showScreen("screen-impostors");
  });

  // Impostores
  $$(".mode-btn").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#imp-minus").addEventListener("click", () => {
    if (state.impostorCount > 1) { state.impostorCount--; updateCounter(); }
  });
  $("#imp-plus").addEventListener("click", () => {
    if (state.impostorCount < maxImpostorsManual(cleanNames().length)) {
      state.impostorCount++; updateCounter();
    }
  });
  $("#btn-impostors-next").addEventListener("click", () => {
    assignRoles();
    renderRevealCard();
    showScreen("screen-reveal");
  });

  // Revelação
  bindHoldToReveal();
  $("#btn-next-player").addEventListener("click", nextPlayer);

  // Jogo
  $("#btn-reveal-impostor").addEventListener("click", showResult);

  // Resultado
  $("#btn-new-game").addEventListener("click", newGame);
  $("#btn-same-players").addEventListener("click", replaySamePlayers);

  // Palavras de atualidade: carregar ao abrir; tocar no estado força atualização
  const trend = $("#trend-status");
  if (trend) trend.addEventListener("click", () => refreshTrending(true));
  refreshTrending(false);
}

document.addEventListener("DOMContentLoaded", init);
