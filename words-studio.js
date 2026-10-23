// words-studio.js — o Jogo do Impostor em Studio Mode: os nomes do pessoal do estúdio e os gifs de quem começa.
// Só é descarregado com o Studio Mode ligado (app.js junta estas palavras ao banco).
// Os nomes vão completos, como o grupo se conhece; o site abre a quem tiver o link, por isso nada de piadas aqui.
var WORDS_STUDIO = [
  // Amigos: a pista é sorteada de cada vez (campo "r") para não decorarem. Rima com a parte indicada.
  { p: "Diogo Rebelo", c: "Amigos", d: "Martelo", r: ["Martelo","Camelo","Castelo","Novelo","Cabelo","Caramelo","Pesadelo","Chinelo","Cotovelo","Modelo","Duelo","Selo","Farelo"] },     // rima com Rebelo
  { p: "David Santos", c: "Amigos", d: "Encantos", r: ["Encantos","Cantos","Mantos","Recantos","Espantos","Tantos","Quebrantos","Adiantos","Acalantos"] },                              // rima com Santos
  { p: "Marco da Silva", c: "Amigos", d: "Barco", r: ["Barco","Charco","Parco","Embarco","Demarco"] },                                                                                  // rima com Marco
  { p: "Nuno Pinto", c: "Amigos", d: "Aluno", r: ["Aluno","Bruno","Jejuno","Oportuno","Inoportuno","Importuno","Tribuno"] },                                                            // rima com Nuno
  { p: "Vitor Fernandes", c: "Amigos", d: "Motor", r: ["Motor","Leitor","Doutor","Pintor","Reitor","Editor","Monitor","Tutor","Setor","Vetor","Reator","Inventor","Ator"] },           // rima com Vitor
  { p: "Alex Lemos", c: "Amigos", d: "Rolex", r: ["Rolex","Telex","Codex","Index","Látex","Vortex","Duplex","Apex","Reflex"] },                                                         // rima com Alex
  { p: "Ricardo Freire", c: "Amigos", d: "Freira", r: ["Freira","Cadeira","Bandeira","Madeira","Fogueira","Poeira","Caldeira","Carteira","Maneira","Carreira","Ladeira","Fronteira"] }, // rima com Freire
  { p: "Diogo Cunha", c: "Amigos", d: "Testemunha", r: ["Testemunha","Punha","Repunha","Compunha","Propunha","Supunha","Dispunha","Opunha"] },                                          // rima com Cunha
  { p: "David Ribeiro", c: "Amigos", d: "Dinheiro", r: ["Dinheiro","Janeiro","Cruzeiro","Ligeiro","Brasileiro","Marinheiro","Cavaleiro","Nevoeiro","Pasteleiro","Bombeiro","Carpinteiro","Prisioneiro","Verdadeiro","Primeiro"] }, // rima com Ribeiro
  { p: "João Pinto", c: "Amigos", d: "Cinto", r: ["Cinto","Tinto","Quinto","Distinto","Instinto","Recinto","Sucinto","Minto","Indistinto"] },                                          // rima com Pinto
];
// Os nomes que têm gif (gifs/<nome>.gif) para quando calham a começar.
var STUDIO_GIFS = { alex: 1, freire: 1, marco: 1, nuno: 1, pinto: 1, rebelo: 1, santos: 1, vitor: 1 };
if (typeof window !== "undefined") { window.WORDS_STUDIO = WORDS_STUDIO; window.STUDIO_GIFS = STUDIO_GIFS; }
if (typeof module !== "undefined" && module.exports) module.exports = { WORDS_STUDIO: WORDS_STUDIO, STUDIO_GIFS: STUDIO_GIFS };
