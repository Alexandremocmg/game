import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHUNK_LENGTH, TRACK_WIDTH } from '../config';
import { box, paint } from '../render/geometry';

const shops = [
  ['CAFÉ CONTRALUZ', '#ffac74', 0x44364c],
  ['DISCO VAGA-LUME', '#a6f4f1', 0x293d51],
  ['ÓTICA LUA NOVA', '#c6b0ff', 0x383853],
  ['PADARIA DA MEIA-NOITE', '#ffc689', 0x4c3d49],
  ['CINE MARÉ ALTA', '#92ebd0', 0x2c4351],
  ['OFICINA COMETA', '#f9a9cb', 0x48374a],
] as const;
const edge = TRACK_WIDTH / 2;
const atlasWidth = 512;
const slotHeight = 96;

/** Vitrines e reflexos seguem o mesmo chunk que pinta o asfalto noturno. */
export class NightStreet {
  private readonly variants: THREE.Group[];

  constructor() {
    const walls = new THREE.MeshLambertMaterial({ vertexColors: true });
    const signs = new THREE.MeshBasicMaterial({ map: makeAtlas(false) });
    const puddles = new THREE.MeshBasicMaterial({
      map: makeAtlas(true), transparent: true, depthWrite: false, opacity: .85,
    });
    this.variants = shops.filter((_, i) => i % 2 === 0).map((_, i) => {
      const block = new THREE.Group();
      const [buildings, names, reflections] = makeBlock(i * 2);
      block.add(mergeBatch(buildings, walls), mergeBatch(names, signs), mergeBatch(reflections, puddles));
      return block;
    });
  }

  createChunk(index: number): THREE.Group {
    const block = this.variants[index % this.variants.length]!.clone();
    block.visible = false;
    return block;
  }
}

function makeBlock(first: number): [THREE.BufferGeometry[], THREE.BufferGeometry[], THREE.BufferGeometry[]] {
  const buildings: THREE.BufferGeometry[] = [], names: THREE.BufferGeometry[] = [], reflections: THREE.BufferGeometry[] = [];
  const put = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) =>
    buildings.push(box(w, h, d, x, y, z, color));
  for (const side of [-1, 1]) {
    const index = first + (side === 1 ? 1 : 0);
    const [, glow, wall] = shops[index]!;
    const front = edge + 3.64;
    const shopZ = side * .8;
    put(3.3, .39, CHUNK_LENGTH, side * (edge + 2.16), -.09, 0, 0x5d6175);
    put(.13, .022, CHUNK_LENGTH, side * (edge + .67), .116, 0, 0x8786a9);
    for (let z = -10; z <= 10; z += 2) put(2.85, .013, .037, side * (edge + 2.12), .11, z, 0x4b4b6c);

    put(4.8, 5.75 + index * .2, 16.8, side * (front + 2.38), 2.76 + index * .1, shopZ, wall);
    put(.19, 2.6, 13.7, side * (front - .12), 1.53, shopZ, 0x18202c);
    for (const panel of [-1, 0, 1]) {
      const z = shopZ + panel * 4.1;
      put(.13, 1.77, 3.64, side * (front - .24), 1.47, z, panel === 0 ? 0x6a5662 : 0xb1836f);
      put(.16, .068, 3.7, side * (front - .32), 2.37, z, new THREE.Color(glow).getHex());
      put(.14, 1.8, .16, side * (front - .36), 1.48, z, 0x263148);
      put(.25, .16, 3.74, side * (front - .30), .51, z, 0x4e4960);
    }
    put(1.57, .14, 13.9, side * (front - .56), 3.04, shopZ, 0x343149);
    put(.23, .97, 6.55, side * (front - .33), 3.79, shopZ + 1.6, 0x292136);
    names.push(atlasPlane(6.4, .84, side * (front - .46), 3.79, shopZ + 1.6, index, -side * Math.PI / 2));

    const lamp = side * (edge + 1.53);
    put(.13, 4.4, .13, lamp, 2.37, 8.7, 0x323e58);
    put(1.41, .13, .17, lamp - side * .64, 4.50, 8.7, 0x323e58);
    put(.55, .07, .22, lamp - side * 1.15, 4.41, 8.7, 0xe4bda2);
    // Lâminas rasas próximas ao meio-fio. As marcas de faixa ficam acima delas.
    reflections.push(atlasPlane(1.87, 14, side * (edge - 1.02), .021, shopZ + 1.9, index, 0, true));
    reflections.push(atlasPlane(1.18, 7.7, side * (edge - 1.29), .022, shopZ - 7.1, index, 0, true));
  }
  return [buildings, names, reflections];
}

function mergeBatch(parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  return new THREE.Mesh(geometry, material);
}

function atlasPlane(
  width: number, height: number, x: number, y: number, z: number, index: number, yaw: number, ground = false,
): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(width, height);
  const uv = plane.attributes.uv!;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, .008 + uv.getX(i) * .984, 1 - (index + .02 + (1 - uv.getY(i)) * .96) / shops.length);
  }
  if (ground) plane.rotateX(-Math.PI / 2);
  else plane.rotateY(yaw);
  return plane.translate(x, y, z);
}

function makeAtlas(reflections: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = slotHeight * shops.length;
  const ctx = canvas.getContext('2d')!;
  for (const [i, [name, glow]] of shops.entries()) {
    const top = i * slotHeight;
    if (!reflections) {
      ctx.fillStyle = '#202237';
      ctx.fillRect(0, top, atlasWidth, slotHeight);
      ctx.strokeStyle = glow;
      ctx.lineWidth = 3;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 13;
      ctx.strokeRect(11, top + 10, atlasWidth - 22, slotHeight - 20);
      ctx.font = 'bold 29px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = glow;
      ctx.fillText(name, atlasWidth / 2, top + 48, atlasWidth - 57);
      ctx.shadowBlur = 0;
      continue;
    }
    for (let band = 0; band < 38; band++) {
      const spread = Math.sin(Math.PI * band / 38);
      const center = atlasWidth * (.47 + .07 * Math.sin(band * 1.9 + i));
      const radius = (80 + 91 * Math.sin(band * 2.37) ** 2) * spread;
      const light = ctx.createLinearGradient(center - radius, 0, center + radius, 0);
      light.addColorStop(0, glow + '00');
      light.addColorStop(.50, glow + Math.round(spread * (38 + 55 * Math.sin(band * 3.92) ** 2)).toString(16).padStart(2, '0'));
      light.addColorStop(1, glow + '00');
      ctx.fillStyle = light;
      ctx.fillRect(center - radius, top + 3 + band * 2.35, radius * 2, 1.8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
