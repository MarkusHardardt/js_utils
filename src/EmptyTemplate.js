(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Template = {};

    // TODO: Add content
    Template.content = {};

    Object.freeze(Template);
    if (isNodeJS) {
        module.exports = Template;
    } else {
        root.Template = Template;
    }
}(globalThis));
