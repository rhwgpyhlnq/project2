/*global QUnit*/

sap.ui.define([
	"project2/controller/shipment.controller"
], function (Controller) {
	"use strict";

	QUnit.module("shipment Controller");

	QUnit.test("I should test the shipment controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
