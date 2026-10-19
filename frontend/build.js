import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

await build({
  entryPoints: ['frontend/detect-worker.js'],
  bundle: true,
  minify: true,
  legalComments: 'eof',
  banner: { js: '/*! Highlight.js\n' + await readFile('node_modules/highlight.js/LICENSE', 'utf8') + '\n*/' },
  outfile: 'crates/wastebin_server/src/javascript/detect-worker.js',
});
