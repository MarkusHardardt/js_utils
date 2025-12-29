(function (root) {
    "use strict";
    const Template = {};
    const isNodeJS = typeof require === 'function';

    // TODO: Add content
    Template.content = {};

    /*  */
    (function () {
        Template.closureContent = {};
    }());


    Object.freeze(Template);
    if (isNodeJS) {
        module.exports = Template;
    } else {
        root.Template = Template;
    }
}(globalThis));
