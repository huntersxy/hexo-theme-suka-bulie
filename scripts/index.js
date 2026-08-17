/* global hexo */

// Welcome Message
require('../includes/tasks/welcome');
// Check Hexo Version
require('../includes/tasks/check_hexo')(hexo);
// Check required dependencies
require('../includes/tasks/check_deps');

const loggerFactory = require('hexo-log');
const logger = typeof loggerFactory === 'function' ? loggerFactory() : loggerFactory.logger();
logger.info('Loading Suka-bulie Theme Plugins');

// Helper
require('../includes/helpers/page')(hexo);
require('../includes/helpers/tags')(hexo);
require('../includes/helpers/favicon')(hexo);
require('../includes/helpers/qrcode')(hexo);

// Generator
require('../includes/generator/search')(hexo);

// Filter
require('../includes/filter/prism')(hexo);
require('../includes/filter/lazyload')(hexo);

// Debug helper
hexo.extend.helper.register('console', function () {
    console.log(arguments);
});

if ((/3.[89]/).test(hexo.version)) {
    hexo.extend.filter.unregister('after_render:html', require('../../../node_modules/hexo/lib/plugins/filter/meta_generator'));
}
