#!/usr/bin/env node
// @flow
import 'source-map-support/register'
import { scanFiles } from './api'
import type { Context } from './types'
import path from 'path'
import yargs from 'yargs'
import fs from 'fs'
import { table } from 'table'
import makeTree from './make-tree'

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

  .describe('root', 'Your project root (where package.json lives)')
  .default('root', process.cwd())

  .describe('src', 'Your source directory')
  .coerce('src', expandFile)

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
  ignore: string | ?Array<string>,
}

async function cli (options: Options) {
  const { _: files, root, src } = options
  let ignorePatterns: Array<string> = []
  if (options.ignore != null) {
    ignorePatterns = Array.isArray(options.ignore) ? options.ignore : [options.ignore]
  }

  if (files.length === 0) {
    program.showHelp()
    return
  }

  try {
    const context = await scanFiles(root, src, files, ignorePatterns)
    const report = buildReport(root, context)

    logReport(report)
    // logContext(root, context)
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}
process.on('unhandledRejection', (reason) => {
  console.log('Reason: ' + reason)
})

cli(program.argv)
