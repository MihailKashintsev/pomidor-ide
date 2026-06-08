const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });

const name = `pomidor-ide-source-${Date.now()}.zip`;
const out = path.join(outDir, name);

if (process.platform === 'win32') {
  execSync(`powershell Compress-Archive -Path * -DestinationPath "${out}" -Force`, { cwd: root, stdio: 'inherit' });
} else {
  execSync(`zip -r "${out}" . -x "node_modules/*" "dist/*" "release/*" ".git/*"`, { cwd: root, stdio: 'inherit' });
}
console.log(out);
