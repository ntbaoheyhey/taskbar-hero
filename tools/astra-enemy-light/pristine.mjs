/** Serve the integration base for bitwise switch-off checks without changing checkouts. */
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
const root = resolve(import.meta.dirname, '../..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { createServer } = await import(require.resolve('vite'));
const ref = execFileSync('git', ['rev-parse', process.argv[2] ?? 'origin/main'], { cwd:root,encoding:'utf8' }).trim();
const paths = execFileSync('git',['diff','--name-only','--diff-filter=M',ref,'--','apps/web/src','packages'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const original = new Map(paths.map(path => [path,execFileSync('git',['show',ref+':'+path],{cwd:root,encoding:'utf8'})]));
const server = await createServer({ root:resolve(root,'apps/web'),
  cacheDir:resolve(root,'reports/astra-enemy-light/vite-pristine'),
  server:{ host:'127.0.0.1',port:Number(process.env.ENEMY_BASE_PORT ?? 6495),strictPort:true,hmr:false },
  plugins:[{ name:'pristine-tracked-sources', enforce:'pre', load(id) {
    return original.get(relative(root,id.split('?')[0])) ?? null;
  }}],
});
await server.listen();
console.log('Pristine base',ref,'restored tracked sources',paths);
server.printUrls();
