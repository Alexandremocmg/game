import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CHUNK_LENGTH, CHUNK_POOL_SIZE, CHUNK_RECYCLE_Z,
  LANE_WIDTH, TRACK_SPAN, TRACK_WIDTH,
} from '../config';
import { box } from '../render/geometry';
import { TEMAS, type Tema } from './themes';

/**
 * Trilha infinita por reciclagem de chunks.
 *
 * O jogador nunca sai de z = 0 — é o mundo que vem em direção a ele. Isso
 * evita perda de precisão de float numa corrida que pode durar quilômetros e
 * mantém o culling trivial. Quando um chunk passa da câmera, ele volta para
 * o fim da fila; nada é criado nem destruído durante a partida.
 *
 * A troca de tema pega carona nessa reciclagem. As cores da pista são cor por
 * vértice numa geometria fundida, então não dá para trocá-las por material —
 * mas um chunk recicla em z ≈ −156, **além do alcance da névoa (140)**. Ao
 * renascer já com a geometria do tema novo, ele aparece invisível e vem
 * chegando pelo horizonte: a fronteira entre os dois ambientes lê como entrar
 * num bairro diferente, em vez de piscar na cara do jogador.
 */
/**
 * Folgas de que sai toda a geometria nova — paredes, teto e pórtico.
 *
 * Nenhuma delas é escolha estética: são as bordas do que o jogo consegue
 * alcançar, e por isso ficam aqui derivadas, não em `themes.ts` junto das
 * cores. Se um dia a pista alargar ou o jetpack subir, é este bloco que
 * precisa ser refeito.
 *
 * - obstáculo mais largo: trem, `halfWidth` 1.0 na pista ±`LANE_WIDTH` → |x| = 3.2
 * - borda externa do meio-fio → |x| = 4.4
 * - ponto mais alto do jogador: cabeça sob jetpack, 3.1 + 1.7 → y = 4.8
 *
 * Nada disto ganha caixa de colisão: são cenário puro, postos onde o jogador
 * comprovadamente não chega.
 */
/** X das paredes do túnel e das pernas do pórtico — 0.6 além do meio-fio. */
const MURO_X = 5;
/**
 * Face de baixo do teto e da travessa. Medida com os ossos sob jetpack, a
 * cabeça chega a 4.62 — sobram 1.08 de folga.
 */
const VAO_Y = 5.7;
/** Face de baixo do teto, um pouco acima do vão livre. */
const TETO_BASE = VAO_Y + 0.3;
const TETO_ESPESSURA = 0.5;
/**
 * Topo das paredes, rente ao topo do teto.
 *
 * A tentação é levantá-las bem mais, com medo de o canto superior da tela
 * enxergar céu por cima da borda lateral do teto. **Não acontece**, e a razão
 * é que as duas superfícies se cobrem: um raio só passa pela borda do teto se
 * for raso o bastante para chegar a `TETO_MEIA_LARGURA` antes de subir os 1.7
 * até o teto — e um raio tão raso cruza a face interna da parede bem abaixo
 * desta altura, onde ela o pega.
 *
 * Verificado por varredura de raios, não por dedução: 30 mil amostras por
 * proporção, tela inteira, FOV máximo, câmera nos dois extremos laterais, em
 * 16:9, 21:9, 32:9 e 9:16 — zero vazamentos. Paredes mais altas que isto não
 * vedam nada a mais e, vistas de fora, viram duas aletas finas em vez de um
 * portal.
 */
const MURO_TOPO = TETO_BASE + TETO_ESPESSURA;
/** Meia-largura do teto: cobre as paredes e sobra uma pequena aba. */
const TETO_MEIA_LARGURA = 5.75;

export class Track {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly zs: number[] = [];
  /** Uma geometria por tema, construída sob demanda e reaproveitada depois. */
  private readonly geometrias = new Map<string, THREE.BufferGeometry>();
  private tema: Tema;

  /**
   * Pórtico que marca a emenda entre dois ambientes. Uma malha só dá conta: as
   * fronteiras ficam a centenas de unidades uma da outra e o marco percorre
   * `TRACK_SPAN` até sumir, então nunca há dois em cena ao mesmo tempo.
   */
  private readonly marco: THREE.Mesh;
  private readonly marcoMaterial: THREE.MeshLambertMaterial;
  private marcoZ = 0;
  /** Tema do último chunk reciclado — é a virada dele que cria a emenda. */
  private temaDoUltimoReciclado: Tema;

  constructor(scene: THREE.Scene) {
    this.tema = TEMAS[0]!;
    this.temaDoUltimoReciclado = this.tema;
    // Um material só para todos os chunks e todos os temas: a cor vem do
    // atributo de vértice, então trocar de tema não custa draw call nenhum.
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const geometria = this.geometriaDe(this.tema);

    for (let i = 0; i < CHUNK_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geometria, material);
      const z = CHUNK_LENGTH * (1 - i);
      mesh.position.z = z;
      this.zs.push(z);
      this.meshes.push(mesh);
      scene.add(mesh);
    }

    // O marco é a única peça do mundo que muda de cor sem trocar de geometria,
    // então é a única que ignora o atributo de vértice e usa `material.color`.
    this.marcoMaterial = new THREE.MeshLambertMaterial();
    this.marco = new THREE.Mesh(buildMarcoGeometry(), this.marcoMaterial);
    this.marco.visible = false;
    scene.add(this.marco);
  }

  /** Estado do pórtico — usado para conferir o alinhamento com a emenda. */
  get debugMarco(): { visivel: boolean; z: number } {
    return { visivel: this.marco.visible, z: this.marcoZ };
  }

  /** Posições em Z dos chunks — usado para verificar a reciclagem. */
  get debugZs(): number[] {
    return [...this.zs];
  }

  /** Quantos chunks já mostram o tema corrente (0 a CHUNK_POOL_SIZE). */
  get debugChunksNoTema(): number {
    const alvo = this.geometriaDe(this.tema);
    return this.meshes.filter((m) => m.geometry === alvo).length;
  }

  /**
   * Define o tema dos chunks que reciclarem daqui em diante. Os que já estão
   * em cena mantêm o anterior até darem a volta — é isso que faz a fronteira
   * vir chegando em vez de o chão inteiro mudar de cor de uma vez.
   */
  setTema(tema: Tema): void {
    this.tema = tema;
  }

  update(dz: number): void {
    // O marco anda antes do laço de propósito: se um chunk o reposicionar
    // agora, a posição nova é a autoritativa e não deve levar `dz` por cima.
    if (this.marco.visible) {
      this.marcoZ += dz;
      if (this.marcoZ > CHUNK_RECYCLE_Z) this.marco.visible = false;
      else this.marco.position.z = this.marcoZ;
    }

    const geometriaAtual = this.geometriaDe(this.tema);
    for (let i = 0; i < this.meshes.length; i++) {
      let z = this.zs[i]! + dz;
      if (z > CHUNK_RECYCLE_Z) {
        z -= TRACK_SPAN;
        // Este é o primeiro chunk do tema novo, e ele é sempre o mais
        // distante — tudo que está mais perto ainda carrega o tema anterior.
        // Logo a emenda entre os dois ambientes é a borda dianteira dele, e é
        // exatamente ali que o pórtico tem que ficar. Nasce além da névoa e
        // vem chegando pelo horizonte junto com o chão novo: alinhado por
        // construção, não por coincidência numérica.
        if (this.tema !== this.temaDoUltimoReciclado) {
          this.temaDoUltimoReciclado = this.tema;
          this.marcoZ = z + CHUNK_LENGTH / 2;
          this.marco.position.z = this.marcoZ;
          // Pintado com a cor de quem está **entrando**: o marco anuncia o que
          // vem, não o que ficou.
          this.marcoMaterial.color.setHex(this.tema.marcoCor);
          this.marco.visible = true;
        }
        this.meshes[i]!.geometry = geometriaAtual;
      }
      this.zs[i] = z;
      this.meshes[i]!.position.z = z;
    }
  }

  /** Reinicia todos os chunks já no tema dado — usado ao começar uma partida. */
  reset(tema: Tema): void {
    this.tema = tema;
    this.temaDoUltimoReciclado = tema;
    this.marco.visible = false;
    const geometria = this.geometriaDe(tema);
    for (let i = 0; i < this.meshes.length; i++) {
      const z = CHUNK_LENGTH * (1 - i);
      this.zs[i] = z;
      this.meshes[i]!.position.z = z;
      this.meshes[i]!.geometry = geometria;
    }
  }

  private geometriaDe(tema: Tema): THREE.BufferGeometry {
    let geo = this.geometrias.get(tema.nome);
    if (!geo) {
      geo = buildChunkGeometry(tema);
      this.geometrias.set(tema.nome, geo);
    }
    return geo;
  }
}

/**
 * Todas as peças do chunk fundidas numa geometria só, com cor por vértice.
 * Resultado: 1 draw call por chunk em vez de um por peça.
 */
function buildChunkGeometry(tema: Tema): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const half = TRACK_WIDTH / 2;

  // Chão lateral largo — sem ele o horizonte mostra o vazio nas bordas.
  parts.push(box(90, 0.4, CHUNK_LENGTH, 0, -0.55, 0, tema.bordaEstrada));

  // Superfície da pista, com o topo exatamente em y = 0.
  parts.push(box(TRACK_WIDTH, 0.5, CHUNK_LENGTH, 0, -0.25, 0, tema.estrada));

  for (const sign of [-1, 1]) {
    parts.push(box(0.5, 0.6, CHUNK_LENGTH, sign * (half + 0.25), -0.05, 0, tema.meioFio));
  }

  // Faixas tracejadas nos limites entre as pistas: a referência visual que
  // deixa claro para onde o swipe leva.
  const dash = 2.4;
  const stride = dash * 2;
  const dashes = Math.round(CHUNK_LENGTH / stride);
  for (const sign of [-1, 1]) {
    for (let i = 0; i < dashes; i++) {
      const z = -CHUNK_LENGTH / 2 + stride * (i + 0.5);
      parts.push(box(0.16, 0.04, dash, sign * (LANE_WIDTH / 2), 0.01, z, tema.faixa));
    }
  }

  // Temas fechados ganham casca. Fundida aqui junto com o chão, o chunk
  // continua sendo uma malha só — o túnel não custa nenhum draw call novo.
  if (tema.tunel) {
    const t = tema.tunel;
    const base = -0.55;

    for (const sign of [-1, 1]) {
      const altura = MURO_TOPO - base;
      parts.push(box(0.5, altura, CHUNK_LENGTH, sign * MURO_X, base + altura / 2, 0, t.parede));
    }

    parts.push(box(
      TETO_MEIA_LARGURA * 2, TETO_ESPESSURA, CHUNK_LENGTH,
      0, TETO_BASE + TETO_ESPESSURA / 2, 0, t.teto,
    ));

    // Tiras rentes ao teto, logo por dentro da parede. Não iluminam nada — é o
    // bloom do tema que as transforma em luminária, o mesmo truque das faixas
    // da noite. Quatro por lado dão uma cadência de luz passando sem virar
    // estroboscópio na velocidade máxima.
    const luminarias = 4;
    const passo = CHUNK_LENGTH / luminarias;
    for (const sign of [-1, 1]) {
      for (let i = 0; i < luminarias; i++) {
        const z = -CHUNK_LENGTH / 2 + passo * (i + 0.5);
        parts.push(box(0.32, 0.12, 3.6, sign * (MURO_X - 0.4), VAO_Y + 0.18, z, t.luminaria));
      }
    }
  }

  return mergeGeometries(parts, false)!;
}

/**
 * Pórtico da fronteira: duas pernas fora do meio-fio e uma travessa acima do
 * alcance do jetpack. Mesma silhueta da boca do túnel de propósito — assim a
 * peça que anuncia "outro ambiente" é a mesma que serve de portal quando o
 * ambiente que entra é fechado.
 *
 * Sai branco porque quem pinta é `material.color`, tema a tema. O atributo de
 * cor por vértice que o `box()` grava fica sem uso aqui.
 */
function buildMarcoGeometry(): THREE.BufferGeometry {
  const base = -0.55;
  const topo = VAO_Y + 0.7;
  const parts: THREE.BufferGeometry[] = [];

  for (const sign of [-1, 1]) {
    const altura = topo - base;
    parts.push(box(0.6, altura, 0.8, sign * MURO_X, base + altura / 2, 0, 0xffffff));
  }
  parts.push(box(
    MURO_X * 2 + 1, topo - VAO_Y, 0.9,
    0, (VAO_Y + topo) / 2, 0, 0xffffff,
  ));

  return mergeGeometries(parts, false)!;
}
