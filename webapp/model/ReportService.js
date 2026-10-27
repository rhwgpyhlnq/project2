sap.ui.define([], function () {
    "use strict";
    function quoted(value) { return "'" + String(value).replace(/'/g, "''") + "'"; }
    function literal(value) { return encodeURIComponent(quoted(value)); }
    function path(entity, filters) {
        if (!["PurchaseReport", "SalesReport"].includes(entity)) { throw new Error("未知报表实体"); }
        return "/" + entity + "(p_plant=" + literal(filters.plant) +
            ",p_date_from=" + filters.dateFrom + ",p_date_to=" + filters.dateTo + ",p_release_from=" + filters.releaseFrom + ")/Set";
    }
    function selectionFilter(entity, filters) {
        if (!["PurchaseReport", "SalesReport"].includes(entity)) { throw new Error("未知报表实体"); }
        const materials = Array.from(new Set(filters.materials || []));
        if (!materials.length) { throw new Error("请选择至少一个物料。"); }
        function list(field, values) { return "(" + values.map(value => field + " eq " + quoted(value)).join(" or ") + ")"; }
        const clauses = [list("Material", materials)];
        const partners = Array.from(new Set((entity === "PurchaseReport" ? filters.suppliers : filters.customers) || []));
        if (partners.length) { clauses.push(list("Partner", partners)); }
        return clauses.join(" and ");
    }
    async function read(model, entity, filters) {
        const binding = model.bindList(path(entity, filters), undefined, undefined, undefined, {
            $$groupId: "$direct", $orderby: "RowNumber", $filter: selectionFilter(entity, filters),
            $select: "RowNumber,Material,Plant,Partner,DateFrom,DateTo,YearWeek,Metric,MetricText,Quantity,Unit,HasIssue,StatusText"
        });
        const result = [];
        try {
            while (true) {
                const contexts = await binding.requestContexts(result.length, 500);
                result.push(...contexts.map(context => context.getObject()));
                if (result.length > 10000) { throw new Error("结果超过 10000 行，请缩小查询日期范围。"); }
                if (contexts.length < 500 || (binding.isLengthFinal() && result.length >= binding.getLength())) { return result; }
            }
        } finally { binding.destroy(); }
    }
    return { path: path, selectionFilter: selectionFilter, read: read };
});
