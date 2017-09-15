// @flow
import path from 'path'
import fs from 'fs'
import promisify from 'es6-promisify'
import scanFile from './scan-file.js'
import type { Context, FileInfo } from './types'

const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)

export const expandFile = (filename: string) => {
  const fullPath = path.resolve(process.cwd(), filename)

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Unable to locate file: ${filename}`)
  }

  return fullPath
}

async function buildContext (root: string, context: Context = {}) {
  const directories = []
  const filenames = await readdir(root)

  await Promise.all(filenames.map(async (filename) => {
    if (filename === 'node_modules') return
    if (filename === '.git') return
    if (filename === 'test') return

    const file = path.resolve(root, filename)
    const stats = await stat(file)

    if (stats.isDirectory()) {
      directories.push(file)
    } else {
      context[file] = ({
        imports: [],
        errors: []
      }: FileInfo)
    }
  }))

  await Promise.all(directories.map(d => buildContext(d, context)))

  return context
}

export async function scanFiles (root: string, files: Array<string>) {
  root = expandFile(root) + '/'
  const rootStats = await stat(root)
  if (!rootStats.isDirectory()) {
    throw new Error(`Root must be a directory: ${root}`)
  }

  let context
  try {
    context = await buildContext(root)
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
