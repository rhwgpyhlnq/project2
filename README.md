# ECU 采购与销售发货报表

SAPUI5 Freestyle 日报页面，沿用已配置的 OData V4 服务和 BAS Destination：
- Service Binding：ZSB_SHIPMENT_REPORT
- Service Definition：ZUI_SHIPMENT_REPORT
- 两个参数化实体：PurchaseReport、SalesReport，分别读取参数实体下的 Set。
- BAS Destination：btp292；默认后端为 MY200292。没有改动 ADT 对象或部署到 S/4。

## 在 BAS 测试

代码推送后，在项目目录执行：

~~~bash
git status
git pull --ff-only origin main
npm ci
npm start
~~~

如 git status 显示你自己的源码修改，先保存或提交再 pull，不要 reset --hard。
单独预览页面可用 npm run start-noflp。先确认 BAS 的 btp292 Destination 能访问当前 Service Binding。
查询条件必须填写工厂、至少一个物料、开始/结束日期、采购发布创建起始日期。默认工厂 1310、物料 PECU001 仅为方便现有测试，可直接修改。日期默认本周一到未来四周，查询跨度不超过 366 天。
周分类基准日期默认打开页面当天，用它确定“历史 / 本周 / 下周 / 两周以后”；不会改变日汇总粒度。
物料、供应商、客户均使用 MultiInput 多选标签和 F4 搜索帮助；弹窗按编码或名称搜索，勾选后点击确定，取消不改变已选项。搜索或翻页不会丢失已选编码，也可以删除标签、直接输入多个编码（逗号、分号或空格分隔）。供应商和客户的纯数字手输编码补齐至 10 位；搜索帮助返回的编码保留前导零。工厂保持单选。

物料至少选一个，供应商/客户留空表示全部。修改条件后统一点击“查询”，将多值条件直接传给后端，不再提供仅筛选缓存的“应用客户 / 供应商”按钮。采购只传供应商，销售只传客户；同字段多个值以 OR 组合，不同字段以 AND 组合。

搜索帮助使用 PlantValueHelp、ProductValueHelp、SupplierValueHelp、CustomerValueHelp；后端必须同步 ZSHIPMENT 最新服务，移除 p_material 参数并暴露客户/供应商值帮助。物料通过 $filter=Material eq ... 传入，服务路径不再包含 p_material。

## 页面布局与 FS 的对应

- 左侧固定：短期预测类型、物料、工厂、业务日期、年周、单位。
- 中间：采购原始计划、已收货，以及所有选中客户的原始计划和已发货合计。
- 右侧：从销售结果动态生成每个客户的“提货日 / 原始计划数量 / 已发货数量”三列，多层分组表头、横向滚动。
- 上方：各客户及客户合计，分别显示查询区间已发货、本周及下周原始计划、两周以后原始计划。不同单位分卡展示。
- 表格按物料 + 工厂 + 业务日期 + 单位对齐，采购与销售独立累加后组合，不以一对多关联相乘。多供应商在所选条件下合计，采购单元格悬停显示涉及供应商编码。
- 数据仍是每日；年周读取实体 YearWeek，不恢复已删除的周汇总视图。
- “—”表示没有记录，零值仍显示 0。负数不擅自归零。
- Excel 导出包含当前表格筛选/排序后的全部结果和所有动态客户列；导出表头采用“分组 / 字段”扁平列名。普通数量作为数字导出，超过 Excel 15 位有效数字的数量整列按文本保留精度。

## 当前业务边界

FS 对采购 F4 定义为 ScheduledQuantity - ReceivedQuantity，但当前日报实体 PLAN 数量仍按后端原始计划口径返回，因此页面显示“原始计划数量”。本次没有在前端擅自改为未清量。
销售原始计划未扣减已发货，不直接标为未发货量、已确定或预估。按实际发货日减同日计划不能替代计划行交付关系，需要后端提供有效的业务指标。
FS A1/A9 要求不限查询日期累计，但当前两个日报实体实际量受日期参数限制。页面合计明确为“查询区间”，没有伪装成全历史累计。
客户名称暂未在实体中提供，显示客户编码。客户动态列来自查询区间内返回的销售记录，没有记录的客户不会自行补造。
本周及后续计划概览同样只统计查询日期内返回的数据，不自动扩大查询范围。

## 技术与验证

- ReportService.js：构造参数化 OData V4 导航路径，按 RowNumber 稳定排序，逐页完整加载；任一实体失败则不展示部分合计；最多 10000 行。
- ReportBuilder.js：行列转换、独立合计、单位隔离、客户/供应商过滤；使用三位小数的整数运算保留精度。
- shipment.controller.js / shipment.view.xml：真实 sap.ui.table.Table、查询区域、动态列、标准值帮助、sap.ui.export.Spreadsheet。
- 没有在生产页面放入测试业务数据，也没有向 S/4 写入业务数据。

~~~bash
npm run test:report
npm run lint -- --quiet
npm run build
~~~

验证覆盖同日合并、同周不同日期分开、客户/供应商独立筛选、多单位隔离、缺记录与零区别、精确小数、分页、失败清理和参数化日期路径。
本机用隔离的测试数据服务验证了真实 SAPUI5 渲染、三客户列、客户筛选、工厂值帮助和实际 Excel 下载；该测试服务不随项目提交。S/4 认证及真实单据结果仍需在 BAS Destination 下联调。

## 正式 Launchpad 入口与 IAM App

应用 ID、UI5 代码命名空间和 Launchpad 语义对象统一为 SHIPMENT_REPORT；manifest.json 的 inbound 为 SHIPMENT_REPORT-display，导航意图为 #SHIPMENT_REPORT-display。应用版本为 0.0.4。组件、视图、控制器、资源路径、预览入口及测试引用已同步调整，必须更新完整项目，不能只替换 manifest.json。

GitHub 仓库及 BAS 文件夹仍为 project2；npm 包名采用 shipment-report。部署目标仍为现有 BSP ZSHIPMENT、包 ZSHIPMENT，不创建另一个 BSP。

如果 ADT 中只有 BSP 应用 ZSHIPMENT，却在 IAM App 的 Fiori Launchpad App Descr Item ID 搜索帮助中查不到入口：
1. 在 BAS 拉取本次配置，运行 npm run deploy，重新部署到现有 ZSHIPMENT BSP 应用及 ZSHIPMENT 包。
2. 确认部署结束成功，再刷新 ADT 的 ZSHIPMENT 包，寻找生成的 Launchpad App Descriptor Item（UIAD）。
3. 在 IAM App 的搜索帮助中选择该 UIAD 的实际技术名称。不要将 BSP 名称、sap.app.id 或 inbound 键值当作必然相同的技术名称填写。
4. 保存并 Publish Locally IAM App，继续将 IAM App 分配到 Business Catalog，并发布；最终的角色及页面分配由有权限的管理员完成。

修改文件或只运行 npm start 不会在 ABAP 后端创建 UIAD；必须重新部署。本次修改没有替用户部署到 S/4，也没有修改 IAM 或角色权限。

参考：
- https://help.sap.com/docs/bas/developing-sap-fiori-app-in-sap-business-application-studio/sap-fiori-launchpad-configuration
- https://help.sap.com/docs/ABAP_PLATFORM_NEW/b5670aaaa2364a29935f40b16499972d/2f4b3efeefaf4dcb87bcf5aa32863a74.html

