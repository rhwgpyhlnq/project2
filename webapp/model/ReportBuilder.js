sap.ui.define([], function () {
    "use strict";
    function code(value) { return String(value || "").trim().replace(/^0+(?=\d)/, ""); }
    function date(value) {
        const text = String(value || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text + "T00:00:00Z"))) {
            throw new Error("业务日期无效，请检查报表实体返回的数据。");
        }
        return text;
    }
    function decimal(value) {
        const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(String(value).trim());
        if (!match) { throw new Error("数量格式无效或超过三位小数：" + value); }
        return BigInt(match[2] + (match[3] || "").padEnd(3, "0")) * (match[1] ? -1n : 1n);
    }
    function amount(value) {
        const sign = value < 0n ? "-" : "";
        const digits = (value < 0n ? -value : value).toString().padStart(4, "0");
        const fraction = digits.slice(-3).replace(/0+$/, "");
        return sign + digits.slice(0, -3) + (fraction ? "." + fraction : "");
    }
    function add(target, field, value) {
        target[field] = amount(decimal(target[field] === null || target[field] === undefined ? "0" : target[field]) + decimal(value));
    }
    function monday(reference) {
        const d = new Date(date(reference) + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
        return d.toISOString().slice(0, 10);
    }
    function plusDays(value, days) {
        const d = new Date(date(value) + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    }
    function period(value, start) {
        if (value < start) { return { text: "历史", state: "None" }; }
        if (value < plusDays(start, 7)) { return { text: "本周", state: "Information" }; }
        if (value < plusDays(start, 14)) { return { text: "下周", state: "Success" }; }
        return { text: "两周以后", state: "Warning" };
    }
    function parseCodes(value) { return String(value || "").split(/[,，;；\s]+/).filter(Boolean).map(code); }
    function build(purchases, sales, options) {
        const settings = options || {};
        const customersFilter = parseCodes(settings.customers);
        const supplierFilter = code(settings.supplier);
        const start = monday(settings.referenceDate);
        const selectedPurchases = purchases.filter(r => !supplierFilter || code(r.Partner) === supplierFilter);
        const selectedSales = sales.filter(r => !customersFilter.length || customersFilter.includes(code(r.Partner)));
        const customerIds = Array.from(new Set(selectedSales.map(r => String(r.Partner).trim()))).sort();
        const customers = customerIds.map((id, index) => ({ id: id, key: "c" + index }));
        const keys = new Map(customers.map(c => [c.id, c.key]));
        const rows = new Map();
        const summaries = new Map();
        let missingWeeks = 0;
        function summary(unit, partner) {
            const key = JSON.stringify([unit, partner]);
            if (!summaries.has(key)) {
                summaries.set(key, { unit: unit, partner: partner, plan: null, actual: null, nearPlan: null, laterPlan: null });
            }
            return summaries.get(key);
        }
        function read(source, isSales) {
            source.forEach(r => {
                if (r.HasIssue && String(r.HasIssue).trim()) { throw new Error("报表数据存在异常，请先核对后端返回的口径说明。"); }
                const day = date(r.DateFrom || r.PostingDate);
                if (r.DateTo && date(r.DateTo) !== day) { throw new Error("实体返回了多日汇总，请先同步每日汇总版本。"); }
                const unit = String(r.Unit || "").trim();
                if (!unit) { throw new Error("存在没有数量单位的记录，无法合并。"); }
                const metric = String(r.Metric || "").trim();
                if (!["PLAN", "ACTUAL"].includes(metric)) { throw new Error("未识别的指标：" + metric); }
                const key = JSON.stringify([r.Material, r.Plant, day, unit]);
                if (!rows.has(key)) {
                    const p = period(day, start);
                    const row = { material: r.Material, plant: r.Plant, date: day, yearWeek: "", unit: unit,
                        period: p.text, periodState: p.state, purchasePlan: null, purchaseActual: null,
                        salesPlan: null, salesActual: null, suppliers: "" };
                    customers.forEach(c => { row[c.key + "Date"] = ""; row[c.key + "Plan"] = null; row[c.key + "Actual"] = null; });
                    rows.set(key, row);
                }
                const row = rows.get(key);
                const week = String(r.YearWeek || "").trim();
                if (week) {
                    const formatted = /^\d{6}$/.test(week) ? week.slice(0, 4) + "-" + week.slice(4) : week;
                    if (row.yearWeek && row.yearWeek !== formatted) { throw new Error("同一业务日期返回了不同年周，请检查日历映射。"); }
                    row.yearWeek = formatted;
                } else { missingWeeks++; }
                const quantity = amount(decimal(r.Quantity));
                if (isSales) {
                    const customerKey = keys.get(String(r.Partner).trim());
                    add(row, metric === "PLAN" ? "salesPlan" : "salesActual", quantity);
                    add(row, customerKey + (metric === "PLAN" ? "Plan" : "Actual"), quantity);
                    row[customerKey + "Date"] = day;
                    [summary(unit, "全部客户"), summary(unit, String(r.Partner).trim())].forEach(total => {
                        add(total, metric === "PLAN" ? "plan" : "actual", quantity);
                        if (metric === "PLAN" && day >= start) { add(total, day < plusDays(start, 14) ? "nearPlan" : "laterPlan", quantity); }
                    });
                } else {
                    add(row, metric === "PLAN" ? "purchasePlan" : "purchaseActual", quantity);
                    const partners = row.suppliers ? row.suppliers.split("、") : [];
                    if (!partners.includes(r.Partner)) { partners.push(r.Partner); row.suppliers = partners.sort().join("、"); }
                }
            });
        }
        read(selectedPurchases, false);
        read(selectedSales, true);
        const sorted = Array.from(rows.values()).sort((a, b) => a.material.localeCompare(b.material) || a.plant.localeCompare(b.plant) || a.date.localeCompare(b.date) || a.unit.localeCompare(b.unit));
        return { rows: sorted, customers: customers,
            summaries: Array.from(summaries.values()).sort((a, b) => a.unit.localeCompare(b.unit) || (a.partner === "全部客户" ? -1 : b.partner === "全部客户" ? 1 : a.partner.localeCompare(b.partner))),
            purchaseCount: selectedPurchases.length, salesCount: selectedSales.length, missingWeeks: missingWeeks };
    }
    return { build: build, parseCodes: parseCodes, monday: monday, plusDays: plusDays, decimal: decimal, amount: amount };
});
