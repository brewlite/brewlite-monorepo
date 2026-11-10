const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const unix = p => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase());
const sha = 'a'.repeat(40);
function run(scenario, approved = 'false') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brewlite-release-test-'));
  fs.mkdirSync(path.join(dir, 'deploy'), {recursive:true});
  fs.mkdirSync(path.join(dir, 'bin'));
  const incoming = path.join(dir, '.incoming', sha); fs.mkdirSync(incoming, {recursive:true});
  fs.writeFileSync(path.join(dir, 'deploy/.env.production'), 'TEST_ONLY=true\n');
  fs.writeFileSync(path.join(dir, 'compose.prod.yml'), 'services: {}\n');
  fs.writeFileSync(path.join(incoming, 'compose.prod.yml'), 'services: {}\n');
  fs.writeFileSync(path.join(incoming, 'smoke.mjs'), '// test orchestration only\n');
  const log = path.join(dir, 'docker.log');
  fs.writeFileSync(path.join(dir,'bin/docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$TEST_LOG"
if [[ "$*" == *"--format {{.Image}}"* ]]; then echo 'sha256:previous'; exit 0; fi
if [[ "$*" == *"Health.Status"* ]]; then echo healthy; exit 0; fi
if [[ "$*" == *"migrate status"* && "$SCENARIO" == migration* ]]; then exit 1; fi
if [[ "$*" == *"migrate deploy"* && "$SCENARIO" == migration-fail ]]; then exit 1; fi
if [[ "$*" == *"pg_dump"* ]]; then printf 'fixture-archive'; exit 0; fi
if [[ "$*" == *"pg_restore"* ]]; then cat >/dev/null; exit 0; fi
if [[ "$*" == *"up -d --no-deps api web"* && "$SCENARIO" == deploy-fail ]]; then
  [[ "$API_IMAGE" == sha256:previous ]] && exit 0
  exit 1
fi
if [[ "$1" == exec && "$*" == *"--input-type=module"* ]]; then cat >/dev/null; fi
exit 0
`, {mode:0o755});
  const command = `export PATH="${unix(path.join(dir,'bin'))}:$PATH"; bash "${unix(path.resolve('deploy/release.sh'))}" '${sha}' ghcr.io/test/brewlite '${approved}'`;
  const r=spawnSync(bash,['-c',command], {encoding:'utf8',env:{...process.env,BREWLITE_DEPLOY_DIR:unix(dir),TEST_LOG:unix(log),SCENARIO:scenario}});
  return {r,log:fs.existsSync(log)?fs.readFileSync(log,'utf8'):'',dir};
}
test('release backs up before deployment and records successful SHA',()=>{const {r,log,dir}=run('success');assert.equal(r.status,0,r.stderr+r.stdout);assert.ok(log.indexOf('pg_dump') < log.indexOf('up -d'));assert.equal(fs.readFileSync(path.join(dir,'deploy/releases/current'),'utf8').trim(),sha);});
test('pending migration without approval does not stop/update applications',()=>{const {r,log}=run('migration');assert.equal(r.status,3);assert.ok(!log.includes('stop api web'));assert.ok(!log.includes('migrate deploy'));assert.ok(!log.includes('up -d'));});
test('failed application release rolls back images if no migration ran',()=>{const {r,log}=run('deploy-fail');assert.notEqual(r.status,0);assert.equal(log.split('up -d --no-deps api web').length-1,2);assert.match(r.stdout,/restoring previous/);});
test('failed migration never rolls back to potentially incompatible images',()=>{const {r,log}=run('migration-fail','true');assert.notEqual(r.status,0);assert.match(r.stdout,/rollback blocked/);assert.ok(!log.includes('up -d'));assert.ok(log.indexOf('pg_dump')<log.indexOf('stop api web'));});
