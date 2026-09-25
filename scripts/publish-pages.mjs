import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(projectRoot, 'dist');
const uploadDirectory = path.join(projectRoot, 'github-pages-upload');
const generatedRootFiles = ['index.html', 'logo.png', 'icon.ico', '.nojekyll'];

await mkdir(projectRoot, { recursive: true });
await rm(uploadDirectory, { recursive: true, force: true });
await cp(distDirectory, uploadDirectory, { recursive: true, force: true });
await rm(path.join(projectRoot, 'assets'), { recursive: true, force: true });

for (const fileName of generatedRootFiles) {
  await rm(path.join(projectRoot, fileName), { force: true });
}

await cp(distDirectory, projectRoot, { recursive: true, force: true });
await writeFile(path.join(projectRoot, '.nojekyll'), '', 'utf8');

console.log('GitHub Pages files published to the repository root and github-pages-upload/.');