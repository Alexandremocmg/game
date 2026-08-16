import * as THREE from 'three';
import { BUILDING_COUNT, CHUNK_RECYCLE_Z, TRACK_SPAN, TRACK_WIDTH } from '../config';
import { makeBuildingShapes, makeCarShape, makeWindowTexture } from '../render/geometry';
import { TEMAS, type Tema } from './themes';

/**
 * Cenário lateral — uma `InstancedMesh` por silhueta, 4 draw calls para o
 * skyline inteiro.
 *
 * Não faz parte dos chunks de propósito: rolando em ciclo próprio, a repetição
 * do cenário deixa de coincidir com a repetição da pista. Cada peça é
 * re-sorteada ao dar a volta, então o skyline nunca se repete — e é essa
 * mesma reciclagem que traz o tema novo, peça por peça, sem troca brusca.
 *
 * Três coisas variam por tema: a **paleta**, as **faixas de tamanho** (é o que
 * transforma torres altas e estreitas em formações baixas e largas) e os
 * **pesos das silhuetas** (é o que decide se o horizonte tem antenas ou só
 * blocos). Nada disso muda a contagem de draw calls.
 */

/** Distribuição em duas faixas: a de trás é mais larga e mais alta, e é ela
 *  que dá profundidade ao horizonte em vez de uma parede única de prédios. */
const FRACAO_NA_FAIXA_DISTANTE = 0.45;
const FAIXA_PERTO = { xMin: TRACK_WIDTH / 2 + 3.5, xLargura: 14, escala: 1 };
const FAIXA_LONGE = { xMin: TRACK_WIDTH / 2 + 18, xLargura: 26, escala: 1.7 };

/**
 * Carros de cenário, encostados no meio-fio — a mesma lateral já usada pelas
 * pernas do pórtico e pelas paredes do túnel (`Track.ts`), comprovadamente
 * inalcançável: o obstáculo mais largo do jogo chega a |x| = 3,2 e o meio-fio
 * termina em 4,4.
 */
const CARRO_X_MIN = 5.0;
const CARRO_X_LARGURA = 0.8;
/** Maior `quantidade` entre os temas — capacidade fixa da `InstancedMesh`. */
const CARRO_CAPACIDADE = 12;

export class Scenery {
  private readonly formas: THREE.InstancedMesh[];
  private readonly material: THREE.MeshLambertMaterial;

  private readonly zs = new Float32Array(BUILDING_COUNT);
  private readonly xs = new Float32Array(BUILDING_COUNT);
  private readonly sx = new Float32Array(BUILDING_COUNT);
  private readonly sy = new Float32Array(BUILDING_COUNT);
  private readonly sz = new Float32Array(BUILDING_COUNT);
  /** Qual silhueta cada peça usa — define em qual `InstancedMesh` ela entra. */
  private readonly forma = new Uint8Array(BUILDING_COUNT);
  /** Cor sorteada, guardada porque o índice da instância muda a cada passo. */
  private readonly cor = new Uint32Array(BUILDING_COUNT);

  private readonly dummy = new THREE.Object3D();
  private readonly corAux = new THREE.Color();
  private readonly contagem: number[];
  private tema: Tema;

  // --- carros: mesmo esquema de reciclagem dos prédios, com um detalhe a
  // mais — cada slot carrega se está "ativo" nesta passada, decidido no
  // instante em que recicla. É o que faz a densidade mudar por tema (12 na
  // noite, 5 no deserto, nenhum no túnel) chegando peça por peça, como a cor
  // e a forma dos prédios — nunca a frota inteira aparecendo ou sumindo de
  // uma vez.
  private readonly carroMesh: THREE.InstancedMesh;
  private readonly carroZs = new Float32Array(CARRO_CAPACIDADE);
  private readonly carroXs = new Float32Array(CARRO_CAPACIDADE);
  private readonly carroCor = new Uint32Array(CARRO_CAPACIDADE);
  private readonly carroAtivo = new Uint8Array(CARRO_CAPACIDADE);

  constructor(scene: THREE.Scene) {
    this.tema = TEMAS[0]!;

    this.material = new THREE.MeshLambertMaterial({
      // A janela acesa é `emissiveMap`: brilha sozinha, sem depender da luz da
      // cena — que à noite é justamente o que falta.
      emissiveMap: makeWindowTexture(),
      emissive: new THREE.Color(this.tema.janelaCor),
      emissiveIntensity: this.tema.janelaForca,
    });

    const geometrias = makeBuildingShapes();
    this.contagem = geometrias.map(() => 0);
    this.formas = geometrias.map((geo) => {
      const inst = new THREE.InstancedMesh(geo, this.material, BUILDING_COUNT);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // As instâncias se movem todo frame; a esfera envolvente ficaria sempre
      // desatualizada, então o culling é desligado de propósito.
      inst.frustumCulled = false;
      scene.add(inst);
      return inst;
    });

    for (let i = 0; i < BUILDING_COUNT; i++) {
      this.randomize(i);
      // Na primeira distribuição espalhamos pelo trecho inteiro.
      this.zs[i] = CHUNK_RECYCLE_Z - Math.random() * TRACK_SPAN;
    }

    this.carroMesh = new THREE.InstancedMesh(
      makeCarShape(),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      CARRO_CAPACIDADE,
    );
    this.carroMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.carroMesh.frustumCulled = false;
    scene.add(this.carroMesh);
    for (let i = 0; i < CARRO_CAPACIDADE; i++) {
      this.randomizeCarro(i);
      this.carroZs[i] = CHUNK_RECYCLE_Z - Math.random() * TRACK_SPAN;
    }

    this.writeMatrices();
  }

  /** Quantos draw calls o cenário custa — usado na conferência de orçamento. */
  get drawCalls(): number {
    return this.formas.length + 1;
  }

  /**
   * Define o tema das peças que reciclarem daqui em diante. As já visíveis
   * mantêm a aparência anterior até darem a volta.
   */
  setTema(tema: Tema): void {
    this.tema = tema;
  }

  /**
   * Interpola o brilho das janelas entre dois temas.
   *
   * Diferente da paleta e das formas, isto **não** pode esperar a reciclagem:
   * o emissivo vive no material, que é um só para todos os prédios. Se
   * trocasse de uma vez, o skyline inteiro acenderia num quadro. Interpolar
   * junto com a luz da cena é o que mantém a transição contínua.
   */
  aplicarTema(a: Tema, b: Tema, t: number): void {
    this.corAux.setHex(a.janelaCor);
    this.material.emissive.copy(this.corAux.lerp(auxB.setHex(b.janelaCor), t));
    this.material.emissiveIntensity = a.janelaForca + (b.janelaForca - a.janelaForca) * t;
  }

  /** Redistribui tudo já no tema dado — usado ao começar uma partida. */
  reset(tema: Tema): void {
    this.tema = tema;
    for (let i = 0; i < BUILDING_COUNT; i++) {
      this.randomize(i);
      this.zs[i] = CHUNK_RECYCLE_Z - Math.random() * TRACK_SPAN;
    }
    for (let i = 0; i < CARRO_CAPACIDADE; i++) {
      this.randomizeCarro(i);
      this.carroZs[i] = CHUNK_RECYCLE_Z - Math.random() * TRACK_SPAN;
    }
    this.writeMatrices();
  }

  update(dz: number): void {
    for (let i = 0; i < BUILDING_COUNT; i++) {
      let z = this.zs[i]! + dz;
      if (z > CHUNK_RECYCLE_Z) {
        z -= TRACK_SPAN;
        this.randomize(i);
      }
      this.zs[i] = z;
    }
    for (let i = 0; i < CARRO_CAPACIDADE; i++) {
      let z = this.carroZs[i]! + dz;
      if (z > CHUNK_RECYCLE_Z) {
        z -= TRACK_SPAN;
        this.randomizeCarro(i);
      }
      this.carroZs[i] = z;
    }
    this.writeMatrices();
  }

  /** Sorteia silhueta, forma, posição lateral e cor a partir do tema. O Z é de quem chama. */
  private randomize(i: number): void {
    const t = this.tema;
    const side = Math.random() < 0.5 ? -1 : 1;
    const longe = Math.random() < FRACAO_NA_FAIXA_DISTANTE;
    const faixa = longe ? FAIXA_LONGE : FAIXA_PERTO;

    const [largMin, largMax] = t.predioLargura;
    const [altMin, altMax] = t.predioAltura;

    const larguraX = (largMin + Math.random() * (largMax - largMin)) * faixa.escala;
    this.sx[i] = larguraX;
    this.sz[i] = (largMin + Math.random() * (largMax - largMin)) * faixa.escala;
    this.sy[i] = (altMin + Math.random() * (altMax - altMin)) * faixa.escala;
    this.forma[i] = sorteiaForma(t.formaPesos);
    this.cor[i] = pick(t.predios);

    // A largura entra na posição: sem isto, uma peça larga sorteada perto da
    // borda interna da faixa invade a pista. `faixa.xMin` já é a distância da
    // borda ao meio-fio, então somar metade da largura empurra a peça para
    // fora dessa margem — o piso que faltava, não um teto novo.
    this.xs[i] = side * (faixa.xMin + larguraX / 2 + Math.random() * faixa.xLargura);
  }

  /**
   * Decide se este slot tem carro nesta passada e, se tiver, sorteia cor e
   * lado. A "quantidade" do tema não corta a frota de uma vez — cada slot só
   * reavalia sua própria ativação quando **ele mesmo** recicla, então a
   * mudança de densidade entre temas chega peça por peça, como tudo o mais
   * no cenário.
   */
  private randomizeCarro(i: number): void {
    const carros = this.tema.carros;
    if (!carros || i >= carros.quantidade) { this.carroAtivo[i] = 0; return; }

    this.carroAtivo[i] = 1;
    this.carroCor[i] = pick(carros.cores);
    const side = Math.random() < 0.5 ? -1 : 1;
    this.carroXs[i] = side * (CARRO_X_MIN + Math.random() * CARRO_X_LARGURA);
  }

  /**
   * Empacota as peças por silhueta. Mesmo padrão do pool de obstáculos: uma
   * passada só, um contador por `InstancedMesh`, e `count` no fim.
   */
  private writeMatrices(): void {
    for (let f = 0; f < this.contagem.length; f++) this.contagem[f] = 0;
    // `dummy` é compartilhado com o laço dos carros, que gira cada instância
    // — sem isto a rotação de um carro vazaria para os prédios do frame
    // seguinte, já que os prédios nunca tocam `rotation`.
    this.dummy.rotation.set(0, 0, 0);

    for (let i = 0; i < BUILDING_COUNT; i++) {
      const malha = this.formas[this.forma[i]!]!;
      const n = this.contagem[this.forma[i]!]!++;
      this.dummy.position.set(this.xs[i]!, -0.35, this.zs[i]!);
      this.dummy.scale.set(this.sx[i]!, this.sy[i]!, this.sz[i]!);
      this.dummy.updateMatrix();
      malha.setMatrixAt(n, this.dummy.matrix);
      malha.setColorAt(n, this.corAux.setHex(this.cor[i]!));
    }

    for (let f = 0; f < this.formas.length; f++) {
      const malha = this.formas[f]!;
      malha.count = this.contagem[f]!;
      malha.instanceMatrix.needsUpdate = true;
      if (malha.instanceColor) malha.instanceColor.needsUpdate = true;
    }

    // Carros: só as vagas ativas entram, compactadas no início do buffer —
    // mesmo mecanismo que o Spawner usa para os obstáculos vivos.
    let n = 0;
    for (let i = 0; i < CARRO_CAPACIDADE; i++) {
      if (!this.carroAtivo[i]) continue;
      this.dummy.position.set(this.carroXs[i]!, 0, this.carroZs[i]!);
      // Carro de frente para a pista: metade olha para +X, metade para -X.
      this.dummy.rotation.set(0, this.carroXs[i]! > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.carroMesh.setMatrixAt(n, this.dummy.matrix);
      this.carroMesh.setColorAt(n, this.corAux.setHex(this.carroCor[i]!));
      n++;
    }
    this.carroMesh.count = n;
    this.carroMesh.instanceMatrix.needsUpdate = true;
    if (this.carroMesh.instanceColor) this.carroMesh.instanceColor.needsUpdate = true;
  }
}

const auxB = new THREE.Color();

/** Sorteio ponderado — é o que faz o deserto quase só ter blocos e a cidade ter antenas. */
function sorteiaForma(pesos: readonly number[]): number {
  let total = 0;
  for (const p of pesos) total += p;
  let r = Math.random() * total;
  for (let i = 0; i < pesos.length; i++) {
    r -= pesos[i]!;
    if (r <= 0) return i;
  }
  return 0;
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}
