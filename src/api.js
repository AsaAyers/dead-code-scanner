// @flow
import path from 'path'
import fs from 'fs'
import promisify from 'es6-promisify'
import scanFile from './scan-file.js'
import type { Context, FileInfo } from './types'
import ignore from 'ignore'

const readdir = promisify(fs.readdir)
const readFile = promisify(fs.readFile)
const stat = promisify(fs.stat)
const exists = (file) => stat(file).catch(() => false).then(Boolean)

type BuilderOptions = {
  accepts: (string) => boolean,
  extensions: Array<string>,
}

async function buildContext (src: string, options: BuilderOptions, context: Context = {}) {
  const directories = []
  const filenames = await readdir(src)

  await Promise.all(filenames.map(async (filename) => {
    if (filename === '.git') return
    const file = path.resolve(src, filename)

    if (!options.accepts(file)) return

    const stats = await stat(file)

    const ext = path.extname(file)
    if (stats.isDirectory()) {
      directories.push(file)
    } else if (options.extensions.indexOf(ext) >= 0) {
      context[file] = ({
        visited: false,
        imports: [],
        errors: []
      }: FileInfo)
    }
  }))

  await Promise.all(directories.map(d => buildContext(d, options, context)))

  return context
}

async function buildAccepts (root: string, ignorePatterns: Array<string>) {
  const filename = path.join(root, '.gitignore')

  const gitignore = ignore()
  if (await exists(filename)) {
    const content = String(await readFile(filename))
    gitignore.add(content)
  }
  if (ignorePatterns.length > 0) {
    gitignore.add(ignorePatterns)
  }

  return (filename) => {
    const relPath = path.relative(root, filename)
    return !gitignore.ignores(relPath)
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
    const options = {
      accepts,
      extensions: ['.js']
    }
    context = await buildContext(src, options)
  } catch (e) {
    console.log('error building context: ', e)
    throw e
  }

  const helpers = {
    accepts
  }
  await Promise.all(
    files.map(file => scanFile(context, helpers, file))
  )

  return context
}
