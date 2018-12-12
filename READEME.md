## dead-code-scanner

The goal of this project is to crawl your JavaScript code to identify unused
files. The two things you must provide is the path to your source directory and
some entries.

`dead-code-scanner --src src/ src/index.js scripts/cli.js` This will start with
`src/index.js` and `scripts/cli.js` crawling for dependencies and report any
file that lives in `src/` that was not encountered.


All options:

```
dead-code-scanner \
  --src src/ \
  --out unreachable.txt \
  --ignore '*.css' '*.png' \
  --ext js,jsx \
  --webpack webpack.config.js \
  --tests '*test.js' '**/__tests__/**' \
  -- src/index.js
```

* The options `--ignore` and `--tests` accept gitignore style paths.
* `--tests` will be considered additional entry points.
