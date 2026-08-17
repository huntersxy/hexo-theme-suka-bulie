'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const lightningcss = require('lightningcss');
const browserslist = require('browserslist');

const rootDir = __dirname;
const srcDir = path.join(rootDir, 'src');
const destDir = path.join(rootDir, 'source');

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

function relativeDest(file) {
  const rel = path.relative(srcDir, file);
  if (file.endsWith('.js')) return rel.replace(/\.js$/, '.min.js');
  if (file.endsWith('.css')) return rel.replace(/\.css$/, '.min.css');
  return null;
}

async function build() {
  const files = [];
  walk(srcDir, (file) => {
    const dest = relativeDest(file);
    if (dest) files.push({ src: file, dest });
  });

  const targets = lightningcss.browserslistToTargets(
    browserslist('last 2 versions, not dead')
  );

  for (const { src, dest } of files) {
    const outPath = path.join(destDir, dest);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    if (src.endsWith('.js')) {
      const result = await esbuild.transform(fs.readFileSync(src, 'utf8'), {
        minify: true,
        target: ['es2018'],
        legalComments: 'inline',
      });
      fs.writeFileSync(outPath, result.code);
    } else {
      const result = lightningcss.transform({
        filename: src,
        code: fs.readFileSync(src),
        minify: true,
        targets,
      });
      fs.writeFileSync(outPath, result.code);
    }

    console.log(`Built ${path.relative(rootDir, outPath)}`);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
