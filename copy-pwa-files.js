#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const sourceDir = 'public';
const targetDir = 'client/public';

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
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✓ Copied ${file}`);
  }
});

console.log('PWA files copied successfully!');
