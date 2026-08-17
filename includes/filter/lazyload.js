/* global hexo */
/*
 * 原生图片懒加载: 给渲染输出中的 <img> 补 loading="lazy" decoding="async"
 * (已有 loading 属性的跳过; 现代浏览器原生支持, 无需 JS 懒加载库)
 */
module.exports = function (hexo) {
    hexo.extend.filter.register('after_render:html', (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/<img\b(?![^>]*\bloading=)([^>]*)>/gi, '<img$1 loading="lazy" decoding="async">');
    });
};
