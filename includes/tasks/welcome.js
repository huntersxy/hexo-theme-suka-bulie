const loggerFactory = require('hexo-log');
const logger = typeof loggerFactory === 'function' ? loggerFactory() : loggerFactory.logger();

logger.info(`--------------------------------------------------------
 ____        _           _____ _
/ ___| _   _| | ____ _  |_   _| |__   ___ _ __ ___   ___
\\___ \\| | | | |/ / _\` |   | | | '_ \\ / _ \\ '_ \` _ \\ / _ \\
 ___) | |_| |   < (_| |   | | | | | |  __/ | | | | |  __/
|____/ \\__,_|_|\\_\\__,_|   |_| |_| |_|\\___|_| |_| |_|\\___|

hexo-theme-suka ( https://theme-suka.skk.moe )
--------------------------------------------------------------`);
