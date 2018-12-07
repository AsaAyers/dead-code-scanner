#!/usr/bin/env node
// @flow
import 'source-map-support/register'
import { scanFiles } from './api'
import { resolve } from './scan-file'
import type { Context } from './types'
import path from 'path'
import yargs from 'yargs'
import fs from 'fs'
import { table } from 'table'
import makeTree from './make-tree'
import createDebug from 'debug'

const debug = createDebug('dead-code-scanner:cli')
const write = (...args) => process.stdout.write(args.join(' ') + '\n')

export const expandFile = (filename: string) => {
  const fullPath = path.resolve(process.cwd(), filename)

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Unable to locate file: ${filename}`)
  }

  return fullPath
}
const program = yargs
  .usage(`Usage: $0 --src <dir> <files...> `)

  .describe('ignore', '.gitignore pattern to ignore')
  .array('ignore')
  .default('ignore', [])

  .describe('tests', '.gitignore pattern for tests (they will be considered entries)')
  .array('tests')
  .default('tests', [])

  .describe('root', 'Your project root (where package.json lives)')
  .default('root', process.cwd())

  .describe('src', 'Your source directory')
  .coerce('src', expandFile)

  .describe('webpack', 'Webpack config file')

  .describe('ext', 'comma separated array of extensions')
  .default('ext', 'js')

  .describe('out', 'Output file to list unreachable files')

  .coerce('_', (files) => files.map(expandFile))
  .demandOption('src')

function rekeyContext (root: string, context: Context): Context {
  return Object.keys(context).reduce((acc, key) => {
    const name = path.relative(root, key)
    acc[name] = context[key]
    return acc
  }, {})
}

type Report = {
  scannedCount: number,
  errorCount: number,
  errors: Array<Array<string>>,
  notFound: Array<string>,
}
function buildReport (root: string, ctx: Context): Report {
  const context = rekeyContext(root, ctx)
  const report: Report = {
    scannedCount: 0,
    errorCount: 0,
    errors: [],
    notFound: []
  }

  const fileList = Object.keys(context)
  fileList.forEach(name => {
    const fileInfo = context[name]
    if (fileInfo.visited) {
      report.scannedCount++
    } else {
      report.notFound.push(name)
    }

    if (fileInfo.errors.length > 0) {
      report.errorCount += fileInfo.errors.length

      fileInfo.errors.forEach(({ group, details }) => {
        report.errors.push(
          [group, name, details || '']
        )
      })
    }
  })

  return report
}

const sortByColumns = (columns: Array<number>) => (a, b) => {
  for (var i = 0; i < columns.length; i++) {
    const col = columns[i]
    if (a[col] < b[col]) return -1
    if (a[col] > b[col]) return 1
  }
  return 0
}

function logReport ({ errorCount, errors, notFound }: Report) {
  const errorOptions = {
    drawHorizontalLine: (index, size) => {
      return index === 0 || index === 1 || index === size - 1 || index === size
    }
  }
  const errorData = [
    ['Error Group', 'File', 'Details'],
    ...(errors.sort(sortByColumns([0, 2]))),
    ['Error Count:', errorCount, null]
  ]
  const errorTable = table(errorData, errorOptions)

  write('Not found:')
  write(makeTree(notFound))
  write('Unreachable files:', notFound.length)

  write(errorTable)
}

type Options = {
  root: string,
  src: string,
  _: Array<string>,
  ignore: Array<string>,
  tests: Array<string>,
  webpack: string,
  ext: string,
  out: ?string,
}

async function cli (options: Options) {
  const { _: files, root, src, webpack, ext, tests, ignore: ignorePatterns } = options
  const extensions = ext.split(',')

  if (webpack) {
    // $FlowFixMe
    let webpackConfig: any = require(path.join(process.cwd(), webpack))
    if (typeof webpackConfig === 'function') {
      webpackConfig = webpackConfig()
    }

    // This assumes your entries are in the format `main: ['./main'],
    // other['./other']`
    const entries = [...new Set(
      Object.values(webpackConfig.entry).reduce((entries, next) => entries.concat(
        Array.isArray(next) ? next : [ next ]
      ), [])
    )].sort()

    if (entries.length > 0) {
      debug('Found entries in webpack', entries)
    }
    const resolvedEntries = await Promise.all(entries.map(
      moduleName => resolve(moduleName, {
        basedir: root
      })
    ))

    resolvedEntries.forEach(
      e => files.push(e)
    )

    // // Pulling extensions from wepback doesn't really work because it picks up
    // // things like CSS files. But this doesn't parse CSS files, so if something
    // // is used through an `@import './whatever.css'` it gets marked as
    // // unreachable
    // if (webpackConfig.resolve && webpackConfig.resolve.extensions) {
    //   extensions.length = 0
    //   webpackConfig.resolve.extensions.forEach(
    //     e => extensions.push(e.substr(1))
    //   )
    //   debug('Found extensions in webpack', extensions)
    // }
  }

  if (files.length === 0) {
    program.showHelp()
    return
  }

  try {
    const context = await scanFiles({
      root,
      src,
      files,
      ignorePatterns,
      extensions: extensions.map(e => '.' + e),
      tests
    })
    const report = buildReport(root, context)

    logReport(report)

    console.log('out', options.out)
    if (options.out != null) {
      fs.writeFileSync(options.out, report.notFound.join('\n'))
    }
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}
process.on('unhandledRejection', (reason) => {
  console.log('Reason: ' + reason)
})

cli(program.argv)
