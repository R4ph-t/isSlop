#!/usr/bin/env node
// Bump manifest version (semver) and/or zip a Chrome Web Store package.
//
//   npm run release              zip current version
//   npm run release:patch|minor|major
//
// Chrome only accepts x.y.z integers in the manifest. No -beta suffixes.
// Does not commit or tag. After a bump: commit, then git tag vX.Y.Z

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const kind = (process.argv[2] || '').toLowerCase();

// Extra files that are not named in the manifest (licenses, panel inject).
const EXTRA_FILES = [
  'panel.js',
  'content.js',
  'fonts/OFL-Manrope.txt',
  'fonts/OFL-JetBrains-Mono.txt',
  'LICENSE'
];

function addPath(paths, p) {
  if (typeof p === 'string' && p) paths.add(p);
}

function addPathMap(paths, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  Object.keys(obj).forEach(function (k) { addPath(paths, obj[k]); });
}

function manifestPaths(manifest) {
  const paths = new Set(['manifest.json']);
  addPath(paths, manifest.background && manifest.background.service_worker);
  addPath(paths, manifest.action && manifest.action.default_popup);
  addPathMap(paths, manifest.action && manifest.action.default_icon);
  addPathMap(paths, manifest.icons);
  (manifest.content_scripts || []).forEach(function (cs) {
    (cs.js || []).forEach(function (f) { addPath(paths, f); });
    (cs.css || []).forEach(function (f) { addPath(paths, f); });
  });
  (manifest.web_accessible_resources || []).forEach(function (war) {
    (war.resources || []).forEach(function (f) { addPath(paths, f); });
  });
  return Array.from(paths);
}

function parseVer(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) throw new Error('manifest version must be x.y.z, got ' + JSON.stringify(s));
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function fmt(v) {
  return v.major + '.' + v.minor + '.' + v.patch;
}

function bumpVer(v, how) {
  if (how === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
  if (how === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 };
  if (how === 'patch') return { major: v.major, minor: v.minor, patch: v.patch + 1 };
  throw new Error('unknown bump ' + how);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

function packZip(verStr) {
  run('npm', ['test']);
  run('npx', ['tsc', '--noEmit']);
  run('npm', ['run', 'build']);

  const dist = path.join(root, 'dist');
  const distManifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
  const files = Array.from(new Set(manifestPaths(distManifest).concat(EXTRA_FILES)));
  const missing = files.filter(function (f) {
    return !fs.existsSync(path.join(dist, f));
  });
  if (missing.length) throw new Error('missing built files: ' + missing.join(', '));

  // Zip lives in release/, not dist/. `npm run build` rmSyncs dist/ every time.
  const outDir = path.join(root, 'release');
  fs.mkdirSync(outDir, { recursive: true });
  const zipName = 'islop-' + verStr + '.zip';
  const zipPath = path.join(outDir, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const zipped = spawnSync('zip', ['-q', '-X', zipPath].concat(files), {
    cwd: dist,
    stdio: 'inherit'
  });
  if (zipped.status !== 0) process.exit(zipped.status || 1);

  const listing = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
  const names = listing.stdout || '';
  const missingFromZip = files.filter(function (f) {
    return names.indexOf(f) === -1;
  });
  if (missingFromZip.length) {
    throw new Error('zip is missing: ' + missingFromZip.join(', '));
  }
  if (/\btest\b/.test(names) || names.indexOf('.git/') !== -1 || names.indexOf('src/') !== -1) {
    throw new Error('zip contains files that should not ship');
  }

  const bytes = fs.statSync(zipPath).size;
  process.stdout.write(zipPath + '  (' + bytes + ' bytes)\n');
  return zipPath;
}

if (['pack', 'patch', 'minor', 'major'].indexOf(kind) === -1) {
  process.stderr.write(
    'Usage:\n' +
    '  npm run release\n' +
    '  npm run release:patch|minor|major\n'
  );
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let verStr = manifest.version;

if (kind !== 'pack') {
  const next = fmt(bumpVer(parseVer(verStr), kind));
  manifest.version = next;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  verStr = next;
  process.stdout.write('manifest version -> ' + verStr + '\n');
}

packZip(verStr);

if (kind !== 'pack') {
  process.stdout.write(
    '\nCommit the manifest bump, then:\n' +
    '  git tag v' + verStr + '\n' +
    '  git push && git push --tags\n'
  );
}
