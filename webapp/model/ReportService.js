sap.ui.define([], function () {
    "use strict";
    function literal(value) { return encodeURIComponent("'" + String(value).replace(/'/g, "''") + "'"); }
    function path(entity, filters) {
        if (!["PurchaseReport", "SalesReport"].includes(entity)) { throw new Error("未知报表实体"); }
        return "/" + entity + "(p_plant=" + literal(filters.plant) + ",p_material=" + literal(filters.material) +
            ",p_date_from=" + filters.dateFrom + ",p_date_to=" + filters.dateTo + ",p_release_from=" + filters.releaseFrom + ")/Set";
    }
    async function read(model, entity, filters) {
        const binding = model.bindList(path(entity, filters), undefined, undefined, undefined, {
            $$groupId: "$direct", $orderby: "RowNumber", $select: "RowNumber,Material,Plant,Partner,DateFrom,DateTo,YearWeek,Metric,MetricText,Quantity,Unit,HasIssue,StatusText"
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
    return { path: path, read: read };
});
