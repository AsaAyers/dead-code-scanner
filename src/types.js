// @flow

type Import = {
  imported: string,
  moduleName: string,
}

export type FileInfo = {
  visited: bool,
  imports: Array<Import>,
  errors: Array<string>,
}

export type Context = {
  [string]: FileInfo
}
