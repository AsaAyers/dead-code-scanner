// @flow
import fs from 'fs'
import path from 'path'
import { parse, traverse, types as t } from '@babel/core'
import promisify from 'es6-promisify'
import r from 'resolve'
import g from 'glob'
import createDebug from 'debug'

import type { Context, FileInfo } from './types'

const glob = promisify(g)
export const resolve = promisify(r)
const readFile = promisify(fs.readFile)
const debug = createDebug('dead-code-scanner:scan-file')
const debugParseErrors = debug.extend('parse-error')

// Enable as many plugins as I can so that people don't need to configure
// anything.
const plugins = [
  require('@babel/plugin-syntax-async-generators'),
  require('@babel/plugin-syntax-bigint'),
  require('@babel/plugin-syntax-class-properties'),
  [
    require('@babel/plugin-syntax-decorators'),
    { decoratorsBeforeExport: false }
  ],
  require('@babel/plugin-syntax-do-expressions'),
  require('@babel/plugin-syntax-dynamic-import'),
  require('@babel/plugin-syntax-export-default-from'),
  require('@babel/plugin-syntax-export-namespace-from'),
  require('@babel/plugin-syntax-function-bind'),
  require('@babel/plugin-syntax-function-sent'),
  require('@babel/plugin-syntax-import-meta'),
  require('@babel/plugin-syntax-json-strings'),
  require('@babel/plugin-syntax-jsx'),
  require('@babel/plugin-syntax-logical-assignment-operators'),
  require('@babel/plugin-syntax-nullish-coalescing-operator'),
  require('@babel/plugin-syntax-numeric-separator'),
  require('@babel/plugin-syntax-object-rest-spread'),
  require('@babel/plugin-syntax-optional-catch-binding'),
  require('@babel/plugin-syntax-optional-chaining'),
  [
    require('@babel/plugin-syntax-pipeline-operator'),
    { proposal: 'minimal' }
  ],
  require('@babel/plugin-syntax-throw-expressions')
]

function parseCode (code) {
  try {
    return parse(code, {
      sourceType: 'module',
      plugins: plugins.concat([require('@babel/plugin-syntax-flow')])
    })
  } catch (e) {
  }
  try {
    return parse(code, {
      sourceType: 'module',
      plugins: plugins.concat[require('@babel/plugin-syntax-typescript')]
    })
  } catch (e) {
    debugParseErrors(e)
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

const visitors = {
  ImportDeclaration (path) {
    const fileInfo: FileInfo = this.fileInfo
    if (t.isLiteral(path.node.source)) {
      const moduleName = path.node.source.value

      path.traverse(importVisitors, { fileInfo, moduleName })
    }
  },
  ExportAllDeclaration ({ node }) {
    if (t.isLiteral(node.source)) {
      const fileInfo: FileInfo = this.fileInfo
      const moduleName = node.source.value
      fileInfo.imports.push({
        imported: 'default',
        moduleName
      })
    }
  },
  ExportNamedDeclaration ({ node }) {
    const fileInfo: FileInfo = this.fileInfo
    const moduleName = t.isLiteral(node.source)
      ? node.source.value
      : undefined

    if (moduleName) {
      fileInfo.imports.push({
        imported: 'default',
        moduleName
      })
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
      if (moduleName == null && t.isTemplateLiteral(arg)) {
        if (arg.quasis.length === 1) {
          const quasi = arg.quasis[0]
          moduleName = quasi.value.cooked
        } else {
          moduleName = arg.quasis
            .map((element) => element.value.cooked)
            .join('*')

          fileInfo.errors.push({
            group: 'WARNING: Converted template into a glob',
            details: this.sourceOfNode(path.node) + ` became: ${moduleName}`
          })
        }
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

const nodeModuleRegex = /.*node_modules\/(@[^/]*\/)?[^/]*/

const resolveImports = (helpers, filePath, fileInfo) => async (acc: Promise<Array<string>>, moduleName: string): Promise<Array<string>> => {
  // if (moduleName[0] !== '.') return acc
  if (moduleName.indexOf('*') >= 0) {
    const modules = await glob(moduleName, {
      cwd: path.dirname(filePath)
    })

    const files = await modules.reduce(resolveImports(helpers, filePath, fileInfo), acc)

    return (await acc).concat(files)
  }

  // I don't need to implement custom module roots at this point
  // https://github.com/AsaAyers/js-hyperclick/blob/6240dc8dd738371d380a1c875f543887ae5eb65d/lib/core/resolve-module.js#L85-L135
  let roots = [path.dirname(filePath)]
  if (moduleName[0] !== '.') {
    roots = roots.concat(helpers.moduleRoots)
  }

  for (let i = 0; i < roots.length; i++) {
    const basedir = roots[i]
    // When using module roots, this needs to be made into a relative path
    let mName = (i === 0) ? moduleName : `./${moduleName}`
    try {
      const nextFile = await resolve(mName, {
        basedir,
        extensions: helpers.extensions
      })

      const match = nextFile.match(nodeModuleRegex)
      if (match) {
        // If `nextFile` is `whatever/node_modules/something/dist/index.js`,
        // only keep the path to the node module:
        // `whatever/node_modules/something`. For node modules we don't care
        // about the individual files just that anything in the depdency was
        // used at some point.
        return (await acc).concat([match[0]])
      }

      return (await acc).concat([nextFile])
    } catch (e) {
      // pass
    }
  }

  fileInfo.errors.push({
    group: 'Unable to resolve',
    details: moduleName
  })
  return acc
}

type Helpers = {
  moduleRoots: Array<string>,
  accepts: (string) => boolean,
  extensions: Array<string>,
  inSrc: (string) => boolean,
}
export default async function scanFile (context: Context, helpers: Helpers, filePath: string): Promise<void> {
  let fileInfo: ?FileInfo = context[filePath]
  if (fileInfo == null) {
    fileInfo = context[filePath] = {
      visited: false,
      imports: [],
      errors: [],
      resolvedModules: [],
      importedBy: []
    }
  }

  if (fileInfo.visited === true) return
  fileInfo.visited = true

  const isPackageJson = path.basename(filePath) === 'package.json'

  if (isPackageJson) {
    const packageJson = JSON.parse(String(fs.readFileSync(filePath)))
    debug(packageJson)
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }

    fileInfo.imports = Object.keys(dependencies).map(packageName => {
      return {
        imported: 'default',
        moduleName: path.join(packageName, 'package.json')
      }
    })
  } else {
    const code: string = String(await readFile(filePath))
    const ast = parseCode(code)
    if (!ast) {
      const ext = path.extname(filePath)
      fileInfo.errors.push({
        group: `parse error ${ext}`
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
  }

  const resolvedFiles: Array<string> = await fileInfo.imports
    .map((tmp): string => tmp.moduleName)
    .reduce(resolveImports(helpers, filePath, fileInfo), Promise.resolve([]))
  fileInfo.resolvedFiles = resolvedFiles

  debug(filePath, resolvedFiles)

  await Promise.all(
    resolvedFiles.map(nextFile => {
      context[nextFile] = context[nextFile] || {
        visited: false,
        imports: [],
        errors: [],
        resolvedModules: [],
        importedBy: []
      }
      context[nextFile].importedBy = context[nextFile].importedBy || []
      context[nextFile].importedBy.push(filePath)
      context[nextFile].inSrc = helpers.inSrc(nextFile)

      if (isPackageJson) {
        context[nextFile].dependency = true
        return
      }

      if (!context[nextFile].inSrc) {
        context[nextFile].visited = true
      } else if (helpers.accepts(nextFile) || path.basename(nextFile) === 'package.json') {
        return scanFile(context, helpers, nextFile)
      }
    })
  )
}
