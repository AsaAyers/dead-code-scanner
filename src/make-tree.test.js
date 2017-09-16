import test from 'ava'
import makeTree from './make-tree'

test('makeTree', t => {
  const input = [
    // I just picked a sample of files out of
    // `find node_modules/eslint/ -name '*.js'`
    'node_modules/eslint/bin/eslint.js',
    'node_modules/eslint/lib/config/autoconfig.js',
    'node_modules/eslint/lib/config/config-rule.js',
    'node_modules/eslint/lib/config/plugins.js',
    'node_modules/eslint/lib/file-finder.js',
    'node_modules/eslint/lib/formatters/compact.js',
    'node_modules/eslint/lib/formatters/jslint-xml.js',
    'node_modules/eslint/lib/load-rules.js',
    'node_modules/eslint/lib/token-store/cursors.js',
    'node_modules/eslint/lib/token-store/forward-token-comment-cursor.js',
    'node_modules/eslint/lib/token-store/forward-token-cursor.js',
    'node_modules/eslint/lib/token-store/limit-cursor.js'
  ]

  const expected = `
/node_modules/eslint/bin/eslint.js
                    /lib/config/autoconfig.js
                               /config-rule.js
                               /plugins.js
                        /file-finder.js
                        /formatters/compact.js
                                   /jslint-xml.js
                        /load-rules.js
                        /token-store/cursors.js
                                    /forward-token-comment-cursor.js
                                    /forward-token-cursor.js
                                    /limit-cursor.js
`.trim()

  const actual = makeTree(input)
  t.log(actual)
  t.is(actual, expected)
})
