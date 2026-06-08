const fs = require('fs');
const { execSync } = require('child_process');

const version = process.argv[2];

if (!version) {
  console.error('Usage: npm run release -- 0.1.0');
  process.exit(1);
}

const packagePath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

pkg.version = version;

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

run('git add .');
run(`git commit -m "Release Pomidor IDE ${version}"`);
run(`git tag v${version}`);
run('git push');
run(`git push origin v${version}`);

console.log(`Release tag v${version} pushed.`);
console.log('GitHub Actions should now build the release.');