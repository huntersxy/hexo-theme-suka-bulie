// ESLint 9 flat config (浏览器脚本 + hexo 插件脚本混合环境)
const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                history: 'readonly',
                localStorage: 'readonly',
                matchMedia: 'readonly',
                fetch: 'readonly',
                XMLHttpRequest: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                URL: 'readonly',
                Audio: 'readonly',
                alert: 'readonly',
                require: 'readonly',
                module: 'readonly',
                process: 'readonly',
                hexo: 'readonly',
                Prism: 'readonly',
            },
        },
        rules: {
            'no-console': 'off',
            'no-unused-vars': 'off',
            'no-empty': 'off',
            'no-useless-escape': 'off',
            'no-cond-assign': 'off',
            'no-extra-semi': 'off',
            'no-undef': 'off',
            'no-redeclare': 'off',
            'no-extra-boolean-cast': 'off',
        },
    },
];
