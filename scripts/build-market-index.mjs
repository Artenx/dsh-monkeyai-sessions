// Builds the DSH plugin market index (format 1) for this package.
//
// The index lists every published version of the package. Version metadata
// comes from the npm registry when the package is published; before the first
// publish the current package.json version is listed with the current time so
// the document can be validated and hosted ahead of the release.
//
// Usage:
//   node scripts/build-market-index.mjs            # write market/index.json
//   node scripts/build-market-index.mjs --check    # validate only, no write
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const iconSvg = await readFile(resolve(root, 'assets/icon.svg'), 'utf8')
const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg, 'utf8').toString('base64')}`
const repositoryUrl = (manifest.repository?.url ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '')

const INDEX_URL = process.env.MARKET_INDEX_URL
  ?? 'https://artenx.github.io/dsh-monkeyai-sessions/index.json'

async function publishedVersions() {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(manifest.name)}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return undefined
    const data = await response.json()
    const times = data.time ?? {}
    // List stable releases only. Prereleases such as npm's own staging
    // artifacts are not what a market visitor should install by default.
    const versions = Object.keys(data.versions ?? {})
      .filter(version => /^\d+\.\d+\.\d+$/.test(version) && times[version])
      .map(version => ({
        version,
        publishTimestamp: Math.floor(Date.parse(times[version] ?? '') / 1000) || Math.floor(Date.now() / 1000),
        engines: data.versions[version]?.engines?.dsh
          ? { dsh: data.versions[version].engines.dsh }
          : (manifest.engines?.dsh ? { dsh: manifest.engines.dsh } : {}),
      }))
    return versions.length > 0 ? versions : undefined
  } catch {
    return undefined
  }
}

const published = await publishedVersions()
const versions = (published ?? [{
  version: manifest.version,
  publishTimestamp: Math.floor(Date.now() / 1000),
  engines: manifest.engines?.dsh ? { dsh: manifest.engines.dsh } : {},
}]).map(entry => ({ ...entry, source: { type: 'npm' } }))

// Format 1 requires descending SemVer precedence.
versions.sort((left, right) => {
  const parse = value => value.split(/[.-]/).map(part => (/^\d+$/.test(part) ? Number(part) : part))
  const a = parse(left.version)
  const b = parse(right.version)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return y - x
    return String(y).localeCompare(String(x))
  }
  return 0
})

const index = {
  format: 1,
  title: { en: 'MonkeyAI Sessions', zh: 'MonkeyAI 会话' },
  description: {
    en: 'Continue your MonkeyAI work from DeepSeek Harness.',
    zh: '在 DeepSeek Harness 中接着做 MonkeyAI 里的工作。',
  },
  metadata: {
    categories: {
      'remote-sessions': { title: { en: 'Remote Sessions', zh: '远程会话' } },
    },
    labels: {
      verified: { title: { en: 'Verified', zh: '已验证' } },
    },
    sortKeys: {
      updated: { title: { en: 'Recently updated', zh: '最近更新' }, order: 'desc' },
    },
  },
  plugins: [{
    name: manifest.name,
    title: { en: 'MonkeyAI Sessions', zh: 'MonkeyAI 会话' },
    description: {
      en: manifest.description,
      zh: '在 DSH 里直接读取和查看 MonkeyAI 中的会话，并下发新指令，无缝接续之前在 MonkeyAI 客户端上的工作。支持完整历史、实时回复、停止回合与切换模型。',
    },
    icon,
    author: typeof manifest.author === 'string' ? manifest.author : manifest.author?.name,
    homepage: manifest.homepage ?? repositoryUrl,
    repository: { url: repositoryUrl },
    metadata: {
      category: 'remote-sessions',
      keywords: manifest.keywords ?? [],
      labels: ['verified'],
      sortKeys: { updated: versions[0]?.publishTimestamp ?? 0 },
    },
    versions,
  }],
}

const output = resolve(root, 'market/index.json')
const serialized = `${JSON.stringify(index, null, 2)}\n`

if (process.argv.includes('--check')) {
  console.log(`index document ready (${versions.length} version(s)), index URL: ${INDEX_URL}`)
} else {
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, serialized)
  console.log(`wrote market/index.json with ${versions.length} version(s)`)
}
console.log(`users add this index source in DSH: ${INDEX_URL}`)
