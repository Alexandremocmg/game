import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_LOOK, CAMERA_POS } from '../config';
import { TEMAS, type Tema } from '../world/themes';
import { makeSkyGradient } from './geometry';

/** Cena, câmera, luzes e renderer. Não sabe nada sobre regras do jogo. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly ceu: ReturnType<typeof makeSkyGradient>;
  private readonly fog: THREE.Fog;
  private readonly sol: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;

  /** Último tema desenhado no céu; `null` enquanto há mistura em andamento. */
  private temaAplicado: Tema | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const inicial = TEMAS[0]!;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // Em tela de alta densidade o próprio DPR já resolve o serrilhado;
      // MSAA ali só queima bateria.
      antialias: dpr < 1.5,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // O EffectComposer (M6) faz várias chamadas internas de render() por
    // frame; com autoReset, `info.render` só sobra com a última (o quad de
    // pós-processamento). Reset manual em Game.render() soma o frame inteiro.
    this.renderer.info.autoReset = false;
    this.renderer.toneMappingExposure = 1.05;

    this.ceu = makeSkyGradient(inicial.ceuTopo, inicial.ceuHorizonte);
    this.scene.background = this.ceu.texture;

    // Névoa na cor do horizonte: é o que esconde o surgimento dos chunks distantes.
    this.fog = new THREE.Fog(inicial.fog, inicial.fogNear, inicial.fogFar);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 400);
    this.camera.position.set(...CAMERA_POS);
    this.camera.lookAt(...CAMERA_LOOK);

    this.sol = new THREE.DirectionalLight(inicial.sol, inicial.solIntensidade);
    this.sol.position.set(-6, 12, 4);
    this.scene.add(this.sol);

    this.hemi = new THREE.HemisphereLight(
      inicial.hemiCeu, inicial.hemiChao, inicial.hemiIntensidade,
    );
    this.scene.add(this.hemi);

    this.resize();
  }

  /**
   * Aplica a mistura entre dois temas. Chamado a cada passo com o `t` vindo
   * de `temaEmDistancia`; fora da transição `a` e `b` são o mesmo tema e `t`
   * é 0, então isto vira uma reaplicação barata dos mesmos valores.
   *
   * O céu só é redesenhado quando há mistura de fato: repintar o canvas todo
   * frame durante os ~90% do tempo em que o tema está estável seria trabalho
   * jogado fora.
   */
  aplicarTema(a: Tema, b: Tema, t: number): void {
    const misturando = t > 0 && a !== b;

    if (misturando) {
      this.ceu.redesenhar(
        misturarHex(a.ceuTopo, b.ceuTopo, t),
        misturarHex(a.ceuHorizonte, b.ceuHorizonte, t),
        a.ceuDetalhe, b.ceuDetalhe, t,
      );
    } else if (this.temaAplicado !== a) {
      this.ceu.redesenhar(a.ceuTopo, a.ceuHorizonte, a.ceuDetalhe);
    }
    this.temaAplicado = misturando ? null : a;

    this.fog.color.setHex(misturarHex(a.fog, b.fog, t));
    this.fog.near = lerp(a.fogNear, b.fogNear, t);
    this.fog.far = lerp(a.fogFar, b.fogFar, t);

    this.sol.color.setHex(misturarHex(a.sol, b.sol, t));
    this.sol.intensity = lerp(a.solIntensidade, b.solIntensidade, t);

    this.hemi.color.setHex(misturarHex(a.hemiCeu, b.hemiCeu, t));
    this.hemi.groundColor.setHex(misturarHex(a.hemiChao, b.hemiChao, t));
    this.hemi.intensity = lerp(a.hemiIntensidade, b.hemiIntensidade, t);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Rascunhos de módulo: a mistura roda a cada frame de transição, e alocar
// `THREE.Color` no laço geraria exatamente o lixo que o resto do jogo evita.
const rascunhoA = new THREE.Color();
const rascunhoB = new THREE.Color();

/** Interpola duas cores hexadecimais sem alocar. */
function misturarHex(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  rascunhoA.setHex(a);
  rascunhoB.setHex(b);
  return rascunhoA.lerp(rascunhoB, t).getHex();
}
