// ─────────────────────────── Jogo do Impostor ───────────────────────────
// Joguinhos do Marco, n.º 1. Três modos: passar o telemóvel (a app escolhe a palavra), palavra vossa
// (cada um escreve uma, sai uma à sorte) e online (mp.js). A língua, o som e o Studio Mode vêm do jm.js.
"use strict";

const L = JM.L;

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
  customWords: [],      // sugestão de cada jogador (modo palavra vossa)
};

// ── Os nomes ficam guardados neste telemóvel (a malta costuma ser a mesma) ──
const PLAYERS_KEY = "impostor.players";
function loadPlayers() { try { const p = JSON.parse(localStorage.getItem(PLAYERS_KEY)); return Array.isArray(p) ? p.filter((n) => typeof n === "string").slice(0, 30) : []; } catch (e) { return []; } }
function savePlayers() { try { localStorage.setItem(PLAYERS_KEY, JSON.stringify(cleanNames())); } catch (e) {} }

// ── Studio Mode (Joguinhos do Marco) ──
// Desligado não deixa rasto: as palavras do pessoal (nomes e rimas) e os gifs vivem em words-studio.js,
// que só é descarregado com o Studio Mode ligado. Ligado, há uma secção no início para os tirar do jogo.
const CREW_KEY = "impostor.crew";
state.studio = JM.studioOn();
function crewOn() { return state.studio && !!window.WORDS_STUDIO && localStorage.getItem(CREW_KEY) !== "0"; }
let studioWait = null;
function withStudio(cb) {
  if (!JM.studioOn() || window.WORDS_STUDIO) { cb(); return; }
  if (studioWait) { studioWait.push(cb); return; }
  studioWait = [cb];
  const s = document.createElement("script");
  s.src = "words-studio.js";
  s.onload = () => { const w = studioWait; studioWait = null; w.forEach((f) => f()); };
  s.onerror = () => { studioWait = null; };
  document.head.appendChild(s);
}

// ── O banco em inglês (words-en.js) só se descarrega com o jogo em inglês ──
let enWait = null;
function withEN(cb) {
  if (JM.lang() !== "en" || window.WORDS_EN) { cb(); return; }
  if (enWait) { enWait.push(cb); return; }
  enWait = [cb];
  const s = document.createElement("script");
  s.src = "words-en.js";
  s.onload = () => { window.WORDS_EN = window.WORDS_EN || (typeof WORDS_EN !== "undefined" ? WORDS_EN : null); const w = enWait; enWait = null; w.forEach((f) => f()); };
  s.onerror = () => { const w = enWait; enWait = null; w.forEach((f) => f()); };
  document.head.appendChild(s);
}
// Uma palavra (e a pista) na língua do telemóvel. A pista pode vir de fora (rimas, modo "todos impostores").
function loc(p, d) {
  const en = JM.lang() === "en" && window.WORDS_EN ? window.WORDS_EN[p] : null;
  if (!en) return { p, d };
  return { p: en[0], d: d && d === findHint(p) ? en[1] : d };
}
function findHint(p) { const w = WORDS.find((x) => x.p === p); return w ? w.d : ""; }
function locHint(d) {          // uma pista solta (modo "todos impostores"): procura a palavra a que pertence
  if (JM.lang() !== "en" || !window.WORDS_EN || !d) return d;
  const w = WORDS.find((x) => x.d === d);
  return w && window.WORDS_EN[w.p] ? window.WORDS_EN[w.p][1] : d;
}

// Escolhe a palavra do BANCO (sem atualidade), sem repetir dentro da mesma sessão de abertura.
function isTrend(w) { return !!(w.c && w.c.indexOf("Atualidade") === 0); }

// As palavras em jogo: o banco, sem atualidade e, com o Studio Mode, também as do pessoal.
// Qualquer modo de jogo (local ou online) deve tirar as palavras e as pistas daqui.
function wordBank() {
  const base = WORDS.filter((w) => !isTrend(w));
  return crewOn() ? base.concat(window.WORDS_STUDIO) : base;
}

function pickWord() {
  const used = state.usedWords;
  const bank = wordBank();
  let avail = bank.filter((w) => !used.has(w.p));
  if (!avail.length) { used.clear(); avail = bank; } // esgotou → recomeça a sessão
  const w = avail[Math.floor(Math.random() * avail.length)];
  used.add(w.p);
  // se a palavra tiver várias rimas (as do pessoal), sorteia uma de cada vez (não decoram)
  if (w.r && w.r.length) {
    return { p: w.p, c: w.c, d: w.r[Math.floor(Math.random() * w.r.length)] };
  }
  return w;
}

// ── Helpers ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const BACKWARD = { "screen-home": 1 };
function showScreen(id, back) { JM.screen(id, back || !!BACKWARD[id]); }
function escapeHtml(s) { return JM.esc(s); }

// ── Música de suspense (ecrã "quem começa"), em loop ──
// É o único som dos Joguinhos do Marco: liga e desliga em Definições > Música.
JM.hasMusic = true;
window.addEventListener("jm:sound", (e) => { if (!e.detail) stopRoundMusic(); });
// Só se descarrega quando é precisa (são quase 3 MB; abrir o jogo com dados móveis não a puxa).
let roundAudio = null;
function playRoundMusic() {
  try {
    if (JM.muted()) return;
    if (!roundAudio) { roundAudio = new Audio("background%20round%20sound.mp3"); roundAudio.loop = true; }
    roundAudio.currentTime = 0;
    roundAudio.play().catch(() => {});
  } catch (e) {}
}
function stopRoundMusic() {
  try { if (roundAudio) { roundAudio.pause(); roundAudio.currentTime = 0; } } catch (e) {}
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

// Nº de impostores no modo aleatório: 1 é de longe o mais provável; decresce até "todos" (raro, mas não residual).
// Peso = 1/k → ex. n=5: 44% / 22% / 15% / 11% / 9%.
function weightedImpostorCount(n) {
  const weights = [];
  let total = 0;
  for (let k = 1; k <= n; k++) { const w = 1 / k; weights.push(w); total += w; }
  let r = Math.random() * total;
  for (let k = 1; k <= n; k++) { r -= weights[k - 1]; if (r < 0) return k; }
  return n;
}
function impWord(n) { return n === 1 ? L("impostor", "impostor") : L("impostores", "impostors"); }

// ─────────────────────────── ECRÃ: JOGADORES ───────────────────────────
function renderPlayers() {
  const list = $("#players-list");
  list.innerHTML = state.players.map((name, i) => `
    <div class="row player-row">
      <div class="row-b">
        <span class="num">${i + 1}</span>
        <input class="field plain" type="text" placeholder="${escapeHtml(L("Jogador ", "Player ") + (i + 1))}" value="${escapeHtml(name)}"
               autocomplete="off" autocapitalize="words" maxlength="24" enterkeyhint="next" data-i="${i}" aria-label="${escapeHtml(L("Jogador ", "Player ") + (i + 1))}" />
        <button type="button" class="remove" data-i="${i}" aria-label="${escapeHtml(L("Remover", "Remove"))}">${JM.icon("minus")}</button>
      </div>
    </div>`).join("");
  list.hidden = !state.players.length;
  list.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", (e) => { state.players[+e.target.dataset.i] = e.target.value; validatePlayers(); });
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const next = list.querySelector(`input[data-i="${+e.target.dataset.i + 1}"]`);
      if (next) next.focus(); else addPlayer();
    });
  });
  list.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      state.players.splice(+e.currentTarget.dataset.i, 1);
      JM.play("tap");
      renderPlayers();
    });
  });
  validatePlayers();
}
function addPlayer() {
  state.players.push("");
  renderPlayers();
  const inputs = $$("#players-list input");
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function cleanNames() {
  return state.players.map((n) => n.trim()).filter(Boolean);
}

// Nomes repetidos baralham a revelação e o resultado: só se avança com nomes todos diferentes.
function validatePlayers() {
  const names = cleanNames(), low = names.map((n) => n.toLowerCase());
  const dup = low.some((n, i) => low.indexOf(n) !== i);
  $("#btn-players-next").disabled = names.length < 3 || dup;
  $("#players-note").textContent = dup ? L("Há nomes repetidos: muda um deles.", "There are repeated names: change one.")
    : names.length < 3 ? L("Mínimo 3 jogadores. Os nomes ficam guardados neste telemóvel.", "At least 3 players. The names are kept on this phone.")
    : L(names.length + " jogadores. Os nomes ficam guardados neste telemóvel.", names.length + " players. The names are kept on this phone.");
  $("#players-note").classList.toggle("warn-f", dup);
}

// ─────────────────────────── ECRÃ: IMPOSTORES ──────────────────────────
function setupImpostorScreen() {
  const n = cleanNames().length;
  state.impostorCount = Math.min(state.impostorCount, maxImpostorsManual(n));
  if (state.impostorCount < 1) state.impostorCount = 1;
  setMode(state.impostorMode);
  $("#btn-impostors-next").textContent = state.customMode ? L("Escrever as palavras", "Write the words") : L("Distribuir as cartas", "Deal the cards");
}

function updateCounter() {
  const n = cleanNames().length, max = maxImpostorsManual(n);
  $("#imp-count").textContent = state.impostorCount;
  $("#imp-word").textContent = impWord(state.impostorCount);
  $("#imp-max-note").textContent = L("Máximo " + max + " com " + n + " jogadores", "Up to " + max + " with " + n + " players");
  $("#imp-minus").disabled = state.impostorCount <= 1;
  $("#imp-plus").disabled = state.impostorCount >= max;
}

function setMode(mode) {
  state.impostorMode = mode;
  const n = cleanNames().length;
  $$("#screen-impostors .mode-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  $("#manual-box").hidden = mode !== "manual";
  updateCounter();
  let note = mode === "random"
    ? L("O número de impostores é sorteado, de 1 a " + n + ". Um é o mais provável; serem todos é o mais raro.", "The number of impostors is drawn, from 1 to " + n + ". One is the most likely; everyone is the rarest.")
    : L("Até um terço dos jogadores pode ser impostor.", "Up to a third of the players can be impostors.");
  if (state.customMode) note += " " + L("Quem escreveu a palavra que sair nunca é impostor, e o impostor joga sem pista.", "Whoever wrote the word that comes out is never the impostor, and the impostor plays without a clue.");
  $("#imp-note").textContent = note;
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
    const pistas = shuffle([...new Set(wordBank().map((w) => w.d).filter((d) => d && d.trim()))]);
    state.roles.forEach((r, i) => { r.hint = pistas[i % pistas.length]; });
  } else {
    state.word = pickWord(); // apenas do banco
  }
  state.revealIndex = 0;
}

// Palavra vossa: com as palavras já escritas por todos, sorteia a da ronda.
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
  state.word = { p: word, d: "", c: "Personalizada", custom: true };
  state.revealIndex = 0;
  renderRevealCard();
  showScreen("screen-reveal");
}

// Inicia a distribuição: escrita (palavra vossa) ou revelação direta.
function startDistribution() {
  savePlayers();
  JM.play("drum");
  if (state.customMode) {
    state.players = cleanNames();
    state.customWords = [];
    state.writeIndex = 0;
    renderWriteCard();
    showScreen("screen-write");
  } else {
    withStudio(() => withEN(() => {
      assignRoles();
      renderRevealCard();
      showScreen("screen-reveal");
    }));
  }
}

// ───────────────────── ECRÃ: ESCRITA (palavra vossa) ──────────────
function renderWriteCard() {
  $("#write-index").textContent = state.writeIndex + 1;
  $("#write-total").textContent = state.players.length;
  $("#write-name").textContent = state.players[state.writeIndex];
  $("#write-input").value = "";

  // Fecha a carta sem animação (troca limpa entre jogadores).
  const card = $("#write-card");
  card.style.transition = "none";
  card.classList.remove("flipped");
  void card.offsetWidth;       // força reflow
  card.style.transition = "";

  const last = state.writeIndex === state.players.length - 1;
  $("#btn-write-next").textContent = last ? L("Ver as cartas", "See the cards") : L("Próximo jogador", "Next player");
}

// Tocar na frente abre a zona de escrita (fica aberta para escrever).
function openWriteCard() {
  const card = $("#write-card");
  if (card.classList.contains("flipped")) return;
  card.classList.add("flipped");
  JM.play("flip");
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
  if (JM.lang() === "en") JM.translate(val, "en");   // já vai traduzindo, para estar pronta na revelação
  JM.play("tap");

  if (state.writeIndex < state.players.length - 1) {
    state.writeIndex++;
    renderWriteCard();
  } else {
    finalizeCustomRound();                      // sorteia a palavra e distribui papéis
  }
}

// ─────────────────────────── ECRÃ: REVELAÇÃO ───────────────────────────
// A palavra da ronda na língua do telemóvel. Uma palavra escrita por um jogador é traduzida automaticamente.
function shownWord(later) {
  if (!state.word) return { p: "", d: "", orig: "" };
  if (state.word.custom) {
    // Num telemóvel só, quem escreve vê o jogo na mesma língua: só se traduz com o telemóvel em inglês
    // e quando a palavra foi mesmo escrita em português (deteção automática).
    if (JM.lang() !== "en") return { p: state.word.p, d: "", orig: "" };
    const t = JM.tx(state.word.p, "en", later);
    return { p: t.text, d: "", orig: t.changed ? state.word.p : "" };
  }
  const w = loc(state.word.p, state.word.d);
  return { p: w.p, d: w.d, orig: "" };
}

function renderRevealCard() {
  const role = state.roles[state.revealIndex];
  $("#reveal-index").textContent = state.revealIndex + 1;
  $("#reveal-total").textContent = state.roles.length;
  $("#card-name").textContent = role.name;

  // cor rotativa na frente da carta de cada jogador
  const palette = ["var(--c-cartas)", "var(--c-blue)", "var(--c-quem)", "var(--c-conexoes)", "var(--c-orange)"];
  $("#reveal-card .card-front").style.setProperty("--front", palette[state.revealIndex % palette.length]);

  const back = $("#card-back");
  back.className = "card-face card-back " + (role.isImpostor ? "is-impostor" : "is-word");
  const w = shownWord(() => { if ($("#screen-reveal").classList.contains("on")) paintBack(); });
  function paintBack() {
    const ww = shownWord(null);
    const hintWord = role.hint ? locHint(role.hint) : ww.d; // role.hint = modo "todos impostores"
    const hasHint = !!(hintWord && hintWord.trim());
    if (role.isImpostor) {
      back.innerHTML = `
        <div class="role-label">${L("A tua palavra", "Your word")}</div>
        <div class="the-word">${L("Impostor", "Impostor")}</div>
        <div class="the-hint">${hasHint ? L("Pista: ", "Clue: ") + escapeHtml(hintWord) : L("Sem pista. Desenrasca-te.", "No clue. Wing it.")}</div>`;
    } else {
      back.innerHTML = `
        <div class="role-label">${L("A tua palavra", "Your word")}</div>
        <div class="the-word">${escapeHtml(ww.p)}</div>` +
        (ww.orig ? `<div class="the-orig">${JM.icon("translate")} ${escapeHtml(ww.orig)}</div>` : "");
    }
  }
  paintBack();

  const last = state.revealIndex === state.roles.length - 1;
  $("#btn-next-player").textContent = last ? L("Começar o jogo", "Start the game") : L("Próximo jogador", "Next player");
  $("#reveal-card").classList.remove("flipped");
}

function bindHoldToReveal() {
  const card = $("#reveal-card");
  const reveal = () => { if (!card.classList.contains("flipped")) JM.play("flip"); card.classList.add("flipped"); };
  const hide = () => card.classList.remove("flipped");

  // pointer events cobrem toque + rato
  card.addEventListener("pointerdown", (e) => { e.preventDefault(); reveal(); });
  card.addEventListener("pointerup", hide);
  card.addEventListener("pointerleave", hide);
  card.addEventListener("pointercancel", hide);
  card.addEventListener("contextmenu", (e) => e.preventDefault());
  // teclado: carregar em espaço ou Enter mostra, largar esconde (igual ao dedo)
  card.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); reveal(); } });
  card.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") hide(); });
}

function nextPlayer() {
  JM.play("tap");
  if (state.revealIndex < state.roles.length - 1) {
    state.revealIndex++;
    renderRevealCard();
  } else {
    startPlay();
  }
}

// ─────────────────────────── ECRÃ: JOGO ────────────────────────────────
// O gif de quem começa (só no Studio Mode): gifs/<nome>.gif, procurado por cada palavra do nome.
function showStarterGif(name) {
  const holder = $("#starter-gif");
  holder.innerHTML = "";
  holder.style.display = "none";
  if (!name || !crewOn() || !window.STUDIO_GIFS) return;
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const candidates = norm(name).split(/\s+/).filter((k) => window.STUDIO_GIFS[k]);
  if (!candidates.length) return;
  const img = new Image();
  img.className = "starter-gif-img";
  img.alt = "";
  img.onload = () => { holder.innerHTML = ""; holder.appendChild(img); holder.style.display = "block"; };
  img.src = "gifs/" + encodeURIComponent(candidates[0]) + ".gif";
}

function startPlay() {
  JM.play("drum");
  state.starter = state.roles[Math.floor(Math.random() * state.roles.length)].name;
  $("#starter-name").textContent = state.starter;
  showStarterGif(state.starter);
  showScreen("screen-play");
  playRoundMusic(); // suspense em loop até revelar
}

// ─────────────────────────── ECRÃ: RESULTADO ───────────────────────────
function showResult() {
  JM.play("win");
  stopRoundMusic();
  const paint = () => {
    const imps = state.roles.filter((r) => r.isImpostor);
    if (state.word) {
      const w = shownWord(paint);
      $("#result-label").textContent = L("A palavra era", "The word was");
      $("#result-word").textContent = w.p;
      $("#result-tr").hidden = !w.orig;
      $("#result-tr").textContent = w.orig ? L("Escrita como «", "Written as “") + w.orig + L("»", "”") : "";
    } else {
      // sem palavra oficial → eram todos impostores
      $("#result-label").textContent = L("Não havia palavra", "There was no word");
      $("#result-word").textContent = L("Eram todos impostores!", "Everyone was an impostor!");
      $("#result-tr").hidden = true;
    }
    $("#result-imps-label").textContent = imps.length === 1 ? L("O impostor", "The impostor") : L("Os impostores", "The impostors");
    $("#impostor-names").innerHTML = imps.map((r) => '<div class="imp">' + JM.icon("mask") + escapeHtml(r.name) + "</div>").join("");
  };
  paint();
  showScreen("screen-result");
}

// ─────────────────────────── NOVO JOGO ─────────────────────────────────
function newGame() {
  stopRoundMusic();
  state.impostorCount = 1;
  goHome();
}
function goHome() { stopRoundMusic(); paintHome(); showScreen("screen-home", true); }

// Outra ronda: mesmas pessoas e mesmo modo.
function replaySamePlayers() {
  stopRoundMusic();
  startDistribution();
}

// Mudar regras: mesmas pessoas, volta ao ecrã dos impostores.
function changeMethod() {
  stopRoundMusic();
  setupImpostorScreen();
  showScreen("screen-impostors", true);
}

// Sair a meio de uma ronda pede confirmação.
function quitRound() {
  JM.alert({
    title: L("Sair da ronda?", "Leave the round?"),
    text: L("As cartas desta ronda perdem-se. Os nomes ficam guardados.", "This round's cards are lost. The names are kept."),
    actions: [{ t: L("Continuar", "Keep playing") }, { t: L("Sair", "Leave"), cls: "danger", fn: goHome }]
  });
}

// ─────────────────────────── INÍCIO ────────────────────────────────────
function rules() {
  JM.sheet('<p class="sheet-p">' + L(
    "Todos recebem uma carta com a palavra secreta, menos o impostor, que só recebe uma pista. À vez, cada um diz uma palavra ligada à secreta, sem a dizer. " +
    "O impostor tem de fingir que sabe. No fim, votem em quem acham que é o impostor e revelem.",
    "Everyone gets a card with the secret word, except the impostor, who only gets a clue. In turns, each player says a word linked to the secret one, without saying it. " +
    "The impostor has to pretend they know it. At the end, vote for who you think it is and reveal.") + "</p>" +
    '<div class="list"><div class="group">' +
    '<div class="row"><span class="tile-ic">' + JM.icon("phone") + '</span><div class="row-b"><span class="row-x"><span class="row-t">' + L("Passa o telemóvel", "Pass the phone") + '</span><span class="row-s">' + L("Carrega e mantém a carta para a veres; larga para esconder e passa ao seguinte.", "Press and hold the card to see it; let go to hide it and pass it on.") + "</span></span></div></div>" +
    '<div class="row"><span class="tile-ic">' + JM.icon("pencil") + '</span><div class="row-b"><span class="row-x"><span class="row-t">' + L("Palavra vossa", "Your own word") + '</span><span class="row-s">' + L("Cada um escreve uma palavra; sai uma à sorte e quem a escreveu nunca é impostor.", "Everyone writes a word; one is drawn and whoever wrote it is never the impostor.") + "</span></span></div></div>" +
    '<div class="row"><span class="tile-ic">' + JM.icon("online") + '</span><div class="row-b"><span class="row-x"><span class="row-t">Online</span><span class="row-s">' + L("Cada um vê a carta no seu telemóvel e dá uma pista escrita ou em foto. Duas rondas e votação.", "Everyone sees their card on their own phone and gives a written or photo clue. Two rounds, then a vote.") + "</span></span></div></div>" +
    "</div></div>" +
    '<div class="sheet-btns"><button type="button" class="btn fill lg block" data-jm="close">' + L("Percebido", "Got it") + "</button></div>",
    { title: L("Como se joga", "How to play") });
}

// A secção do Studio Mode no início: só existe com ele ligado.
function paintHome() {
  state.studio = JM.studioOn();
  const box = $("#studio-list");
  if (!state.studio) { box.hidden = true; box.innerHTML = ""; return; }
  withStudio(() => {
    if (!JM.studioOn() || !window.WORDS_STUDIO) return;
    const on = localStorage.getItem(CREW_KEY) !== "0";
    box.innerHTML = '<h2 class="list-h">' + L('Só no Studio Mode', 'Studio Mode only') + '</h2><div class="group">' +
      '<div class="row"><span class="tile-ic studio">' + JM.icon("flame") + '</span><div class="row-b"><span class="row-x"><span class="row-t">' + L("Palavras do pessoal", "The crew's words") + "</span>" +
      '<span class="row-s">' + L("Os nomes do estúdio entram no baralho, com pistas que rimam.", "The studio names join the deck, with rhyming clues.") + "</span></span>" +
      '<button type="button" class="switch" role="switch" id="crew-sw" aria-checked="' + on + '" aria-label="' + L("Palavras do pessoal", "The crew's words") + '"></button></div></div>' +
      '<button type="button" class="row" id="gif-names"><span class="tile-ic studio">' + JM.icon("photo") + '</span><div class="row-b"><span class="row-x row-t">' + L("Nomes com gif", "Names with a gif") + "</span>" + JM.icon("chevron-right", "chev") + "</div></button>" +
      "</div>";
    box.hidden = false;
    $("#crew-sw").onclick = () => { localStorage.setItem(CREW_KEY, on ? "0" : "1"); JM.play("toggle"); paintHome(); };
    $("#gif-names").onclick = openGifNames;
  });
}
function openGifNames() {
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const names = (window.WORDS_STUDIO || []).map((w) => w.p).filter((n) => norm(n).split(/\s+/).some((k) => window.STUDIO_GIFS[k]));
  JM.sheet('<p class="sheet-p">' + L("Escreve o nome assim (basta o primeiro ou o último) para o gif aparecer quando fores tu a começar.", "Write the name like this (first or last is enough) for the gif to show up when you start.") + "</p>" +
    '<div class="list"><div class="group">' + names.map((n) => '<div class="row"><div class="row-b"><span class="row-x row-t">' + escapeHtml(n) + "</span></div></div>").join("") + "</div></div>",
    { title: L("Nomes com gif", "Names with a gif") });
}

function openPlayers(custom) {
  state.customMode = custom;
  if (!state.players.length) state.players = loadPlayers();
  while (state.players.length < 3) state.players.push("");
  JM.play("tap");
  renderPlayers();
  showScreen("screen-players");
}

// ─────────────────────────── LIGAÇÕES (EVENTOS) ────────────────────────
function init() {
  $("#btn-start").addEventListener("click", () => openPlayers(false));
  $("#btn-custom").addEventListener("click", () => openPlayers(true));
  $("#btn-rules").addEventListener("click", rules);

  // Botões "voltar" e "sair"
  $$("[data-back]").forEach((b) => b.addEventListener("click", () => { JM.play("tap"); if (b.dataset.back === "screen-home") goHome(); else showScreen(b.dataset.back, true); }));
  $$("[data-quit]").forEach((b) => b.addEventListener("click", quitRound));

  // Jogadores
  $("#btn-add-player").addEventListener("click", addPlayer);
  $("#btn-players-next").addEventListener("click", () => {
    state.players = cleanNames();
    savePlayers();
    setupImpostorScreen();
    showScreen("screen-impostors");
  });

  // Impostores
  $$("#screen-impostors .mode-btn").forEach((b) => b.addEventListener("click", () => { JM.play("select"); setMode(b.dataset.mode); }));
  $("#imp-minus").addEventListener("click", () => {
    if (state.impostorCount > 1) { state.impostorCount--; JM.play("tap"); updateCounter(); }
  });
  $("#imp-plus").addEventListener("click", () => {
    if (state.impostorCount < maxImpostorsManual(cleanNames().length)) { state.impostorCount++; JM.play("tap"); updateCounter(); }
  });
  $("#btn-impostors-next").addEventListener("click", startDistribution);

  // Escrita (palavra vossa)
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

  // A língua e o Studio Mode podem mudar a qualquer momento (Definições)
  window.addEventListener("jm:lang", () => withEN(() => {
    const on = document.querySelector(".screen.on");
    if (!on) return;
    if (on.id === "screen-players") renderPlayers();
    if (on.id === "screen-impostors") setupImpostorScreen();
    if (on.id === "screen-write") renderWriteCard();
    if (on.id === "screen-reveal") renderRevealCard();
    if (on.id === "screen-result") showResult();
  }));
  window.addEventListener("jm:studio", () => {
    paintHome();
    if (!JM.studioOn()) $("#starter-gif").innerHTML = "";
  });
  JM.settingsExtra = () => [{ t: ["Como se joga", "How to play"], ic: "question", fn: rules }];

  state.players = loadPlayers();
  paintHome();
  withEN(() => {});
}

document.addEventListener("DOMContentLoaded", init);
