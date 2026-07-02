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
  customMode: false,    // palavra escrita pelos jogadores
  writeIndex: 0,
  customWords: [],      // sugestão de cada jogador (modo personalizado)
};

// Escolhe a palavra do BANCO (sem atualidade),
// sem repetir dentro da mesma sessão de abertura.
function isTrend(w) { return !!(w.c && w.c.indexOf("Atualidade") === 0); }

function pickWord() {
  const used = state.usedWords;
  const bank = WORDS.filter((w) => !isTrend(w)); // apenas banco (sem atualidade)
  let avail = bank.filter((w) => !used.has(w.p));
  if (!avail.length) { used.clear(); avail = bank; } // esgotou → recomeça a sessão
  const w = avail[Math.floor(Math.random() * avail.length)];
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

// ── Música de suspense (ecrã "quem começa"), em loop ──
const roundAudio = new Audio("background%20round%20sound.mp3");
roundAudio.loop = true;
function playRoundMusic() {
  try { roundAudio.currentTime = 0; roundAudio.play().catch(() => {}); } catch (e) {}
}
function stopRoundMusic() {
  try { roundAudio.pause(); roundAudio.currentTime = 0; } catch (e) {}
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

// Nº de impostores no modo aleatório: favorece 1, decresce até "todos" (o mais raro,
// mas não residual). Peso linear = (n - k + 1) → ex. n=5: 33% / 27% / 20% / 13% / 7%.
function weightedImpostorCount(n) {
  // 1 impostor é de longe o mais provável; decresce até "todos" (raro, mas não residual).
  // Peso = 1/k → ex. n=5: 44% / 22% / 15% / 11% / 9%.
  const weights = [];
  let total = 0;
  for (let k = 1; k <= n; k++) { const w = 1 / k; weights.push(w); total += w; }
  let r = Math.random() * total;
  for (let k = 1; k <= n; k++) { r -= weights[k - 1]; if (r < 0) return k; }
  return n;
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

  const count = state.impostorMode === "random"
    ? weightedImpostorCount(n)                              // favorece poucos; "todos" é raro
    : Math.min(state.impostorCount, maxImpostorsManual(n));

  const idxs = shuffle(names.map((_, i) => i)).slice(0, count);
  const impostorSet = new Set(idxs);
  state.roles = names.map((name, i) => ({ name, isImpostor: impostorSet.has(i), hint: null }));

  if (count === names.length) {
    // TODOS impostores: NÃO há palavra oficial — pistas aleatórias e diferentes.
    state.word = null;
    const pistas = shuffle([...new Set(WORDS.map((w) => w.d).filter((d) => d && d.trim()))]);
    state.roles.forEach((r, i) => { r.hint = pistas[i % pistas.length]; });
  } else {
    state.word = pickWord(); // apenas do banco
  }
  state.revealIndex = 0;
}

// Modo personalizado: com as palavras já escritas por todos, sorteia a da ronda.
// Quem escreveu a palavra sorteada NÃO pode ser impostor; os restantes podem.
function finalizeCustomRound() {
  const names = state.players;
  const n = names.length;
  const author = Math.floor(Math.random() * n);           // quem "ganha" a palavra
  const word = state.customWords[author];

  let count = state.impostorMode === "random"
    ? weightedImpostorCount(n)
    : Math.min(state.impostorCount, maxImpostorsManual(n));
  if (count > n - 1) count = n - 1;                        // autor fica sempre de fora

  const others = shuffle(names.map((_, i) => i).filter((i) => i !== author)).slice(0, count);
  const impostorSet = new Set(others);
  state.roles = names.map((name, i) => ({ name, isImpostor: impostorSet.has(i), hint: null }));
  state.word = { p: word, d: "", c: "Personalizada" };
  state.revealIndex = 0;
  renderRevealCard();
  showScreen("screen-reveal");
}

// Inicia a distribuição: escrita (modo personalizado) ou revelação direta.
function startDistribution() {
  if (state.customMode) {
    state.players = cleanNames();
    state.customWords = [];
    state.writeIndex = 0;
    renderWriteCard();
    showScreen("screen-write");
  } else {
    assignRoles();
    renderRevealCard();
    showScreen("screen-reveal");
  }
}

// ───────────────────── ECRÃ: ESCRITA (modo personalizado) ──────────────
function renderWriteCard() {
  $("#write-index").textContent = state.writeIndex + 1;
  $("#write-total").textContent = state.players.length;
  $("#write-name").textContent = state.players[state.writeIndex];
  $("#write-input").value = "";
  $("#write-role").textContent = "A TUA SUGESTÃO";
  $("#write-instruction").textContent = "Escreve uma palavra que possa ser a da ronda. Se sair a tua, não és o impostor.";

  // Fecha o card sem animação (troca limpa entre jogadores).
  const card = $("#write-card");
  card.style.transition = "none";
  card.classList.remove("flipped");
  void card.offsetWidth;       // força reflow
  card.style.transition = "";

  const last = state.writeIndex === state.players.length - 1;
  $("#btn-write-next").textContent = last ? "Ver as cartas →" : "Próximo jogador →";
}

// Pressionar a frente abre a zona de escrita (fica aberta para escrever).
function openWriteCard() {
  const card = $("#write-card");
  if (card.classList.contains("flipped")) return;
  card.classList.add("flipped");
  setTimeout(() => $("#write-input").focus(), 300);
}

function bindWriteOpen() {
  const card = $("#write-card");
  $("#write-front").addEventListener("pointerdown", (e) => { e.preventDefault(); openWriteCard(); });
  card.addEventListener("contextmenu", (e) => e.preventDefault());
}

function writeNext() {
  const card = $("#write-card");
  if (!card.classList.contains("flipped")) { openWriteCard(); return; }
  const input = $("#write-input");
  const val = input.value.trim();
  if (!val) {                                   // toda a gente tem de escrever
    input.classList.add("shake");
    setTimeout(() => input.classList.remove("shake"), 420);
    input.focus();
    return;
  }
  state.customWords[state.writeIndex] = val;

  if (state.writeIndex < state.players.length - 1) {
    state.writeIndex++;
    renderWriteCard();
  } else {
    finalizeCustomRound();                      // sorteia a palavra e distribui papéis
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
  const hintWord = role.hint || (state.word ? state.word.d : ""); // role.hint = modo "todos impostores"
  const hasHint = !!(hintWord && hintWord.trim());
  if (role.isImpostor) {
    back.innerHTML = hasHint
      ? `
        <div class="role-label">A tua palavra</div>
        <div class="the-word">Impostor</div>
        <div class="the-hint">🤫 Pista: ${escapeHtml(hintWord)}</div>`
      : `
        <div class="role-label">A tua palavra</div>
        <div class="the-word">Impostor</div>
        <div class="the-hint">🤫 Sem pista — desenrasca-te! 😅</div>`;
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
  playRoundMusic(); // suspense em loop até revelar
}

// ─────────────────────────── ECRÃ: RESULTADO ───────────────────────────
function showResult() {
  stopRoundMusic();
  if (state.word) {
    $("#result-label").textContent = "A palavra era:";
    $("#result-word").textContent = state.word.p;
  } else {
    // sem palavra oficial → eram todos impostores
    $("#result-label").textContent = "Não havia palavra:";
    $("#result-word").textContent = "Eram todos impostores! 🤯";
  }
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
  stopRoundMusic();
  state.players = [];
  state.impostorCount = 1;
  showScreen("screen-home");
}

// Jogar novamente: mesmas pessoas e mesmo método, nova ronda.
function replaySamePlayers() {
  stopRoundMusic();
  startDistribution();
}

// Alterar método: mesmas pessoas, volta ao ecrã de impostores para mudar as opções.
function changeMethod() {
  stopRoundMusic();
  setupImpostorScreen();
  showScreen("screen-impostors");
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
  $("#btn-play-again").addEventListener("click", replaySamePlayers);
  $("#btn-change-method").addEventListener("click", changeMethod);
  $("#btn-new-game").addEventListener("click", newGame);
}

document.addEventListener("DOMContentLoaded", init);
