// npm test：套用本機資料庫變更 → 啟動本機測試伺服器 → 執行 tests/*.test.mjs → 關閉伺服器。
// 只使用本機資料庫（.wrangler 資料夾），不會動到正式網站。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(root, 'tests');
const PORT = 8790; // 避開平常開發用的 8787
const BASE = `http://localhost:${PORT}`;
const logFile = path.join(root, '.wrangler', 'test-server.log');

// 指令以單一字串交給系統 shell 執行（Windows 需要透過 shell 才找得到 npx）
function run(command) {
  return spawnSync(command, { cwd: root, shell: true, encoding: 'utf8' });
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  // Windows 需要連同子程序一起結束，否則 wrangler 會留在背景
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function waitForServer(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/me`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`測試伺服器在 ${timeoutMs / 1000} 秒內沒有啟動，請看 ${logFile}`);
}

console.log('1/3 套用本機資料庫變更…');
const migrate = run('npx wrangler d1 migrations apply school-schedule --local');
if (migrate.status !== 0) {
  console.error(migrate.stdout, migrate.stderr);
  process.exit(1);
}

console.log(`2/3 啟動本機測試伺服器（port ${PORT}）…`);
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const log = fs.openSync(logFile, 'w');
const server = spawn(`npx wrangler dev --port ${PORT}`, {
  cwd: root,
  shell: true,
  stdio: ['ignore', log, log],
});
process.on('exit', () => stopServer(server));
process.on('SIGINT', () => process.exit(130));

let failed = 0;
try {
  await waitForServer();
  console.log('3/3 執行測試');
  const files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs')).sort();
  for (const file of files) {
    const res = spawnSync(process.execPath, [path.join(testsDir, file)], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TEST_BASE: BASE },
    });
    const lines = (res.stdout || '').trim().split('\n');
    const summary = lines.at(-1) || '（沒有輸出）';
    const ok = res.status === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${file.padEnd(24)} ${summary}`);
    if (!ok) {
      for (const l of lines.slice(0, -1)) console.log(`      ${l}`);
      if (res.stderr) console.log(res.stderr.replace(/^/gm, '      '));
    }
  }
  console.log(failed ? `\n有 ${failed} 個測試檔失敗。` : '\n全部通過。');
} catch (err) {
  console.error(err.message);
  failed = 1;
} finally {
  stopServer(server);
}
process.exitCode = failed ? 1 : 0;
