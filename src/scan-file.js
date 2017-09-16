// @flow
import fs from 'fs'
import path from 'path'
import { parse } from 'babylon'
import promisify from 'es6-promisify'
import traverse from 'babel-traverse'
import * as t from 'babel-types'
import r from 'resolve'

import type { Context, FileInfo } from './types'

const resolve = promisify(r)
const readFile = promisify(fs.readFile)

const plugins = [
  'estree',
  'jsx',
  // 'flow',
  // 'typescript',
  'doExpressions',
  'objectRestSpread',
  'decorators',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'exportExtensions',
  'asyncGenerators',
  'functionBind',
  'functionSent',
  'dynamicImport',
  'numericSeparator',
  'optionalChaining',
  'importMeta',
  'bigInt'
]

function parseCode (code) {
  try {
    return parse(code, { sourceType: 'module', plugins: plugins.concat(['flow']) })
  } catch (e) {
  }
  try {
    return parse(code, { sourceType: 'module', plugins: plugins.concat(['typescript']) })
  } catch (e) {
  }
}

const indent = (n) => Array(n).fill(' ').join('')

// eslint-disable-next-line no-unused-vars
const debugVisitors = (visitors) => {
  let depth = 0
  visitors.enter = function (path) {
    console.log(
      indent(depth),
      path.node.type,
      path.node.value
    )
    depth++
  }
  visitors.exit = function (path) {
    depth--
  }
}

const importVisitors = {
  ImportDefaultSpecifier (path) {
    const fileInfo: FileInfo = this.fileInfo

    fileInfo.imports.push({
      imported: 'default',
      moduleName: this.moduleName
    })
  },
  ImportNamespaceSpecifier (path) {
    const fileInfo: FileInfo = this.fileInfo
    fileInfo.imports.push({
      imported: '*',
      moduleName: this.moduleName
    })
  },
  ImportSpecifier (path) {
    const fileInfo: FileInfo = this.fileInfo
    const imported = path.node.imported.name

    fileInfo.imports.push({
      imported,
      moduleName: this.moduleName
    })
  }
}

// debugVisitors(importVisitors)

const visitors = {
  ImportDeclaration (path) {
    const fileInfo: FileInfo = this.fileInfo
    if (t.isLiteral(path.node.source)) {
      const moduleName = path.node.source.value

      path.traverse(importVisitors, { fileInfo, moduleName })
    }
  },
  CallExpression (path) {
    const fileInfo: FileInfo = this.fileInfo
    const isRequire = t.isIdentifier(path.node.callee, { name: 'require' })
    const isRequireResolve =
      t.isMemberExpression(path.node.callee, { computed: false }) &&
      t.isIdentifier(path.node.callee.object, { name: 'require' }) &&
      t.isIdentifier(path.node.callee.property, { name: 'resolve' })

    if (isRequire || isRequireResolve) {
      let moduleName
      const arg = path.node.arguments[0]
      if (t.isLiteral(arg)) {
        moduleName = arg.value
      }
      if (moduleName == null && t.isTemplateLiteral(arg) && arg.quasis.length === 1) {
        const quasi = arg.quasis[0]
        moduleName = quasi.value.cooked
      }

      if (moduleName != null) {
        fileInfo.imports.push({
          imported: 'default',
          moduleName
        })
      } else {
        fileInfo.errors.push({
          group: 'Unable to parse require',
          details: this.sourceOfNode(path.node)
        }
        )
      }
    }
  }
}

// debugVisitors(visitors)

type Helpers = {
  accepts: (string) => boolean
}
export default async function scanFile (context: Context, helpers: Helpers, filepath: string): Promise<void> {
  let fileInfo: ?FileInfo = context[filepath]
  if (fileInfo == null) {
    fileInfo = context[filepath] = {
      visited: false,
      imports: [],
      errors: []
    }
  }

  if (fileInfo.visited === true) return
  fileInfo.visited = true

  const code: string = String(await readFile(filepath))
  const ast = parseCode(code)
  if (!ast) {
    fileInfo.errors.push({
      group: `parse error`
    })
    return
  }
  const sourceOfNode = ({ start, end }) => {
    return code.substr(
      start,
      (end - start)
    )
  }
  traverse(ast, visitors, undefined, { fileInfo, code, sourceOfNode })

  await Promise.all(fileInfo.imports.map(async (tmp) => {
    if (!tmp.moduleName) {
      console.log(filepath, fileInfo)
    }
    if (tmp.moduleName[0] === '.') {
      let nextFile
      try {
        nextFile = await resolve(tmp.moduleName, {
          basedir: path.dirname(filepath)
        })
      } catch (e) {
        // $FlowFixMe I don't see how fileInfo could be null here
        const fi: FileInfo = fileInfo
        fi.errors.push({
          group: 'Unable to resolve',
          details: tmp.moduleName
        })
        return
      }
      if (helpers.accepts(nextFile)) {
        return scanFile(context, helpers, nextFile)
      }
    }
  }))
}
