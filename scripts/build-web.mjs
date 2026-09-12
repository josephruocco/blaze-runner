import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const files = [
  'index.html',
  'game.js',
  'changelog.js',
  'leaderboard.js',
  'news.html',
  'phaser.min.js',
  'cover.png'
];
const directories = ['assets'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map(file => cp(resolve(root, file), resolve(output, file))));
await Promise.all(directories.map(directory => cp(
  resolve(root, directory),
  resolve(output, directory),
  { recursive: true }
)));

console.log(`Built ${files.length} web files and ${directories.length} asset directory in dist/`);
