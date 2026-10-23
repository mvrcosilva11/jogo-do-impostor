# 🕵️ Jogo do Impostor

Joguinho n.º 1 dos **Joguinhos do Marco** (https://joguinhos-do-marco.netlify.app).

Jogo de festa para um só telemóvel, passado de mão em mão. Todos recebem uma palavra secreta — exceto o(s) impostor(es), que só recebem uma dica subtil. Conversem, desconfiem e descubram quem está a fingir.

## Modos

- **Passa o telemóvel** — um telemóvel para todos; a app escolhe a palavra. Cada jogador carrega e mantém a carta para a ver; larga para esconder e passa ao seguinte. Os nomes ficam guardados no telemóvel.
- **Palavra vossa** — cada um escreve uma palavra e sai uma à sorte; quem a escreveu nunca é impostor e o impostor joga sem pista.
- **Online** — cada um no seu telemóvel (sala com código de 4 letras, relay MQTT público). Pistas escritas ou em foto/gif, duas rondas e votação.

Impostores: **Escolher** (até 1/3 dos jogadores) ou **À sorte** (1 é o mais provável; serem todos é o mais raro).

## Língua

O jogo todo muda para inglês nas Definições (língua comum a todos os Joguinhos do Marco, `jm.js`). As palavras e as pistas em inglês estão em [`words-en.js`](words-en.js) (`node .dev/check-en.js` diz as que faltam). As pistas escritas no modo online chegam traduzidas automaticamente a quem joga na outra língua.

## Studio Mode

Desligado não deixa rasto: não há interruptor à vista. Liga-se pela porta escondida dos Joguinhos do Marco (carregar 3 s no ícone, ou o endereço `/studio`). Ligado, aparece uma secção no início com as palavras do pessoal (nomes com pistas que rimam) e os nomes com gif. Tudo isso vive em [`words-studio.js`](words-studio.js), só descarregado com o modo ligado (`node .dev/check-studio.js` confere que não há nomes do pessoal fora dele).

## Categorias de palavras

Animais, Profissões, Plantas, Comida, Lugares, Objetos, Celebridades, Personalidades PT, Música, Filmes & Séries, Youtubers PT, Brainrot, Portugal, Futebol, Drogas, Weed, Picante e mais. Para acrescentar palavras, edita [`words.js`](words.js) — cada linha é `{ p: "palavra", d: "pista", c: "categoria" }` — e junta a tradução em `words-en.js`.

## Stack

HTML, CSS e JavaScript puro, sem build. A linguagem visual (iOS 26) e o som vêm de `jm.css` e `jm.js`, copiados dos Joguinhos do Marco com `_tools/sync-jm.sh`. Alojado no GitHub e publicado via Netlify.
