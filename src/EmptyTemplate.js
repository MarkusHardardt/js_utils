(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Template = {};

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
