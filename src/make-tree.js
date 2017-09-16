import path from 'path'

export default function makeTree (files: Array<string>) {
  let out = []
  const clone = files.slice().sort()

  let lastSegments = []
  clone.forEach(filename => {
    const segments = filename.split(path.sep)
    let str = ''

    for (var i = 0; i < segments.length; i++) {
      let part = segments[i]
      if (i < lastSegments.length && lastSegments[i] === part) {
        str += ' ' + part.replace(/./g, ' ')
      } else {
        str += '/' + part
      }
    }
    lastSegments = segments
    out.push(str)
  })

  return out.join('\n')
}
