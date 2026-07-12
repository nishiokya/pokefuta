const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcRoot = path.join(root, 'src');

const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
}

walk(srcRoot);

const violations = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const pattern = /\.from\(['"]app_user['"]\)(?:(?!\.from\()[\s\S])*?\.select\((['"`])(?:(?!\1)[\s\S])*\bdisplay_name\b(?:(?!\1)[\s\S])*\1(?:\s*,[\s\S]*?)?\)/g;
  let match;
  while ((match = pattern.exec(source))) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${path.relative(root, file)}:${line}`);
  }
}

if (violations.length > 0) {
  console.error(
    [
      'Do not SELECT display_name directly from app_user.',
      'Use loadPublicDisplayNameMap/get_public_display_names for public display names instead.',
      ...violations,
    ].join('\n')
  );
  process.exit(1);
}
