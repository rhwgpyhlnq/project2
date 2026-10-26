sap.ui.define([
    "sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel", "sap/m/MessageBox",
    "sap/m/MessageToast", "sap/m/Label", "sap/m/Text", "sap/m/ObjectStatus",
    "sap/ui/table/Table", "sap/ui/table/Column", "sap/ui/table/rowmodes/Fixed",
    "sap/ui/export/Spreadsheet", "sap/m/SelectDialog", "sap/m/StandardListItem",
    "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "sap/ui/model/Sorter",
    "project2/model/ReportBuilder", "project2/model/ReportService"
], function (Controller, JSONModel, MessageBox, MessageToast, Label, Text, ObjectStatus,
    Table, Column, Fixed, Spreadsheet, SelectDialog, StandardListItem, Filter, FilterOperator,
    Sorter, ReportBuilder, ReportService) {
    "use strict";
    return Controller.extend("project2.controller.shipment", {
        onInit: function () {
            const now = new Date();
            const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
            const start = ReportBuilder.monday(today);
            this.getView().setModel(new JSONModel({
                plant: "1310", material: "PECU001", supplier: "", customers: "",
                dateFrom: start, dateTo: ReportBuilder.plusDays(start, 27),
                releaseFrom: today.slice(0, 4) + "-01-01", referenceDate: today
            }), "filters");
            this.getView().setModel(new JSONModel({
                busy: false, loaded: false, queryText: "请输入查询条件，点击查询。",
                tableTitle: "采购与销售日明细", resultText: "", warning: "", queriedAt: "",
                supplierText: "", showSummary: true
            }), "state");
            const report = new JSONModel({ rows: [], customers: [], summaries: [] });
            report.setSizeLimit(20000);
            this.getView().setModel(report, "report");
            this._purchases = [];
            this._sales = [];
            this._createTable([]);
        },
        formatQuantity: function (value) {
            if (value === null || value === undefined || value === "") { return "—"; }
            const parts = String(value).split(".");
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            return parts.join(".");
        },
        _validateFilters: function () {
            const f = Object.assign({}, this.getView().getModel("filters").getData());
            f.plant = f.plant.trim();
            f.material = f.material.trim();
            if (!f.plant || !f.material) { throw new Error("请输入工厂和单个物料。"); }
            ["dateFrom", "dateTo", "releaseFrom", "referenceDate"].forEach(key => {
                const control = this.byId(key);
                if (!control.getDateValue() || !/^\d{4}-\d{2}-\d{2}$/.test(f[key])) {
                    throw new Error("请填写有效的日期。");
                }
            });
            const span = (Date.parse(f.dateTo) - Date.parse(f.dateFrom)) / 86400000;
            if (span < 0 || span > 365) { throw new Error("开始日期不能晚于结束日期，单次查询最多覆盖 366 天。"); }
            return f;
        },
        onQuery: async function () {
            const state = this.getView().getModel("state");
            if (state.getProperty("/busy")) { return; }
            let filters;
            try { filters = this._validateFilters(); } catch (error) { MessageBox.error(error.message); return; }
            state.setProperty("/busy", true);
            state.setProperty("/loaded", false);
            state.setProperty("/resultText", "");
            state.setProperty("/warning", "");
            this.getView().getModel("report").setData({ rows: [], customers: [], summaries: [] });
            this._createTable([]);
            try {
                const model = this.getOwnerComponent().getModel();
                const results = await Promise.all([
                    ReportService.read(model, "PurchaseReport", filters),
                    ReportService.read(model, "SalesReport", filters)
                ]);
                this._queryFilters = filters;
                this._purchases = results[0];
                this._sales = results[1];
                this._apply(filters);
                state.setProperty("/queryText", filters.plant + " / " + filters.material + " · " + filters.dateFrom + " 至 " + filters.dateTo);
                state.setProperty("/queriedAt", new Date().toLocaleTimeString());
                state.setProperty("/loaded", true);
            } catch (error) {
                this._purchases = [];
                this._sales = [];
                state.setProperty("/queryText", "查询失败，请检查连接或查询条件后重试。");
                MessageBox.error("无法取得完整报表，未展示部分合计。\n" + (error.message || String(error)));
            } finally { state.setProperty("/busy", false); }
        },
        _apply: function (filters) {
            const result = ReportBuilder.build(this._purchases, this._sales, filters);
            this.getView().getModel("report").setData(result);
            this._createTable(result.customers);
            const state = this.getView().getModel("state");
            state.setProperty("/resultText", result.rows.length + " 个日期/单位组合 · " + result.customers.length + " 个客户");
            state.setProperty("/supplierText", filters.supplier ? "供应商：" + filters.supplier : "采购按所选单位合计全部供应商");
            state.setProperty("/warning", result.missingWeeks ? "部分业务日期没有年周，请同步后端日历映射版本。" : "");
        },
        onApplyPartners: function () {
            if (!this.getView().getModel("state").getProperty("/loaded")) { MessageToast.show("请先执行查询。"); return; }
            try {
                const filters = this._validateFilters();
                if (["plant", "material", "dateFrom", "dateTo", "releaseFrom"].some(key => filters[key] !== this._queryFilters[key])) {
                    throw new Error("查询条件已更改，请点击查询以刷新数据。");
                }
                this._apply(filters);
            } catch (error) { MessageBox.error(error.message); }
        },
        _createTable: function (customers) {
            if (this._table) { this.byId("matrixHost").removeItem(this._table); this._table.destroy(); }
            const columns = [
                { field: "period", label: "短期预测类型", group: "业务信息", span: 6, width: "7rem", status: true },
                { field: "material", label: "ECU Part Num", group: "业务信息", width: "9rem" },
                { field: "plant", label: "工厂", group: "业务信息", width: "4rem" },
                { field: "date", label: "业务日期", group: "业务信息", width: "7.5rem" },
                { field: "yearWeek", label: "年周", group: "业务信息", width: "6rem" },
                { field: "unit", label: "单位", group: "业务信息", width: "4rem" },
                { field: "purchasePlan", label: "原始计划数量", group: "采购", span: 2, width: "8rem", number: true },
                { field: "purchaseActual", label: "已收货数量", group: "采购", width: "8rem", number: true },
                { field: "salesPlan", label: "原始计划数量", group: "客户合计", span: 2, width: "8rem", number: true },
                { field: "salesActual", label: "已发货数量", group: "客户合计", width: "8rem", number: true }
            ];
            customers.forEach(customer => {
                columns.push(
                    { field: customer.key + "Date", label: "提货日", group: "客户 " + customer.id, span: 3, width: "7.5rem" },
                    { field: customer.key + "Plan", label: "原始计划数量", group: "客户 " + customer.id, width: "8rem", number: true },
                    { field: customer.key + "Actual", label: "已发货数量", group: "客户 " + customer.id, width: "8rem", number: true }
                );
            });
            this._columns = columns;
            this._table = new Table(this.createId("reportTable"), {
                width: "100%", selectionMode: "None", fixedColumnCount: 6,
                alternateRowColors: true, enableColumnReordering: false, rowHeight: 36,
                columnHeaderHeight: 34, rowMode: new Fixed({ rowCount: 13 }),
                noData: "当前没有数据。请执行查询，或调整日期、客户及供应商条件。"
            }).addStyleClass("shipmentTable");
            columns.forEach(column => {
                let template;
                if (column.status) {
                    template = new ObjectStatus({ text: "{report>period}", state: "{report>periodState}" });
                } else {
                    template = new Text({
                        text: column.number ? { path: "report>" + column.field, formatter: this.formatQuantity } : "{report>" + column.field + "}",
                        wrapping: false, width: "100%", textAlign: column.number ? "End" : "Begin",
                        tooltip: column.field.startsWith("purchase") ? "{report>suppliers}" : "{report>" + column.field + "}"
                    });
                }
                this._table.addColumn(new Column({
                    width: column.width, hAlign: column.number ? "End" : "Begin",
                    multiLabels: [new Label({ text: column.group, design: "Bold" }), new Label({ text: column.label })],
                    headerSpan: [column.span || 1, 1], sortProperty: column.field, filterProperty: column.field,
                    showFilterMenuEntry: !column.number, template: template
                }).data("quantity", !!column.number));
            });
            this._table.attachSort(this._onTableSort, this);
            this._table.bindRows("report>/rows");
            this.byId("matrixHost").addItem(this._table);
        },
        _onTableSort: function (event) {
            const column = event.getParameter("column");
            if (!column.data("quantity")) { return; }
            event.preventDefault();
            const descending = event.getParameter("sortOrder") === "Descending";
            const comparator = function (a, b) {
                if (a === null && b === null) { return 0; }
                if (a === null) { return 1; }
                if (b === null) { return -1; }
                const left = ReportBuilder.decimal(a);
                const right = ReportBuilder.decimal(b);
                return left < right ? -1 : left > right ? 1 : 0;
            };
            this._table.getColumns().forEach(c => c.setSorted(false));
            column.setSorted(true);
            column.setSortOrder(descending ? "Descending" : "Ascending");
            this._table.getBinding("rows").sort(new Sorter(column.getSortProperty(), descending, undefined, comparator));
        },
        onExport: async function () {
            const binding = this._table.getBinding("rows");
            const rows = binding.getContexts(0, binding.getLength()).map(context => context.getObject());
            if (!rows.length) { MessageToast.show("没有可导出的数据。"); return; }
            const columns = this._columns.map(column => {
                // Large decimal values remain text rather than losing digits in Excel's numeric type.
                const numeric = column.number && rows.every(row => row[column.field] === null ||
                    String(row[column.field]).replace(/[-.]/g, "").replace(/^0+/, "").length <= 15);
                return { label: column.group + " / " + column.label, property: column.field,
                    type: numeric ? "Number" : "String", scale: numeric ? 3 : undefined, width: 20 };
            });
            const spreadsheet = new Spreadsheet({
                workbook: { columns: columns, context: { sheetName: "采购与销售日报" } },
                dataSource: rows, fileName: "ECU采购销售日报_" + new Date().toISOString().slice(0, 10) + ".xlsx",
                worker: false
            });
            try { await spreadsheet.build(); } catch (error) { MessageBox.error("导出失败：" + error.message); }
            finally { spreadsheet.destroy(); }
        },
        onValueHelp: function (event) {
            const plant = event.getSource().getId().endsWith("--plant");
            const config = plant ? { path: "/PlantValueHelp", key: "Plant", text: "PlantName", filter: "plant", title: "选择工厂" } :
                { path: "/ProductValueHelp", key: "Product", text: "Product_Text", filter: "material", title: "选择物料" };
            const dialog = new SelectDialog({
                title: config.title, growingThreshold: 50,
                search: function (e) {
                    const value = e.getParameter("value");
                    e.getSource().getBinding("items").filter(value ? new Filter({
                        filters: [new Filter(config.key, FilterOperator.Contains, value), new Filter(config.text, FilterOperator.Contains, value)], and: false
                    }) : []);
                },
                confirm: e => {
                    const item = e.getParameter("selectedItem");
                    if (item) { this.getView().getModel("filters").setProperty("/" + config.filter, item.getBindingContext().getProperty(config.key)); }
                    dialog.destroy();
                },
                cancel: function () { dialog.destroy(); }
            });
            dialog.setModel(this.getOwnerComponent().getModel());
            dialog.bindAggregation("items", {
                path: config.path, parameters: { $$groupId: "$direct" },
                template: new StandardListItem({ title: "{" + config.key + "}", description: "{" + config.text + "}" })
            });
            this.getView().addDependent(dialog);
            dialog.open();
        },
        onExit: function () { if (this._table) { this._table.destroy(); } }
    });
});
