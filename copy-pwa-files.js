#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const sourceDir = 'public';
const targetDir = 'client/public';

// Read app version from source JSON
const versionData = JSON.parse(fs.readFileSync(path.join('client', 'src', 'version.json'), 'utf8'));
const appVersion = versionData.version;

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Create .well-known directory
const wellKnownDir = path.join(targetDir, '.well-known');
if (!fs.existsSync(wellKnownDir)) {
  fs.mkdirSync(wellKnownDir, { recursive: true });
}

// Copy PWA files
const filesToCopy = ['manifest.json', 'sw.js', '.well-known/assetlinks.json'];

// Copy all icon files
const iconFiles = fs
  .readdirSync(sourceDir)
  .filter((file) => file.startsWith('icon-') && file.endsWith('.png'));
filesToCopy.push(...iconFiles);

console.log('Copying PWA files to client/public...');

filesToCopy.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (fs.existsSync(sourcePath)) {
    if (file === 'sw.js') {
      let content = fs.readFileSync(sourcePath, 'utf8');
      content = content.replace(/__APP_VERSION__/g, appVersion);
      fs.writeFileSync(targetPath, content);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
    console.log(`✓ Copied ${file}`);
  }
});

// Copy version.json from client source to target
fs.copyFileSync(path.join('client', 'src', 'version.json'), path.join(targetDir, 'version.json'));
console.log('✓ Copied version.json');

console.log('PWA files copied successfully!');
