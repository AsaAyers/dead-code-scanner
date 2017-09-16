#!/usr/bin/env node
// @flow
import 'source-map-support/register'
import { scanFiles } from './api'
import type { Context } from './types'
import path from 'path'
import yargs from 'yargs'
import fs from 'fs'

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

function logContext (root: string, ctx: Context) {
  const context = rekeyContext(root, ctx)

  let errorCount = 0
  let scannedCount = 0
  const errors = {}
  const fileList = Object.keys(context)
  const notFound = []
  fileList.forEach(name => {
    const fileInfo = context[name]
    if (fileInfo.visited) {
      scannedCount++
    } else {
      notFound.push(name)
    }

    if (fileInfo.errors.length > 0) {
      errors[name] = fileInfo.errors
      errorCount += fileInfo.errors.length
    }
  })

  const write = (...args) => process.stdout.write(args.join(' ') + '\n')

  // write(`Not Found (${notFound.length})`)
  // notFound.forEach(name => write(`  ${name}`))
  // write('\n\n')

  write(`Errors (${errorCount})`)
  Object.keys(errors).forEach(name => {
    write(`  ${name}`)
    errors[name].forEach(err => write('  ', err))
  })

  write('files scanned:', scannedCount)
  write('error count:', errorCount)
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
    logContext(root, context)
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}
process.on('unhandledRejection', (reason) => {
  console.log('Reason: ' + reason)
})

cli(program.argv)
