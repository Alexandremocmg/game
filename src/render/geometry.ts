import * as THREE from 'three';

/**
 * Pinta uma geometria inteira com uma cor por vértice.
 *
 * Usar cor de vértice em vez de um material por cor permite fundir todas as
 * peças de um chunk numa única geometria com um único material — 1 draw call
 * por chunk em vez de um por peça.
 *
 * `THREE.Color` já converte de sRGB para o espaço linear de trabalho, que é
 * exatamente o que o atributo `color` espera.
 */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const count = geo.attributes.position!.count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    data[i * 3] = c.r;
    data[i * 3 + 1] = c.g;
    data[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}

/** Caixa já posicionada e pintada, pronta para ser fundida. */
export function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return paint(geo, color);
}

/**
 * Céu em gradiente vertical, gerado em canvas — evita carregar textura de disco.
 *
 * Devolve a textura junto de um `redesenhar`, em vez de uma textura pronta:
 * durante a transição entre temas as cores mudam a cada frame, e criar uma
 * `CanvasTexture` nova a cada vez geraria churn de GPU. Aqui o canvas e a
 * textura são os mesmos do começo ao fim; só o conteúdo é reescrito.
 */
export function makeSkyGradient(top: number, horizon: number): {
  texture: THREE.Texture;
  redesenhar: (top: number, horizon: number) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  function redesenhar(corTopo: number, corHorizonte: number): void {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0.0, hex(corTopo));
    grad.addColorStop(0.55, mix(corTopo, corHorizonte, 0.45));
    grad.addColorStop(0.85, hex(corHorizonte));
    grad.addColorStop(1.0, hex(corHorizonte));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
  }

  redesenhar(top, horizon);
  return { texture, redesenhar };
}

/**
 * Sombra do jogador como decalque radial.
 * Um shadow map real custaria um passe de render inteiro para uma sombra que,
 * nesta câmera, aparece como uma mancha sob os pés.
 */
export function makeBlobShadowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hex(v: number): string {
  return '#' + v.toString(16).padStart(6, '0');
}

function mix(a: number, b: number, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, t).getHexString();
}
