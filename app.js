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
  usedWords: new Set(), // palavras já saídas nesta sessão (não repetir)
  customMode: false,    // palavra escrita por um jogador
  masterIndex: -1,      // jogador que escreve (não-impostor, secreto)
  writeIndex: 0,
  customWord: "",
};

// Escolhe a palavra: 50/50 entre ATUALIDADE e BANCO (probabilidade igual),
// sem repetir dentro da mesma sessão de abertura.
function isTrend(w) { return !!(w.c && w.c.indexOf("Atualidade") === 0); }

function pickWord() {
  const used = state.usedWords;
  const bank = WORDS.filter((w) => !isTrend(w));
  const trend = WORDS.filter(isTrend);
  let bankAvail = bank.filter((w) => !used.has(w.p));
  let trendAvail = trend.filter((w) => !used.has(w.p));

  // se tudo já saiu, recomeça a sessão
  if (!bankAvail.length && !trendAvail.length) {
    used.clear();
    bankAvail = bank;
    trendAvail = trend;
  }

  let pool;
  if (bankAvail.length && trendAvail.length) {
    pool = Math.random() < 0.5 ? trendAvail : bankAvail; // moeda ao ar: igual
  } else {
    pool = bankAvail.length ? bankAvail : trendAvail;     // só uma fonte disponível
  }
  const w = pool[Math.floor(Math.random() * pool.length)];
  used.add(w.p);
  // se a palavra tiver várias rimas (amigos), sorteia uma de cada vez (não decoram)
  if (w.r && w.r.length) {
    return { p: w.p, c: w.c, d: w.r[Math.floor(Math.random() * w.r.length)] };
  }
  return w;
}

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

  // refletir o estado do modo personalizado no toggle e no botão
  const ct = document.getElementById("custom-toggle");
  if (ct) ct.classList.toggle("on", state.customMode);
  const btn = document.getElementById("btn-impostors-next");
  if (btn) btn.textContent = state.customMode ? "Escrever palavra →" : "Distribuir cartas →";
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
  // no modo personalizado tem de sobrar pelo menos um não-impostor (o Mestre)
  if (state.customMode && count >= n) count = n - 1;

  // escolher quais jogadores são impostores
  const idxs = shuffle(names.map((_, i) => i)).slice(0, count);
  const impostorSet = new Set(idxs);

  state.roles = names.map((name, i) => ({ name, isImpostor: impostorSet.has(i), hint: null }));

  if (state.customMode) {
    // Mestre: um não-impostor à sorte (escreve a palavra na 1ª passagem)
    const nonImp = state.roles.map((_, i) => i).filter((i) => !impostorSet.has(i));
    state.masterIndex = nonImp[Math.floor(Math.random() * nonImp.length)];
    state.word = null;       // será escrita
    state.customWord = "";
    state.writeIndex = 0;
  } else {
    state.masterIndex = -1;
    // escolher palavra (50/50 atualidade/banco, sem repetir na sessão)
    state.word = pickWord();
    // Caso especial: TODOS são impostores → cada um recebe pista aleatória e DIFERENTE
    if (count === names.length) {
      const pistas = shuffle([...new Set(WORDS.map((w) => w.d).filter((d) => d && d.trim()))]);
      state.roles.forEach((r, i) => { r.hint = pistas[i % pistas.length]; });
    }
  }

  state.revealIndex = 0;
}

// Inicia a distribuição: escrita (modo personalizado) ou revelação direta.
function startDistribution() {
  assignRoles();
  if (state.customMode) {
    renderWriteCard();
    showScreen("screen-write");
  } else {
    renderRevealCard();
    showScreen("screen-reveal");
  }
}

// ───────────────────── ECRÃ: ESCRITA (modo personalizado) ──────────────
function renderWriteCard() {
  const role = state.roles[state.writeIndex];
  $("#write-index").textContent = state.writeIndex + 1;
  $("#write-total").textContent = state.roles.length;
  $("#write-name").textContent = role.name;

  const isMaster = state.writeIndex === state.masterIndex;
  const back = $("#write-back");
  back.classList.toggle("master", isMaster);
  back.classList.toggle("decoy", !isMaster);
  $("#write-role").textContent = isMaster ? "🎯 És o Mestre" : "🙈 Disfarce";
  $("#write-instruction").textContent = isMaster
    ? "Escreve a palavra secreta da ronda. Mais ninguém saberá que foste tu."
    : "Escreve uma palavra qualquer só para disfarçar — esta não conta.";
  const input = $("#write-input");
  input.value = "";
  input.placeholder = isMaster ? "a palavra secreta…" : "qualquer coisa…";

  $("#write-card").classList.remove("flipped"); // fecha o card para o próximo jogador

  const last = state.writeIndex === state.roles.length - 1;
  $("#btn-write-next").textContent = last ? "Ver as cartas →" : "Próximo jogador →";
}

// Card de escrita: pressionar a frente abre o verso (e fica aberto para escrever)
function bindWriteOpen() {
  const card = $("#write-card");
  $("#write-front").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!card.classList.contains("flipped")) {
      card.classList.add("flipped");
      setTimeout(() => $("#write-input").focus(), 300);
    }
  });
  card.addEventListener("contextmenu", (e) => e.preventDefault());
}

function writeNext() {
  const card = $("#write-card");
  // se ainda não abriu o card, abre-o primeiro (em vez de avançar)
  if (!card.classList.contains("flipped")) {
    card.classList.add("flipped");
    setTimeout(() => $("#write-input").focus(), 300);
    return;
  }
  const input = $("#write-input");
  const val = input.value.trim();
  // toda a gente escreve algo (disfarça quem é o Mestre)
  if (!val) {
    input.classList.add("shake");
    setTimeout(() => input.classList.remove("shake"), 420);
    input.focus();
    return;
  }
  if (state.writeIndex === state.masterIndex) state.customWord = val;

  if (state.writeIndex < state.roles.length - 1) {
    state.writeIndex++;
    renderWriteCard();
  } else {
    // escrita terminada → palavra da ronda (sem pista) e passar à revelação
    state.word = { p: state.customWord, d: "", c: "Personalizada" };
    state.revealIndex = 0;
    renderRevealCard();
    showScreen("screen-reveal");
  }
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
  const hintWord = role.hint || state.word.d; // role.hint só existe no modo "todos impostores"
  const hasHint = !!(hintWord && hintWord.trim());
  if (role.isImpostor) {
    back.innerHTML = hasHint
      ? `
        <div class="role-label">🤫 És o impostor</div>
        <div class="the-word">${escapeHtml(hintWord)}</div>
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
  startDistribution();
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
  $("#btn-impostors-next").addEventListener("click", startDistribution);

  // Toggle do modo "palavra escrita por um jogador"
  const customToggle = $("#custom-toggle");
  if (customToggle) {
    customToggle.addEventListener("click", () => {
      state.customMode = !state.customMode;
      customToggle.classList.toggle("on", state.customMode);
      $("#btn-impostors-next").textContent = state.customMode ? "Escrever palavra →" : "Distribuir cartas →";
    });
  }

  // Escrita (modo personalizado)
  bindWriteOpen();
  $("#btn-write-next").addEventListener("click", writeNext);
  $("#write-input").addEventListener("keydown", (e) => { if (e.key === "Enter") writeNext(); });

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
