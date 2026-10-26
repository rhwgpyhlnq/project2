const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function load(path) {
    let result;
    vm.runInNewContext(fs.readFileSync(path, "utf8"), { sap: { ui: { define: (_deps, factory) => { result = factory(); } } }, console });
    return result;
}
const builder = load("webapp/model/ReportBuilder.js");
const service = load("webapp/model/ReportService.js");
function row(overrides) {
    return Object.assign({ Material: "PECU001", Plant: "1310", Partner: "0013100001", DateFrom: "2026-10-19",
        DateTo: "2026-10-19", YearWeek: "202643", Metric: "PLAN", Quantity: "1.000", Unit: "EA" }, overrides);
}
const options = { referenceDate: "2026-10-19" };
test("daily union: independent suppliers/customers, no Cartesian multiplication, units and dates stay separate", () => {
    const result = builder.build([
        row({ Partner: "0001000411", Quantity: "10" }), row({ Partner: "0001000412", Quantity: "20" }),
        row({ Partner: "0001000411", Metric: "ACTUAL", Quantity: "0" }),
        row({ Partner: "0001000411", Unit: "BAG", Quantity: "2" })
    ], [
        row({ Quantity: "0.1" }), row({ Quantity: "0.2" }), row({ Partner: "0013100002", Quantity: "4" }),
        row({ Metric: "ACTUAL", Quantity: "3" }),
        row({ DateFrom: "2026-10-20", DateTo: "2026-10-20", Quantity: "7" }),
        row({ DateFrom: "2026-10-21", DateTo: "2026-10-21", Metric: "ACTUAL", Quantity: "5" })
    ], options);
    assert.equal(result.rows.length, 4);
    const first = result.rows.find(r => r.date === "2026-10-19" && r.unit === "EA");
    assert.equal(first.purchasePlan, "30");
    assert.equal(first.purchaseActual, "0");
    assert.equal(first.salesPlan, "4.3");
    assert.equal(first.c0Plan, "0.3");
    assert.equal(first.c1Plan, "4");
    assert.equal(result.rows.find(r => r.unit === "BAG").salesActual, null);
    assert.equal(result.rows.find(r => r.date === "2026-10-21").purchasePlan, null);
});
test("partner filters respect leading zeros and do not affect the other business", () => {
    const result = builder.build([row({ Partner: "0001000411" }), row({ Partner: "0001000412" })],
        [row({ Partner: "0013100001" }), row({ Partner: "0013100002" })],
        { referenceDate: "2026-10-19", supplier: "1000411", customers: "13100002" });
    assert.equal(result.customers.length, 1);
    assert.equal(result.customers[0].id, "0013100002");
    assert.equal(result.rows[0].purchasePlan, "1");
    assert.equal(result.rows[0].salesPlan, "1");
});
test("week buckets use Monday and the reference date, summaries remain split by unit", () => {
    const dates = ["2026-10-18", "2026-10-19", "2026-10-25", "2026-10-26", "2026-11-01", "2026-11-02"];
    const result = builder.build([], dates.map(d => row({ DateFrom: d, DateTo: d })), options);
    assert.equal(result.rows.map(r => r.period).join(","), "历史,本周,本周,下周,下周,两周以后");
    const total = result.summaries.find(r => r.partner === "全部客户");
    assert.equal(total.nearPlan, "4");
    assert.equal(total.laterPlan, "1");
    assert.equal(builder.monday("2027-01-01"), "2026-12-28");
});
test("keeps exact 23-digit decimals, negative/zero actuals, and null missing values", () => {
    const result = builder.build([], [row({ Quantity: "99999999999999999999.001" }), row({ Quantity: "0.002" }),
        row({ Metric: "ACTUAL", Quantity: "-2.5" })], options);
    assert.equal(result.rows[0].salesPlan, "99999999999999999999.003");
    assert.equal(result.rows[0].salesActual, "-2.5");
    assert.equal(result.rows[0].purchaseActual, null);
});
test("fails explicitly on incompatible granularity or malformed quantities", () => {
    assert.throws(() => builder.build([], [row({ DateTo: "2026-10-25" })], options), /多日/);
    assert.throws(() => builder.build([], [row({ Quantity: "NaN" })], options), /数量/);
    assert.throws(() => builder.build([], [row({ HasIssue: "X" })], options), /异常/);
    assert.throws(() => builder.build([], [row({ Unit: "" })], options), /单位/);
});
test("OData paths use Edm.Date literals and escaped parameter strings", () => {
    const path = service.path("SalesReport", { plant: "1310", material: "AB'C", dateFrom: "2026-10-19", dateTo: "2026-11-01", releaseFrom: "2026-01-01" });
    assert.equal(path, "/SalesReport(p_plant='1310',p_material='AB''C',p_date_from=2026-10-19,p_date_to=2026-11-01,p_release_from=2026-01-01)/Set");
});
test("loads every server page and destroys bindings even on a failed request", async () => {
    let destroyed = false;
    const offsets = [];
    const binding = {
        requestContexts: async (start, length) => {
            offsets.push(start);
            return Array.from({ length: Math.min(length, 701 - start) }, (_, i) => ({ getObject: () => ({ id: start + i }) }));
        },
        isLengthFinal: () => false, destroy: () => { destroyed = true; }
    };
    const filters = { plant: "1310", material: "A", dateFrom: "2026-10-19", dateTo: "2026-11-01", releaseFrom: "2026-01-01" };
    const rows = await service.read({ bindList: () => binding }, "PurchaseReport", filters);
    assert.equal(rows.length, 701);
    assert.deepEqual(offsets, [0, 500]);
    assert.equal(destroyed, true);
    destroyed = false;
    binding.requestContexts = async () => { throw new Error("offline"); };
    await assert.rejects(service.read({ bindList: () => binding }, "PurchaseReport", filters), /offline/);
    assert.equal(destroyed, true);
});
