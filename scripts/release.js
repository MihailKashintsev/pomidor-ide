const fs = require('fs');
const { execSync } = require('child_process');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run release -- 0.1.1');
  process.exit(1);
}

const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

run('git add package.json');
run(`git commit -m "Release v${version}"`);
run(`git tag v${version}`);
run('git push');
run(`git push origin v${version}`);

console.log(`Release v${version} pushed. GitHub Actions will build and publish the release.`);
