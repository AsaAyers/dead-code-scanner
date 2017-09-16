// @flow
import path from 'path'
import fs from 'fs'
import promisify from 'es6-promisify'
import scanFile from './scan-file.js'
import type { Context, FileInfo } from './types'
import { compile as giCompile } from 'gitignore-parser'

const readdir = promisify(fs.readdir)
const readFile = promisify(fs.readFile)
const stat = promisify(fs.stat)
const exists = (file) => stat(file).catch(() => false).then(Boolean)

type BuilderOptions = {
  src: string,
  accepts: (string) => boolean
}

async function buildContext ({ src, accepts }: BuilderOptions, context: Context = {}) {
  const directories = []
  const filenames = await readdir(src)

  await Promise.all(filenames.map(async (filename) => {
    if (filename === '.git') return
    const file = path.resolve(src, filename)

    if (!accepts(file)) return

    const stats = await stat(file)

    if (stats.isDirectory()) {
      directories.push(file)
    } else {
      context[file] = ({
        visited: false,
        imports: [],
        errors: []
      }: FileInfo)
    }
  }))

  await Promise.all(directories.map(d => buildContext({ src: d, accepts }, context)))

  return context
}

async function buildAccepts (root: string, ignorePatterns: Array<string>) {
  const filename = path.join(root, '.gitignore')
  let content = ''

  if (await exists(filename)) {
    content = String(await readFile(filename))
  }
  if (ignorePatterns.length > 0) {
    content += '\n\n' + ignorePatterns.join('\n')
  }

  let gitignore
  if (content.trim().length > 0) {
    gitignore = giCompile(content)
  }
  return (filename) => {
    if (gitignore) {
      const relPath = path.relative(root, filename)
      return gitignore.accepts(relPath)
    }

    return true
  }
}

export async function scanFiles (root: string, src: string, files: Array<string>, ignorePatterns: Array<string>) {
  src += '/'
  const rootStats = await stat(src)
  if (!rootStats.isDirectory()) {
    throw new Error(`Root must be a directory: ${src}`)
  }
  const packageJson = path.join(root, 'package.json')
  if (!(await exists(packageJson))) {
    throw new Error(`Please run this from your project src`)
  }

  const accepts = await buildAccepts(root, ignorePatterns)

  let context
  try {
    context = await buildContext({ src, accepts })
  } catch (e) {
    console.log('error building context: ', e)
    throw e
  }

  await Promise.all(
    files.map(file => scanFile(context, file))
  )

  return context
}
