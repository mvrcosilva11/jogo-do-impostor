# 🕵️ Jogo do Impostor

Jogo de festa para um só telemóvel, passado de mão em mão. Todos recebem uma palavra secreta — exceto o(s) impostor(es), que só recebem uma dica subtil. Conversem, desconfiem e descubram quem está a fingir.

## Como jogar

1. **Iniciar jogo** e inserir os nomes dos jogadores (mínimo 3, sem limite).
2. Escolher o número de impostores:
   - **Escolher** — até 1/3 dos jogadores (mínimo 1).
   - **Aleatório** — sorteado entre 1 e todos os jogadores.
3. Cada jogador, à vez, **pressiona e mantém o dedo** no card. Quem não é impostor vê a **palavra**; o impostor vê apenas uma **pista** (uma palavra relacionada, subtil). Ao largar, esconde. Passa o telemóvel ao próximo.
4. A app diz **quem começa**. Cada um diz uma palavra relacionada; debatam e votem.
5. **Revelar impostor(es)** no fim. Jogar de novo.

## Palavras de atualidade 🔥

Além do banco fixo, a app gera **palavras novas a partir do que está em tendência agora** — os artigos mais vistos da Wikipédia PT do dia (via API de pageviews da Wikimedia), com a pista derivada da descrição curta da Wikidata. Tudo no browser, sem servidor. Carrega ao abrir (cache diário em `localStorage`) e podes **tocar no estado no ecrã inicial para forçar atualização**. Sem ligação, usa só o banco fixo. Lógica em [`trending.js`](trending.js).

## Categorias de palavras

Animais, Profissões, Plantas, Comida, Lugares, Objetos, Celebridades, Personalidades Portuguesas, Música, Filmes & Séries, Youtubers PT, Brainrot, Portugal, Futebol, Drogas, Weed, Slang PT, Amigos — e **Atualidade 🔥** (dinâmica).

Para acrescentar palavras, edita [`words.js`](words.js) — cada linha é `{ p: "palavra", d: "pista", c: "categoria" }`. A `pista` é uma única palavra relacionada (vista só pelo impostor); deixa `d: ""` para palavras sem pista.

## Stack

HTML, CSS e JavaScript puro. Sem build, sem dependências. Alojado no GitHub e publicado via Netlify.
