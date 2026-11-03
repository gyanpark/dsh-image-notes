/**
 * dsh-image-notes: bundles the "image-notes" skill into a DeepSeek Harness profile.
 * The skill reads pasted/attached images with a local Ollama vision model (one by one),
 * writes Markdown notes to <workspace>/.image-notes, and hands them to the selected model.
 * @module dsh-image-notes
 */
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'

/** Cordis plugin name. */
export const name = 'image-notes'
/** Needs the skill registry. */
export const inject = ['skills']

/** Deployment options; every field has a default. */
export const Config = z.object({
  ollamaHost: z.string().default('http://127.0.0.1:11434').description('Ollama base URL used by the script'),
  model: z.string().default('').description('Force a vision model; empty = smallest installed model with vision capability'),
  lang: z.string().default('').description('Language for the notes; empty = English'),
  node: z.string().default('').description('Absolute Node executable for the script; empty = auto-detect'),
})

const SKILL_NAME = 'image-notes'

function parseFrontmatter(raw, path) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (!m) throw new Error(`image-notes: ${path} has no YAML frontmatter`)
  const desc = /^description:\s*(.+)$/mu.exec(m[1])
  if (!desc) throw new Error(`image-notes: ${path} has no description`)
  let description = desc[1].trim()
  if ((description.startsWith('"') && description.endsWith('"')) || (description.startsWith("'") && description.endsWith("'"))) description = description.slice(1, -1)
  return { description, content: raw.slice(m[0].length).trim() }
}

function pickNode(configured) {
  if (configured) return configured
  // Inside Electron or a single-executable build, process.execPath is not a plain Node; let PATH decide.
  if (process.versions.electron !== undefined || process.execPath.toLowerCase().includes('electron')) return 'node'
  return process.execPath
}

function runtimeSection(scriptPath, config) {
  const node = pickNode(config.node)
  const flags = []
  if (config.ollamaHost && config.ollamaHost !== 'http://127.0.0.1:11434') flags.push('--ollama', config.ollamaHost)
  if (config.model) flags.push('--model', config.model)
  if (config.lang) flags.push('--lang', config.lang)
  const flagText = flags.map(f => (/\s/.test(f) ? `"${f}"` : f)).join(' ')
  const tail = flagText ? ` ${flagText}` : ''
  return [
    '',
    '',
    '## Runtime (filled in by the plugin)',
    '',
    'Run the script with these absolute paths. Quote them; they may contain spaces.',
    '',
    '```json',
    JSON.stringify({ node, script: scriptPath, flags }, undefined, 2),
    '```',
    '',
    'Always append the flags above to every call.',
    '',
    `Example (pwsh): & "${node}" "${scriptPath}" --latest 1${tail}`,
    `Example (bash): "${node}" "${scriptPath}" --latest 1${tail}`,
  ].join('\n')
}

/**
 * Register the bundled skill with the Harness skill registry.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Context carrying the skill registry.
 * @param {z.infer<typeof Config>} config - Plugin options.
 */
export function apply(ctx, config = {}) {
  const here = dirname(fileURLToPath(import.meta.url))
  const directory = join(here, '..', 'skills', SKILL_NAME)
  const skillPath = join(directory, 'SKILL.md')
  const scriptPath = join(directory, 'image-notes.mjs')
  if (!isAbsolute(directory)) throw new Error('image-notes: skill directory must be absolute')
  const { description } = parseFrontmatter(readFileSync(skillPath, 'utf8'), skillPath)

  const candidate = {
    name: SKILL_NAME,
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'dsh-image-notes',
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
    locator: skillPath,
    path: skillPath,
  }
  const provider = {
    name: 'dsh-image-notes',
    list: () => Promise.resolve([candidate]),
    async get(cand, options) {
      const { rank: _rank, locator, ...summary } = cand
      const raw = await readFile(locator, { encoding: 'utf8', signal: options?.signal })
      const content = parseFrontmatter(raw, locator).content + runtimeSection(scriptPath.split(sep).join('/'), config)
      return { ...summary, content }
    },
  }
  ctx.skills.registerProvider(() => provider)
}
