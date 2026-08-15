import * as THREE from 'three';
import {
  CAMERA_FOV, CAMERA_LOOK, CAMERA_POS,
  COLOR_FOG, COLOR_SKY_HORIZON, COLOR_SKY_TOP,
  FOG_FAR, FOG_NEAR,
} from '../config';
import { makeSkyTexture } from './geometry';

/** Cena, câmera, luzes e renderer. Não sabe nada sobre regras do jogo. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

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

    this.scene.background = makeSkyTexture(COLOR_SKY_TOP, COLOR_SKY_HORIZON);
    // Fog na cor do horizonte: é o que esconde o surgimento dos chunks distantes.
    this.scene.fog = new THREE.Fog(COLOR_FOG, FOG_NEAR, FOG_FAR);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 400);
    this.camera.position.set(...CAMERA_POS);
    this.camera.lookAt(...CAMERA_LOOK);

    const sun = new THREE.DirectionalLight(0xfff1de, 2.1);
    sun.position.set(-6, 12, 4);
    this.scene.add(sun);

    const sky = new THREE.HemisphereLight(COLOR_SKY_TOP, 0x50463c, 1.15);
    this.scene.add(sky);

    this.resize();
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
