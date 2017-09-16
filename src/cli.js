#!/usr/bin/env node
// @flow
import 'source-map-support/register'
import { scanFiles, expandFile } from './api'
import type { Context } from './types'
import path from 'path'

function rekeyContext (context: Context): Context {
  return Object.keys(context).reduce((acc, key) => {
    const name = path.relative(process.cwd(), key)
    acc[name] = context[key]
    return acc
  }, {})
}

function logContext (ctx: Context) {
  const context = rekeyContext(ctx)

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

  write(`Not Found (${notFound.length})`)
  notFound.forEach(name => write(`  ${name}`))
  write('\n\n')

  write(`Errors (${errorCount})`)
  Object.keys(errors).forEach(name => {
    write(`  ${name}`)
    errors[name].forEach(err => write('  ', err))
  })

  write('files scanned:', scannedCount)
  write('error count:', errorCount)
}

async function cli (node, cli, root, ...files: Array<string>) {
  // I tried using `commander` but it wasn't saving me any time
  if (!root) {
    throw new Error('You must specify a root directory')
  }
  root = expandFile(root)
  if (files.length === 0) {
    throw new Error('You must specify one or more entry files')
  }

  try {
    const context = await scanFiles(root, files)
    logContext(context)
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}
process.on('unhandledRejection', (reason) => {
  console.log('Reason: ' + reason)
})

cli(...process.argv)
