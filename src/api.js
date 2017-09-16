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

export const expandFile = (filename: string) => {
  const fullPath = path.resolve(process.cwd(), filename)

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Unable to locate file: ${filename}`)
  }

  return fullPath
}

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

export async function scanFiles (src: string, files: Array<string>) {
  src = expandFile(src) + '/'
  const rootStats = await stat(src)
  if (!rootStats.isDirectory()) {
    throw new Error(`Root must be a directory: ${src}`)
  }
  const packageJson = path.join(process.cwd(), 'package.json')
  if (!(await exists(packageJson))) {
    throw new Error(`Please run this from your project src`)
  }

  let accepts = (path) => true
  const gitignore = path.join(process.cwd(), '.gitignore')
  if (await exists(gitignore)) {
    const content = await readFile(gitignore)
    accepts = giCompile(String(content)).accepts
  }

  let context
  try {
    context = await buildContext({ src, accepts })
  } catch (e) {
    console.log('error building context: ', e)
    throw e
  }
  const f = files.map(expandFile)

  await Promise.all(
    f.map(file => scanFile(context, file))
  )

  return context
}
