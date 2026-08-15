# Pipeline de animação do personagem

Como o personagem sai do Mixamo e chega ao jogo, e as armadilhas que custaram caro
descobrir. Leia antes de mexer em `src/player/Player.ts` ou em `public/models/player_mixamo.glb`.

## Regra de processo

**Nenhum asset entra no jogo sem aprovação do dono do projeto.** O fluxo é:
montar o GLB → publicar em `/animacoes.html` → ele aprova clipe a clipe → só então integrar.

## Por que Mixamo e não Tripo

O modelo do personagem foi gerado no Tripo, e a tentação natural é usar também os presets
de animação de lá. **Não funcionou.** As duas versões de rig foram testadas com dinheiro real:

| Rig | Resultado |
|---|---|
| `v1.0-20240301` | torso dobrado ~90° para frente em **todos** os clipes, inclusive `idle` |
| `v2.5-20260210` | postura ereta, mas tronco torcido e membros estranhos |
| Mixamo | captura de movimento real, qualidade muito superior |

Além da qualidade, o Mixamo é **gratuito** e permite pré-visualizar no navegador antes de
baixar — enquanto cada retarget do Tripo custa 10 créditos às cegas.

Os presets do Tripo também **não têm deslize nem rolamento**. O mais próximo, `preset:dive`,
é um salto para frente que mantém o corpo na altura do peito (topo medido em 1,70 durante o
clipe inteiro), inútil para passar sob o pórtico em 1,05.

## O processo

1. **Malha estática**: exportar o personagem sem esqueleto em FBX
   (`public/models/player_static.fbx`). O Mixamo aceita FBX/OBJ, **não** GLB.
2. **Mixamo**: subir a malha, marcar os ~10 pontos do auto-rig, escolher animações,
   baixar cada uma em FBX.
3. **Blender**: importar todos os FBX, manter **uma** malha e **um** esqueleto, preservar
   as ações renomeadas, remover root motion, reduzir texturas, exportar GLB único.
4. **Aprovação** em `/animacoes.html`.
5. **Integração** em `src/player/Player.ts`.

## Armadilhas

### Box3 não mede a pose animada
`THREE.Box3.setFromObject()` num `SkinnedMesh` devolve a caixa da **bind pose** transformada
pela matriz do objeto — ignora os ossos. Medições saem constantes ao longo da animação e dão
falsa confiança.

Meça percorrendo os ossos com `bone.getWorldPosition()`. **Teste de sanidade:** numa corrida
o topo tem que variar entre quadros. Se sair constante, a medição está errada.

### `clipAction()` devolve a mesma instância
`mixer.clipAction(clip)` retorna a **mesma** `AnimationAction` para o mesmo clipe. Dois
estados que compartilham um clipe compartilham a configuração — e o segundo sobrescreve o
primeiro. Isso deixou o pulo congelado (`timeScale: 0`) quando o voo reaproveitou o clipe.

Solução: `clip.clone()` com nome distinto antes de criar a segunda ação.

### Root motion
Os FBX do Mixamo vêm **sem** "In Place" por padrão: a corrida avança 1,66 m e o deslize
3,68 m. Quem posiciona o personagem no mundo é o jogo, então esse avanço tem que sair.

Política por eixo, em `scripts/` (Blender):

- **X e Z**: sempre removidos.
- **Y**: removido onde a altura é do jogo (pulo, queda, batida); **mantido** no deslize,
  onde a descida é o próprio agachamento que faz o personagem passar sob o pórtico.

### Orientação depende do rig
Cada rig encara um lado. O do **Mixamo** precisa de `rotation.y = Math.PI`; o do Tripo
precisava de `Math.PI / 2`.

**Não deduza pelo root motion** — na animação do Tripo a translação ia no sentido *oposto*
ao que o personagem encarava, o que leva a 180° de erro. Renderize e veja de que lado está
o rosto.

### Frustum culling em SkinnedMesh
A bounding sphere é calculada uma vez na bind pose e nunca recalculada. Com culling ligado,
a animação move a malha para fora dela e o personagem **desaparece** em certos ângulos.
Por isso `customModel.traverse(o => { o.frustumCulled = false; })`.

### Texturas voltam infladas
O ciclo FBX → Mixamo → FBX reembute as texturas em 2048² e cria uma cópia por arquivo
importado. Sem reduzir para 512² e limpar duplicatas, o GLB sai com **7,84 MB** em vez de
**1,41 MB**.

## Janelas de clipe

Os clipes do Mixamo são mais longos e teatrais que as ações do jogo — o "Big Jump" tem 2,37 s
contra 0,66 s de tempo no ar. Tocar do início cortaria no meio da agachada, sem nunca chegar
à parte no ar.

`CLIPES` em [`src/player/Player.ts`](../src/player/Player.ts) recorta a parte útil de cada
clipe e a estica para a duração da ação no jogo. Os limites foram **medidos pela pose real
dos ossos**, não estimados:

| Estado | Clipe | Janela | Por quê |
|---|---|---|---|
| `run` | `run` | inteiro, em loop | — |
| `jump` | `jump` | 15%–95% | impulso começa em 15%, aterrissagem termina em 95% |
| `roll` | `slide` | 22%–62% | corpo fica abaixo do pórtico (1,05) nessa faixa; topo chega a 0,46 |
| `fly` | `fall` | inteiro, em loop | Falling Idle, clipe próprio |

A hitbox do rolamento encolhe no instante do comando, então a janela **não** pode começar
no agachamento inicial: o visual ficaria em pé enquanto a colisão já diz que passa por baixo.
Começando em 22%, o corpo passa 93% do rolamento abaixo do pórtico (contra 76% começando em 18%).

O fade entre estados também conta: 0,12 s numa ação de 0,48 s é um quarto dela com o corpo no
meio do caminho. O rolamento usa 0,05 s.

## Integridade dos arquivos

`npm run validate:assets` confere a estrutura de cada GLB e roda no `build` e na Action.

Isso não é zelo excessivo: os 9 GLB já foram corrompidos de uma vez só por um
localizar-e-substituir global, e o jogo **não quebrou** — degradou em silêncio para a geometria
de reserva e foi ao ar assim. Se algum dia o personagem voltar a aparecer como cápsula, rode a
validação antes de investigar o código. Histórico completo em [incidentes.md](incidentes.md).

## Pendências

- **`hit`** (Hit To Head) está no GLB e sem uso. Substituiria a morte instantânea por uma
  animação de batida, mas isso altera jogabilidade.
- **`idle`** e **`hit`** estão mapeados em `Player.ts`; o `idle` cobre a tela inicial.
