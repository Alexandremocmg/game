# Incidentes

Falhas que já aconteceram neste projeto, a causa raiz de cada uma e o que impede a
repetição. Todas custaram tempo — algumas custaram dinheiro, e uma foi ao ar quebrada.

O padrão que se repete: **quase nenhuma delas quebrou o jogo de forma óbvia**. Elas
degradaram em silêncio, e o sintoma visível apontava para o lugar errado.

---

## 1. Os 9 GLB corrompidos por localizar-e-substituir

**Sintoma:** o personagem virou uma cápsula laranja e os obstáculos viraram caixas coloridas.

**Causa:** um localizar-e-substituir global de `BIN` por `BLE` rodou sobre o repositório e
alcançou os arquivos binários. A palavra aparece exatamente uma vez em todo GLB — no cabeçalho
do chunk binário — então os 9 arquivos passaram a declarar `BLE\0` no lugar de `BIN\0`.

Sem esse cabeçalho o `GLTFLoader` não resolve o buffer binário; toda textura falha com
`Cannot read properties of null (reading 'slice')`, o `Promise.all` do preload rejeita, e o
jogo cai inteiro para a geometria de reserva.

**Por que enganou:** o sintoma parecia problema de modelo ou de câmera. E como o jogo continuou
jogável, a falha passou por um commit, um push e um deploy sem ninguém notar.

**Correção:** `scripts/fix-glb-chunk.mjs` — troca os 4 bytes de volta, com backup e modo `--dry`.
Antes de aplicar, foi verificado que o dano se limitava a esses bytes: todos os JSON ainda
parseavam e o `JOINTS_0` do personagem estava intacto (se a substituição tivesse sido `IN`→`LE`,
teria quebrado o esqueleto). Por isso deu para corrigir sem perder a otimização de 70%.

**Prevenção:** `npm run validate:assets` roda no `build` e como passo próprio na Action.
`.gitattributes` marca os assets como binários, fechando a porta para o git normalizar bytes
por conta própria. A proteção que **não** existe é automática: uma busca global no editor ainda
alcança `public/` — ao usar "substituir em todos os arquivos", restrinja o escopo a `src/`.

---

## 2. Caminho errado do decodificador Draco

**Sintoma:** nenhum modelo carregava; mesmo sintoma do incidente 1, e os dois estavam ativos
ao mesmo tempo, o que mascarou um ao outro.

**Causa:** a URL apontava para `.../decoders/1.5.7/gltf/`. A subpasta `gltf/` existe dentro do
pacote npm do three.js, mas **não** no CDN — lá os arquivos ficam na raiz da versão. Dava 404.

**Prevenção:** nenhuma automática. Vale saber que depender de CDN externo para o decodificador
é um ponto único de falha total: se o gstatic estiver bloqueado ou fora do ar, **nenhum** modelo
carrega. Auto-hospedar em `public/draco/` custa ~250 KB e elimina o risco — foi assim antes, e é
uma troca legítima de tamanho por robustez.

---

## 3. Personagem invisível por frustum culling

**Sintoma:** o personagem sumia da tela; só a sombra aparecia no chão.

**Causa:** a bounding sphere de um `SkinnedMesh` é calculada uma vez na bind pose e nunca
recalculada conforme os ossos se movem. Com culling ligado, a animação leva a malha para fora
dessa esfera desatualizada e o Three.js para de desenhar.

**Correção:** `customModel.traverse(o => { o.frustumCulled = false; })` em `Player.ts`.

---

## 4. Verificação que media a pose errada

**Sintoma:** medições "provavam" que o rolamento abaixava o personagem e que não havia deriva —
e mesmo assim o resultado chegou deformado ao usuário.

**Causa:** `THREE.Box3.setFromObject()` num `SkinnedMesh` devolve a caixa da **bind pose**
transformada pela matriz do objeto. Ignora os ossos. A medição saía idêntica em todos os quadros.

**Prevenção:** medir percorrendo os ossos com `bone.getWorldPosition()`. Teste de sanidade: numa
corrida o topo do corpo **tem que variar** entre quadros. Se sair constante, a medição está
errada — não a animação.

Lição mais ampla: screenshot de quadro isolado escolhido por quem implementou não é verificação.
Foi o que levou à criação de `/animacoes.html`, onde o dono do projeto julga cada clipe em
movimento antes de qualquer integração.

---

## 5. Presets de animação por IA deformando o personagem

**Sintoma:** o personagem corria com o torso dobrado ~90° para frente, inclusive no `idle`.

**Causa:** o retarget automático do Tripo não casou com o rig gerado. Duas versões foram testadas
com dinheiro real (~US$ 1,50 no total): a `v1.0-20240301` dobrava o torso, a `v2.5-20260210`
saía com o tronco torcido.

**Correção:** trocar para mocap do Mixamo — gratuito, com pré-visualização no navegador antes de
baixar, e qualidade superior por ser captura real.

**Prevenção:** preferir fontes que permitem **ver antes de pagar**. Detalhes em
[pipeline-personagem.md](pipeline-personagem.md).

---

## 6. Overlay engolindo o toque no celular

**Sintoma:** no celular o jogo não saía da tela inicial; no desktop funcionava.

**Causa:** o `#overlay` cobria a tela inteira e capturava o toque antes de chegar ao canvas, onde
mora o listener de swipe. No desktop o teclado tem listener próprio em `window`, então passava.

**Correção:** `pointer-events: none` no overlay.

**Lição:** testar no preset mobile com toque real, não com mouse. Uma falha que só existe num
tipo de entrada não aparece testando o outro.

---

## 7. Pós-processamento se desligando sozinho no aparelho certo

**Sintoma:** nenhum. Bloom, vinheta e color grade simplesmente não apareciam — e como o jogo
continuava rodando bem, ninguém notava que metade do tratamento visual estava ausente.

**Causa:** a sonda de degradação automática (`Post.probe`) desliga o efeito em definitivo após
3 segundos de FPS abaixo de 48. Só que os primeiros segundos são *sempre* lentos: compilação
de shader, upload de textura para a GPU, e a média móvel de FPS do `Loop` partindo de zero.
Esse aquecimento era lido como "aparelho fraco". Medido num aparelho a **60fps cravados**:
`lowFpsTime` já chegava a 3,28 s antes do primeiro frame estável, e o efeito nascia desligado.

**Correção:** carência de 4 s antes de a sonda começar a julgar, e ignorar leitura de FPS igual
a zero (média ainda não formada).

**Lição:** um mecanismo de degradação automática precisa de carência. Sem ela, ele mede o
aquecimento em vez do desempenho — e o modo degradado é justamente o que ninguém percebe.

---

## 8. Duas ações compartilhando o mesmo clipe

**Sintoma:** o pulo congelou — o personagem ficava parado no ar.

**Causa:** `mixer.clipAction(clip)` devolve a **mesma** `AnimationAction` para o mesmo clipe.
O estado de voo reaproveitava o clipe do pulo, e sua configuração (`timeScale: 0`, para congelar
a pose) sobrescreveu a do pulo.

**Correção:** `clip.clone()` com nome distinto antes de criar a segunda ação.
