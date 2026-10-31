// Builds the React website in ../frontend and copies it into ./web-build,
// which the desktop app serves from its own app:// origin.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(desktopDir, '..', 'frontend');
const outDir = path.join(desktopDir, 'web-build');
const config = JSON.parse(fs.readFileSync(path.join(desktopDir, 'config.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (args) => {
  console.log(`\n> ${npm} ${args.join(' ')}  (in ${frontendDir})`);
  const res = spawnSync(npm, args, {
    cwd: frontendDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      REACT_APP_BACKEND_URL: process.env.REACT_APP_BACKEND_URL || config.apiUrl,
      GENERATE_SOURCEMAP: 'false',
      CI: 'false', // don't fail the build on lint warnings
      PUBLIC_URL: '/',
    },
  });
  if (res.status !== 0) {
    console.error(`\nCommand failed: ${npm} ${args.join(' ')}`);
    process.exit(res.status || 1);
  }
};

if (!fs.existsSync(path.join(frontendDir, 'package.json'))) {
  console.error(`Could not find the website at ${frontendDir}`);
  process.exit(1);
}
if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) run(['install', '--legacy-peer-deps']);
run(['run', 'build']);

fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(path.join(frontendDir, 'build'), outDir, { recursive: true });
console.log(`\n✔ Website copied to ${outDir}`);
