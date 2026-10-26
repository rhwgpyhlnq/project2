/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require([
    "project2/test/unit/AllTests"
], function () {
    "use strict";

    QUnit.start();
});