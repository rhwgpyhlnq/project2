/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["project2/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
