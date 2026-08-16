import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Desenha N cópias de um modelo com o mínimo de draw calls possível.
 *
 * O problema que isto resolve era o maior desperdício do jogo: obstáculos e
 * power-ups eram um `Object3D` por vaga do pool — 188 objetos gastando 45 draw
 * calls, 61% do orçamento, enquanto 223 prédios e moedas custavam 2 por serem
 * instanciados.
 *
 * O modelo entra achatado: cada malha da hierarquia tem seu transform **assado
 * na geometria** e as que dividem material são fundidas. Sobra uma
 * `InstancedMesh` por material — normalmente uma só, quatro no caso do `gate`,
 * que veio do Sketchfab com quatro materiais distintos.
 *
 * Assar o transform é o que permite reaproveitar o arranjo já validado do
 * modelo (os dois cones lado a lado do `low`, o `scaleY`/`offsetY` do `gate`)
 * sem reimplementá-lo: monta-se **uma** cópia arranjada e ela vira geometria.
 */
export class ModeloInstanciado {
  private readonly malhas: THREE.InstancedMesh[] = [];

  private constructor(
    scene: THREE.Scene,
    pares: Array<{ geometria: THREE.BufferGeometry; material: THREE.Material }>,
    capacidade: number,
  ) {
    for (const { geometria, material } of pares) {
      const inst = new THREE.InstancedMesh(geometria, material, capacidade);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Mesma razão do `Scenery`: as instâncias se movem todo frame, então a
      // esfera envolvente nasce desatualizada e o culling esconderia peças
      // que estão em cena.
      inst.frustumCulled = false;
      inst.count = 0;
      scene.add(inst);
      this.malhas.push(inst);
    }
  }

  /** Quantas `InstancedMesh` este modelo ocupa — ou seja, quantos draw calls custa. */
  get drawCalls(): number {
    return this.malhas.length;
  }

  /**
   * Achata uma hierarquia já arranjada. O transform de cada malha é resolvido
   * relativo à raiz e assado na geometria, então a matriz de instância fica
   * livre para carregar só a posição no mundo.
   */
  static deObject3D(scene: THREE.Scene, raiz: THREE.Object3D, capacidade: number): ModeloInstanciado {
    raiz.updateWorldMatrix(true, true);
    const inversoDaRaiz = raiz.matrixWorld.clone().invert();
    const relativo = new THREE.Matrix4();

    // Agrupar por material é o que decide a contagem final de draw calls.
    const porMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    raiz.traverse((o) => {
      const malha = o as THREE.Mesh;
      if (!malha.isMesh) return;
      const geo = malha.geometry.clone();
      geo.applyMatrix4(relativo.multiplyMatrices(inversoDaRaiz, malha.matrixWorld));
      const material = Array.isArray(malha.material) ? malha.material[0]! : malha.material;
      const lista = porMaterial.get(material);
      if (lista) lista.push(geo);
      else porMaterial.set(material, [geo]);
    });

    const pares = [...porMaterial].map(([material, geos]) => ({
      material,
      geometria: geos.length === 1 ? geos[0]! : mergeGeometries(geos, false)!,
    }));
    return new ModeloInstanciado(scene, pares, capacidade);
  }

  /** Caso simples: uma geometria e um material, sem hierarquia. */
  static deGeometria(
    scene: THREE.Scene, geometria: THREE.BufferGeometry, material: THREE.Material, capacidade: number,
  ): ModeloInstanciado {
    return new ModeloInstanciado(scene, [{ geometria, material }], capacidade);
  }

  /** Posiciona a instância `i`. A mesma matriz vai para todos os materiais. */
  setMatrixAt(i: number, matriz: THREE.Matrix4): void {
    for (const malha of this.malhas) malha.setMatrixAt(i, matriz);
  }

  /**
   * Define quantas instâncias desenhar. Chamar isto ao fim de cada passo de
   * escrita é o que faz as vagas mortas do pool sumirem da tela — é o
   * equivalente do antigo `mesh.visible = false`, mas para o lote inteiro.
   */
  setCount(n: number): void {
    for (const malha of this.malhas) {
      malha.count = n;
      malha.instanceMatrix.needsUpdate = true;
    }
  }
}
