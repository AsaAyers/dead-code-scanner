// @flow

export type Import = {
  imported: string,
  moduleName: string,
}

type ErrorEntry = {
  group: string,
  details?: string,
}

export type FileInfo = {
  visited: bool,
  imports: Array<Import>,
  errors: Array<ErrorEntry>,
  dependency?: boolean,
  resolvedModules: Array<string>,
  importedBy: Array<string>,
}

export type Context = {
  [string]: FileInfo
}
