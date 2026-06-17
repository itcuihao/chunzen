#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function runCmd(cmd, inheritStdio = false) {
  try {
    if (inheritStdio) {
      execSync(cmd, { stdio: 'inherit' });
      return true;
    } else {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    }
  } catch (e) {
    if (inheritStdio) {
      console.error(`❌ Error executing: ${cmd}`);
    }
    return null;
  }
}

async function main() {
  console.log('\n=========================================');
  console.log('       春蝉 (ChunZen) Release Helper     ');
  console.log('=========================================\n');

  // 1. Fetch tags to ensure up-to-date info
  console.log('🔄 Fetching tags from origin...');
  runCmd('git fetch --tags');

  // 2. Get latest git tag
  let latestTag = runCmd('git describe --tags --abbrev=0');
  if (!latestTag) {
    // Fallback: try sorting tags
    const tags = runCmd('git tag -l');
    if (tags) {
      const tagList = tags.split('\n').filter(Boolean);
      latestTag = tagList[tagList.length - 1];
    }
  }
  if (!latestTag) {
    latestTag = 'v0.0.0';
  }

  // 3. Get package.json version
  const packageJsonPath = path.join(__dirname, '../package.json');
  const packageLockJsonPath = path.join(__dirname, '../package-lock.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.error('❌ package.json not found!');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentPkgVersion = pkg.version;

  console.log(`📌 Last Git Tag         : \x1b[36m${latestTag}\x1b[0m`);
  console.log(`📌 package.json Version : \x1b[36m${currentPkgVersion}\x1b[0m\n`);

  // Parse latest tag for suggestions
  const cleanTag = latestTag.startsWith('v') ? latestTag.slice(1) : latestTag;
  const match = cleanTag.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  
  let patchVer = '0.0.1';
  let minorVer = '0.1.0';
  let majorVer = '1.0.0';

  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3], 10);
    const suffix = match[4] || '';
    
    patchVer = `${major}.${minor}.${patch + 1}${suffix}`;
    minorVer = `${major}.${minor + 1}.0`;
    majorVer = `${major + 1}.0.0`;
  }

  console.log('Select the next version:');
  console.log(`1) Patch (\x1b[32m${patchVer}\x1b[0m)  -- Recommended (bug fixes)`);
  console.log(`2) Minor (\x1b[32m${minorVer}\x1b[0m)  -- (new features, backward compatible)`);
  console.log(`3) Major (\x1b[32m${majorVer}\x1b[0m)  -- (breaking changes)`);
  console.log(`4) Keep current package.json (\x1b[32m${currentPkgVersion}\x1b[0m)`);
  console.log(`5) Custom version`);

  const choiceInput = await question('\nEnter choice [1-5] (default: 1): ');
  const choice = choiceInput.trim() || '1';

  let nextVersion = '';
  if (choice === '1') {
    nextVersion = patchVer;
  } else if (choice === '2') {
    nextVersion = minorVer;
  } else if (choice === '3') {
    nextVersion = majorVer;
  } else if (choice === '4') {
    nextVersion = currentPkgVersion;
  } else if (choice === '5') {
    nextVersion = await question('Enter custom version (e.g. 0.2.0): ');
    nextVersion = nextVersion.trim();
    if (!/^\d+\.\d+\.\d+/.test(nextVersion)) {
      console.error('❌ Invalid version format!');
      process.exit(1);
    }
  } else {
    console.error('❌ Invalid choice!');
    process.exit(1);
  }

  console.log(`\nSelected version: \x1b[33m${nextVersion}\x1b[0m`);

  // Update package.json and package-lock.json
  if (pkg.version !== nextVersion) {
    pkg.version = nextVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    
    if (fs.existsSync(packageLockJsonPath)) {
      try {
        const pkgLock = JSON.parse(fs.readFileSync(packageLockJsonPath, 'utf8'));
        pkgLock.version = nextVersion;
        // In package-lock.json v2/v3, packages[""].version must also be updated
        if (pkgLock.packages && pkgLock.packages['']) {
          pkgLock.packages[''].version = nextVersion;
        }
        fs.writeFileSync(packageLockJsonPath, JSON.stringify(pkgLock, null, 2) + '\n', 'utf8');
      } catch (e) {
        console.warn('⚠️ Warning: Failed to update package-lock.json version');
      }
    }
    console.log('✅ Updated package.json and package-lock.json versions.');
  } else {
    console.log('ℹ️ Version unchanged.');
  }

  // 4. Prompt to package/install locally
  const buildChoice = await question('\nBuild and install extension locally to test? (Y/n): ');
  if (buildChoice.trim().toLowerCase() !== 'n') {
    console.log('\n🔨 Running build local...');
    runCmd('bash scripts/build.sh local', true);
  }

  // 5. Prompt to create Git commit & tag
  const gitChoice = await question(`\nCreate Git commit and tag v${nextVersion}? (Y/n): `);
  if (gitChoice.trim().toLowerCase() !== 'n') {
    console.log('\n💾 Creating Git commit and tag...');
    runCmd('git add package.json package-lock.json');
    runCmd(`git commit -m "chore: bump version to v${nextVersion}"`, true);
    runCmd(`git tag -a v${nextVersion} -m "Release v${nextVersion}"`, true);
    console.log(`✅ Created Git tag v${nextVersion}.`);

    // 6. Prompt to push to remote
    const pushChoice = await question('\nPush commit and tag to origin? (Y/n): ');
    if (pushChoice.trim().toLowerCase() !== 'n') {
      console.log('\n🚀 Pushing to origin...');
      runCmd('git push', true);
      runCmd(`git push origin v${nextVersion}`, true);
      console.log('✅ Pushed successfully.');
    }
  }

  console.log('\n🎉 All done! Have a great release!\n');
  rl.close();
}

main().catch(err => {
  console.error('An error occurred:', err);
  rl.close();
  process.exit(1);
});
