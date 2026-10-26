/*global QUnit*/
sap.ui.define(["project2/controller/shipment.controller"], function (Controller) {
    "use strict";
    QUnit.module("shipment Controller");
    QUnit.test("quantities preserve zero and distinguish missing values", function (assert) {
        const controller = new Controller();
        assert.strictEqual(controller.formatQuantity(null), "—");
        assert.strictEqual(controller.formatQuantity("0"), "0");
        assert.strictEqual(controller.formatQuantity("1234.125"), "1,234.125");
        controller.destroy();
    });
});
