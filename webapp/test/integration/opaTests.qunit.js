/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["SHIPMENT_REPORT/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
