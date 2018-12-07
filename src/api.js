// @flow
import path from 'path'
import fs from 'fs'
import promisify from 'es6-promisify'
import scanFile from './scan-file.js'
import type { Context, FileInfo } from './types'
import ignore from 'ignore'
import createDebug from 'debug'

const debug = createDebug('dead-code-scanner:api')
const readdir = promisify(fs.readdir)
const readFile = promisify(fs.readFile)
const stat = promisify(fs.stat)
const exists = (file) => stat(file).catch(() => false).then(Boolean)

type BuilderOptions = {
  accepts: (string) => boolean,
  extensions: Array<string>,
  isTest: (string) => boolean,
  addEntry: (string) => void
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
      if (options.isTest(file)) {
        options.addEntry(file)
      }

      context[file] = ({
        visited: false,
        imports: [],
        errors: []
      }: FileInfo)
    } else {
      debug('Skipping file', file)
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

// https://github.com/AsaAyers/js-hyperclick/blob/6240dc8dd738371d380a1c875f543887ae5eb65d/lib/core/resolve-module.js
function loadModuleRoots (packagePath): Array<string> {
  const config = JSON.parse(String(fs.readFileSync(packagePath)))

  if (config && config.moduleRoots) {
    let roots = config.moduleRoots
    if (typeof roots === 'string') {
      roots = [roots]
    }

    const packageDir = path.dirname(packagePath)
    return roots.map(r => path.resolve(packageDir, r))
  }
  return []
}

type ScanParameters = {
  root: string,
  src: string,
  files: Array<string>,
  ignorePatterns: Array<string>,
  tests: Array<string>,
  extensions: Array<string>,
}

export async function scanFiles ({ root, src, files, ignorePatterns, extensions, tests }: ScanParameters) {
  src += '/'
  const rootStats = await stat(src)
  if (!rootStats.isDirectory()) {
    throw new Error(`Root must be a directory: ${src}`)
  }
  const packageJson = path.join(root, 'package.json')
  if (!(await exists(packageJson))) {
    throw new Error(`Please run this from your project src`)
  }
  const moduleRoots = loadModuleRoots(packageJson)
  debug('moduleRoots', moduleRoots)
  const accepts = await buildAccepts(root, ignorePatterns)

  const testMatcher = ignore()
  testMatcher.add(tests)

  let context
  try {
    const options = {
      accepts,
      extensions,
      isTest: (filename) => {
        const relPath = path.relative(root, filename)
        return testMatcher.ignores(relPath)
      },
      addEntry: (filename) => {
        debug('found test', filename)
        files.push(filename)
      }
    }
    context = await buildContext(src, options)
  } catch (e) {
    console.log('error building context: ', e)
    throw e
  }

  const helpers = {
    accepts,
    extensions,
    moduleRoots,
    inSrc: (filename) => path.relative(src, filename).substr(0, 2) !== '..'
  }
  await Promise.all(
    files.map(file => scanFile(context, helpers, file))
  )

  return context
}
