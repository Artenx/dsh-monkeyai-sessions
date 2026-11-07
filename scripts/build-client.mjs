import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const output = resolve(root, 'lib/client-runtime.cjs')
await mkdir(dirname(output), { recursive: true })

const build = spawnSync('esbuild', [
  'src/client/index.js',
  '--bundle',
  '--format=cjs',
  '--platform=browser',
  '--target=es2022',
  '--external:@deepseek-ai/*',
  '--external:react',
  '--external:zod',
  // DSH materializes only the modules listed in dsh.client.inject; the
  // protocol package's subpath entries are not seed words, so the
  // remote-info factory is vendored into the bundle.
  `--alias:@deepseek-ai/dsh-typert-protocol/remote-info=${resolve(root, 'src/shared/remote-info-lite.mjs')}`,
  `--outfile=${output}`,
], { cwd: root, encoding: 'utf8' })

if (build.error) throw build.error
if (build.status !== 0) throw new Error(build.stderr || 'esbuild failed')

const bundle = await readFile(output, 'utf8')
const client = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(packageJson.name)},
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
${bundle.split('\n').map(line => `    ${line}`).join('\n')}
    return module.exports;
  },
});
`
await writeFile(resolve(root, 'client.js'), client)
