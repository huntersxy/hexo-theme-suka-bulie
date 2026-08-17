#!/bin/bash
set -e

echo "Linting EJS files..."
for f in $(find ./layout -name "*.ejs"); do
  node_modules/.bin/ejslint "$f"
done

echo "Linting CSS files..."
node_modules/.bin/stylelint "src/css/style.css"

echo "Linting JS files..."
node_modules/.bin/eslint "src/js/**/*.js" "includes/**/*.js" "scripts/**/*.js"

echo "All lint checks passed."
