import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url));
const target = fileURLToPath(new URL('../public/mediapipe/wasm/', import.meta.url));

await mkdir(target, { recursive: true });
// Remove only files inside this fixed asset directory, preserving Git's marker.
for (const entry of await readdir(target, { withFileTypes: true })) {
  if (entry.isFile() && entry.name !== '.gitkeep') {
    await rm(join(target, entry.name));
  }
}
await cp(source, target, { recursive: true });
console.log('MediaPipe WASM assets synchronized.');
