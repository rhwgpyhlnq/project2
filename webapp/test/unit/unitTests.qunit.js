/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require([
    "SHIPMENT_REPORT/test/unit/AllTests"
], function () {
    "use strict";

    QUnit.start();
});