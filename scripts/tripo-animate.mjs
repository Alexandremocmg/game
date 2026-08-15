/**
 * Pipeline de animação do personagem via API do Tripo (v3).
 *
 * Fluxo: auto-rig da malha estática -> retarget com vários presets numa única
 * requisição -> download de um GLB único com todos os clipes.
 *
 * Por que existe: o player.glb original trazia UM só clipe (`preset:run`) e com
 * root motion embutido, o que obrigava a inclinar/esticar o modelo por código
 * para simular pulo e rolamento, e a zerar as tracks de translação na mão.
 * `animations[]` + `animate_in_place` resolvem os dois na origem.
 *
 * Uso:
 *   node scripts/tripo-animate.mjs <URL_PUBLICA_DA_MALHA_ESTATICA>
 *
 * A chave vem de TRIPO_API_KEY no .env (nunca é impressa).
 * Custo: auto-rig 25 créditos + 10 por animação.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://openapi.tripo3d.ai/v3';
/** Saída por versão de rig, para dar para comparar os resultados sem sobrescrever. */
const outFileFor = (rig) => resolve(ROOT, `public/models/player_anim_${rig.split('-')[0].replace(/\./g, '')}.glb`);

/**
 * Cada versão de rig tem sua própria nomenclatura de preset e sua própria
 * qualidade de retarget. O v1.0 (nomes longos) produziu animações com o torso
 * dobrado ~90° neste personagem; o v2.5 (nomes curtos) é o que o web app do
 * Tripo usa e gerou uma corrida correta. Selecionável por CLI para dar para
 * comparar sem editar o arquivo.
 */
const RIG_PRESETS = {
  'v2.5-20260210': ['preset:run', 'preset:jump', 'preset:dive', 'preset:fall', 'preset:idle'],
  'v1.0-20240301': [
    'preset:biped:run', 'preset:biped:jump', 'preset:biped:dive',
    'preset:biped:fall', 'preset:biped:idle',
  ],
};
const RIG_MODEL = process.argv.find((a) => a.startsWith('--rig='))?.slice('--rig='.length)
  ?? 'v2.5-20260210';
const ANIMATIONS = RIG_PRESETS[RIG_MODEL];
if (!ANIMATIONS) throw new Error(`rig desconhecido: ${RIG_MODEL}`);

function loadApiKey() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) throw new Error('.env não encontrado');
  // tolera espaços em volta do "=" e aspas, formatos comuns em .env editado à mão
  const match = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*TRIPO_API_KEY\s*=\s*(.*)$/))
    .find(Boolean);
  const key = match?.[1].trim().replace(/^['"]|['"]$/g, '');
  if (!key || /^(sua|your|placeholder|xxx)/i.test(key)) {
    throw new Error('TRIPO_API_KEY ainda está com valor placeholder no .env');
  }
  return key;
}

const KEY = loadApiKey();
const authHeaders = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ raw: 'resposta não-JSON' }));
  if (!res.ok || json.code !== 0) {
    throw new Error(`POST ${path} falhou (HTTP ${res.status}): ${JSON.stringify(json)}`);
  }
  return json.data;
}

/** Espera a tarefa terminar. URLs de download expiram em ~5 min, então baixamos logo em seguida. */
async function waitTask(taskId, label) {
  let delay = 2000;
  for (let attempt = 0; attempt < 300; attempt++) {
    const res = await fetch(`${BASE}/tasks/${taskId}`, { headers: authHeaders });
    const json = await res.json();
    if (json.code !== 0) throw new Error(`consulta da tarefa falhou: ${JSON.stringify(json)}`);

    const { status, progress, output } = json.data;
    if (status === 'success') {
      console.log(`  ${label}: concluído`);
      return output;
    }
    if (['failed', 'cancelled', 'banned', 'expired'].includes(status)) {
      throw new Error(`${label} terminou como "${status}": ${JSON.stringify(json.data)}`);
    }
    process.stdout.write(`\r  ${label}: ${status} ${progress ?? 0}%   `);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.3, 15000);
  }
  throw new Error(`${label}: tempo esgotado`);
}

async function main() {
  const meshUrl = process.argv[2];
  if (!meshUrl) throw new Error('faltou a URL pública da malha estática');

  console.log(`1/3  auto-rig com ${RIG_MODEL} (25 créditos)…`);
  const rig = await post('/animations/rig', {
    input: meshUrl,
    model: RIG_MODEL,
    rig_type: 'biped',
    spec: 'tripo',
    out_format: 'glb',
  });
  const rigTaskId = rig.task_id;
  await waitTask(rigTaskId, 'rig');

  console.log(`2/3  retarget de ${ANIMATIONS.length} animações (10 créditos cada)…`);
  const retarget = await post('/animations/retarget', {
    input: rigTaskId,
    animations: ANIMATIONS,
    animate_in_place: true, // mata o root motion na origem
    bake_animation: true,
    export_with_geometry: true,
    out_format: 'glb',
  });
  const output = await waitTask(retarget.task_id, 'retarget');

  const modelUrl = output.model_url ?? output.model ?? output.pbr_model;
  if (!modelUrl) throw new Error(`sem URL de modelo na saída: ${JSON.stringify(output)}`);

  console.log('3/3  baixando…');
  const outFile = outFileFor(RIG_MODEL);
  const bin = Buffer.from(await (await fetch(modelUrl)).arrayBuffer());
  writeFileSync(outFile, bin);
  console.log(`pronto: ${outFile} (${(bin.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
