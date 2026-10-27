sap.ui.define([
    "sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel", "sap/m/MessageBox",
    "sap/m/MessageToast", "sap/m/Label", "sap/m/Text", "sap/m/ObjectStatus",
    "sap/ui/table/Table", "sap/ui/table/Column", "sap/ui/table/rowmodes/Fixed",
    "sap/ui/export/Spreadsheet", "sap/m/Dialog", "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem",
    "sap/m/Button", "sap/m/SearchField", "sap/m/VBox",
    "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "sap/ui/model/Sorter",
    "SHIPMENT_REPORT/model/ReportBuilder", "SHIPMENT_REPORT/model/ReportService"
], function (Controller, JSONModel, MessageBox, MessageToast, Label, Text, ObjectStatus,
    Table, Column, Fixed, Spreadsheet, Dialog, HelpTable, HelpColumn, ColumnListItem,
    Button, SearchField, VBox, Filter, FilterOperator,
    Sorter, ReportBuilder, ReportService) {
    "use strict";
    return Controller.extend("SHIPMENT_REPORT.controller.shipment", {
        onInit: function () {
            const now = new Date();
            const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
            const start = ReportBuilder.monday(today);
            this.getView().setModel(new JSONModel({
                plant: "1310", materials: [{ key: "PECU001", text: "PECU001" }], suppliers: [], customers: [],
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
            ["material", "supplier", "customers"].forEach(id => this._commitSelectionInput(this.byId(id)));
            const selections = this.getView().getModel("filters");
            ["materials", "suppliers", "customers"].forEach(field => { f[field] = selections.getProperty("/" + field).map(item => item.key); });
            if (!f.plant || !f.materials.length) { throw new Error("请输入工厂，并选择至少一个物料。"); }
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
                state.setProperty("/queryText", filters.plant + " / " + filters.materials.join("、") + " · " + filters.dateFrom + " 至 " + filters.dateTo);
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
            state.setProperty("/supplierText", filters.suppliers.length ? "供应商：" + filters.suppliers.join("、") : "采购按所选单位合计全部供应商");
            state.setProperty("/warning", result.missingWeeks ? "部分业务日期没有年周，请同步后端日历映射版本。" : "");
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
        _selectionConfig: function (input) {
            return {
                plant: { path: "/PlantValueHelp", key: "Plant", text: "PlantName", field: "plant", title: "选择工厂", single: true },
                material: { path: "/ProductValueHelp", key: "Product", text: "Product_Text", field: "materials", title: "选择物料", length: 40 },
                supplier: { path: "/SupplierValueHelp", key: "Supplier", text: "SupplierName", field: "suppliers", title: "选择供应商", length: 10 },
                customers: { path: "/CustomerValueHelp", key: "Customer", text: "CustomerName", field: "customers", title: "选择客户", length: 10 }
            }[input.getId().split("--").pop()];
        },
        _commitSelectionInput: function (input) {
            const value = input.getValue().trim();
            if (!value) { return; }
            const config = this._selectionConfig(input);
            const codes = Array.from(new Set(value.split(/[,，;；\s]+/).filter(Boolean)));
            if (codes.some(code => code.length > config.length)) { throw new Error(config.title.slice(2) + "编码过长，请使用搜索帮助选择。"); }
            const model = this.getView().getModel("filters");
            const selected = new Map(model.getProperty("/" + config.field).map(item => [item.key, item]));
            codes.forEach(code => {
                const key = config.length === 10 && /^\d+$/.test(code) ? code.padStart(10, "0") : code;
                if (!selected.has(key)) { selected.set(key, { key: key, text: key }); }
            });
            model.setProperty("/" + config.field, Array.from(selected.values()));
            input.setValue("");
            input.setValueState("None");
        },
        onSelectionInputChange: function (event) {
            try { this._commitSelectionInput(event.getSource()); }
            catch (error) { event.getSource().setValueState("Error"); MessageBox.error(error.message); }
        },
        onTokenUpdate: function (event) {
            if (event.getParameter("type") !== "removed") { return; }
            const config = this._selectionConfig(event.getSource());
            const removed = new Set(event.getParameter("removedTokens").map(token => token.getKey()));
            const model = this.getView().getModel("filters");
            event.preventDefault();
            model.setProperty("/" + config.field, model.getProperty("/" + config.field).filter(item => !removed.has(item.key)));
        },
        onValueHelp: function (event) {
            const input = event.getSource();
            const config = this._selectionConfig(input);
            if (!config.single) {
                try { this._commitSelectionInput(input); } catch (error) { MessageBox.error(error.message); return; }
            }
            const model = this.getView().getModel("filters");
            const staged = new Map(config.single ? [] : model.getProperty("/" + config.field).map(item => [item.key, item]));
            const table = new HelpTable({
                mode: config.single ? "SingleSelectLeft" : "MultiSelect", includeItemInSelection: true, growing: true, growingThreshold: 50,
                rememberSelections: false, busyIndicatorDelay: 0, noDataText: "没有匹配记录，请调整搜索条件。",
                columns: [new HelpColumn({ header: new Label({ text: "编码" }), width: "12rem" }),
                    new HelpColumn({ header: new Label({ text: "名称" }) })],
                selectionChange: e => {
                    if (config.single) { staged.clear(); }
                    e.getParameter("listItems").forEach(item => {
                        const context = item.getBindingContext();
                        const key = context.getProperty(config.key);
                        const description = context.getProperty(config.text);
                        if (e.getParameter("selected")) { staged.set(key, { key: key, text: description ? description + " (" + key + ")" : key }); }
                        else { staged.delete(key); }
                    });
                },
                updateFinished: () => {
                    table.getItems().forEach(item => {
                        const context = item.getBindingContext();
                        if (context) { table.setSelectedItem(item, staged.has(context.getProperty(config.key))); }
                    });
                }
            });
            table.setModel(this.getOwnerComponent().getModel());
            table.bindItems({ path: config.path,
                parameters: { $$groupId: "$direct", $select: config.key + "," + config.text, $orderby: config.key },
                template: new ColumnListItem({ cells: [new Text({ text: "{" + config.key + "}" }), new Text({ text: "{" + config.text + "}" })] })
            });
            const search = new SearchField({ placeholder: "输入编码或名称，按回车搜索", search: e => {
                const value = e.getParameter("query").trim();
                table.getBinding("items").filter(value ? new Filter({ filters: [
                    new Filter(config.key, FilterOperator.Contains, value), new Filter(config.text, FilterOperator.Contains, value)
                ], and: false }) : []);
            } });
            const dialog = new Dialog({
                title: config.title + (config.single ? "" : "（可多选）"), contentWidth: "44rem", contentHeight: "28rem", resizable: true, draggable: true,
                content: [new VBox({ items: [search, table] })],
                beginButton: new Button({ text: "确定", type: "Emphasized", press: () => {
                    if (config.single) { const first = staged.values().next().value; if (first) { model.setProperty("/plant", first.key); } }
                    else { model.setProperty("/" + config.field, Array.from(staged.values())); }
                    dialog.close();
                } }),
                endButton: new Button({ text: "取消", press: () => dialog.close() }),
                afterClose: () => { this._helpDialog = null; dialog.destroy(); }
            });
            this.getView().addDependent(dialog);
            this._helpDialog = dialog;
            dialog.open();
        },
        onExit: function () { if (this._helpDialog) { this._helpDialog.destroy(); } if (this._table) { this._table.destroy(); } }
    });
});
