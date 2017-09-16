#!/usr/bin/env node
// @flow
import 'source-map-support/register'
import { scanFiles, expandFile } from './api'
import type { Context } from './types'

function logContext (root, context: Context) {
  const getName = (key) => (key.substr(0, root.length) === root)
    ? key.substr(root.length)
    : key

  let errorCount = 0
  const errors = {}
  let scannedCount = 0
  const fileList = Object.keys(context)
  fileList.forEach(key => {
    const fileInfo = context[key]
    if (fileInfo.visited) {
      scannedCount++
    }
    const name = getName(key)

    if (fileInfo.errors.length > 0) {
      errors[name] = fileInfo.errors
      errorCount += fileInfo.errors.length
    }
    // console.log(name, fileInfo)
  })
  console.log(fileList.filter(key =>
    !context[key].visited
  ).map(getName))

  console.log(errors)
  console.log('files scanned:', scannedCount)
  console.log('unreached files:', fileList.length - scannedCount)
  console.log('error count:', errorCount)
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
    logContext(root, context)
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}
process.on('unhandledRejection', (reason) => {
  console.log('Reason: ' + reason)
})

cli(...process.argv)
