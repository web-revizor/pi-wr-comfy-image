// Compares how a real model uses the tools with and without the comfy-image skill.
// Local only. Needs ComfyUI and an OpenAI-compatible server (default: the local
// aggregator). Packs the tarball, runs pi from isolated agent dirs and writes the
// calls of every run to test-results/skill-eval/<model>.json. Generates real images.
// Modes: with_skill (advertised only), forced (/skill:comfy-image), without.
// Usage: node scripts/eval-skill.mjs <model id> [repeats=2] [task|all] [modes]
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [model, repeats = '2', only = 'all', modeArg] = process.argv.slice(2);
const modes = modeArg?.split(',');
if (!model)
  throw new Error('usage: eval-skill.mjs <model id> [repeats] [task]');
const baseUrl = process.env.EVAL_BASE_URL ?? 'http://127.0.0.1:4000/v1';
const pi = path.join(os.homedir(), '.pi/agent/bin/pi-launcher.js');

const tasks = {
  style: 'Згенеруй акварельну картинку маяка на скелі.',
  edit: 'Зроби це фото зимовим, із снігом: photo.png',
  bad_value:
    'Згенеруй лисицю через pi-wr-comfy-image/qwen21_t2i у співвідношенні сторін 7:5.',
  missing: 'Намалюй кота через pi-wr-comfy-image/flux2_klein_t2i.',
  cat: 'Намалюй рудого кота на підвіконні.',
  raincoat: 'Одягни цього чоловіка в жовтий дощовик: photo.png',
};

const work = mkdtempSync(path.join(os.tmpdir(), 'pi-skill-eval-'));
const emptyHome = path.join(work, 'home');
mkdirSync(emptyHome);
const imagesOut = path.resolve('test-results/skill-eval/images');
mkdirSync(imagesOut, { recursive: true });

function prepare() {
  const tgz = execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--silent', '--pack-destination', work],
    { encoding: 'utf8', shell: true },
  )
    .trim()
    .split('\n')
    .at(-1);
  mkdirSync(path.join(work, 'pkg'));
  const slash = (p) => p.replaceAll('\\', '/');
  execFileSync('tar', [
    '--force-local',
    '-xzf',
    slash(path.join(work, tgz)),
    '-C',
    slash(path.join(work, 'pkg')),
  ]);
  const source = path.join(work, 'pkg/package').replaceAll('\\', '/');
  const agent = (name, pkg) => {
    const dir = path.join(work, name);
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, 'models.json'),
      JSON.stringify({
        providers: {
          evalp: {
            baseUrl,
            api: 'openai-completions',
            apiKey: 'wr',
            models: [{ id: model, contextWindow: 100000, maxTokens: 4000 }],
          },
        },
      }),
    );
    writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ packages: [pkg] }),
    );
    return dir;
  };
  const with_ = agent('with', source);
  return {
    with_skill: with_,
    forced: with_,
    without: agent('without', { source, skills: [] }),
    simple: agent('simple', { source, skills: [] }),
  };
}

function runOnce(agentDir, task, mode, label) {
  const cwd = mkdtempSync(path.join(work, 'cwd-'));
  copyFileSync(
    path.resolve(process.env.EVAL_PHOTO ?? 'scripts/custom-apps/input.png'),
    path.join(cwd, 'photo.png'),
  );
  const started = Date.now();
  const r = spawnSync(
    process.execPath,
    [
      pi,
      '--mode',
      'json',
      '-p',
      // An unknown model must not get to run commands on this machine.
      '--tools',
      mode === 'simple'
        ? 'read,generate_image'
        : 'read,comfy_workflow_inputs,comfy_generate',
      '--model',
      `evalp/${model}`,
      task,
    ],
    {
      cwd,
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 256 * 1024 * 1024,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_OFFLINE: '1',
        // Simple mode uses the real plugin config; the full tools must not see its `simple` block.
        ...(mode === 'simple'
          ? {}
          : { USERPROFILE: emptyHome, HOME: emptyHome }),
      },
    },
  );
  if (r.error && r.error.code !== 'ETIMEDOUT') throw r.error;
  const calls = [];
  const byId = new Map();
  let answer = '';
  for (const line of (r.stdout ?? '').split('\n')) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === 'tool_execution_start') {
      const call = { tool: e.toolName, args: e.args };
      byId.set(e.toolCallId, call);
      calls.push(call);
    } else if (e.type === 'tool_execution_end') {
      const call = byId.get(e.toolCallId);
      if (call) {
        call.isError = e.isError;
        call.result = (e.result?.content ?? [])
          .map((p) => p.text ?? '')
          .join('')
          .slice(0, 300);
      }
    } else if (e.type === 'message_end' && e.message?.role === 'assistant') {
      const text = (e.message.content ?? []).map((p) => p.text ?? '').join('');
      if (text) answer = text;
    }
  }
  // A run that saved nothing has no folder to list.
  const imageDir = path.join(cwd, '.pi/images');
  const saved = existsSync(imageDir) ? readdirSync(imageDir) : [];
  const images = saved.length;
  saved.forEach((f, i) =>
    copyFileSync(
      path.join(imageDir, f),
      path.join(imagesOut, `${label}-${i}.png`),
    ),
  );
  return {
    exit: r.status,
    seconds: Math.round((Date.now() - started) / 1000),
    calls,
    answer: answer.slice(0, 500),
    images,
    stderr: (r.stderr ?? '').slice(-300),
  };
}

const out = path.resolve('test-results/skill-eval');
mkdirSync(out, { recursive: true });
const report = [];
try {
  const agents = prepare();
  for (const [name, task] of Object.entries(tasks)) {
    if (only !== 'all' && name !== only) continue;
    for (let n = 0; n < Number(repeats); n++) {
      for (const [mode, dir] of Object.entries(agents)) {
        if (modes && !modes.includes(mode)) continue;
        const prompt = mode === 'forced' ? `/skill:comfy-image ${task}` : task;
        const r = runOnce(dir, prompt, mode, `${name}-${mode}-${n + 1}`);
        report.push({ task: name, mode, run: n + 1, ...r });
        const gens = r.calls.filter((c) => c.tool === 'comfy_generate');
        const read = r.calls.some((c) =>
          JSON.stringify(c.args ?? '').includes('SKILL.md'),
        );
        console.log(
          `${name} ${mode} #${n + 1}: exit=${r.exit} ${r.seconds}s calls=${r.calls.length} gen=${gens.length} errors=${r.calls.filter((c) => c.isError).length} images=${r.images} skillRead=${read}`,
        );
      }
    }
  }
} finally {
  writeFileSync(
    path.join(
      out,
      `${model.replaceAll(/[/:]/g, '_')}${modes ? `-${modes.join('+')}` : ''}.json`,
    ),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  rmSync(work, { recursive: true, force: true });
}
