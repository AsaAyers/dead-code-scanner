#!/usr/bin/env node
// @flow
import 'source-map-support/register'
import { scanFiles, expandFile } from './api'
import type { Context } from './types'

function logContext (root, context: Context) {
  Object.keys(context).forEach(key => {
    if (context[key].visited) return
    let name = key

    // console.log(root, 'key.substr(0, root.length): ', key.substr(0, root.length))
    if (key.substr(0, root.length) === root) {
      name = key.substr(root.length)
    }
    console.log(name, context[key])
  })
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

cli(...process.argv)
