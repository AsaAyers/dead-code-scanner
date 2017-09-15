// @flow

type Import = {
  imported: string,
  moduleName: string,
  errors: Array<string>,
}

export type FileInfo = {
  visited?: true,
  imports: Array<Import>,
}

export type Context = {
  [string]: FileInfo
}
