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
export class Track {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly zs: number[] = [];
  /** Uma geometria por tema, construída sob demanda e reaproveitada depois. */
  private readonly geometrias = new Map<string, THREE.BufferGeometry>();
  private tema: Tema;

  constructor(scene: THREE.Scene) {
    this.tema = TEMAS[0]!;
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
    const geometriaAtual = this.geometriaDe(this.tema);
    for (let i = 0; i < this.meshes.length; i++) {
      let z = this.zs[i]! + dz;
      if (z > CHUNK_RECYCLE_Z) {
        z -= TRACK_SPAN;
        this.meshes[i]!.geometry = geometriaAtual;
      }
      this.zs[i] = z;
      this.meshes[i]!.position.z = z;
    }
  }

  /** Reinicia todos os chunks já no tema dado — usado ao começar uma partida. */
  reset(tema: Tema): void {
    this.tema = tema;
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

  return mergeGeometries(parts, false)!;
}
