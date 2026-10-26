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
查询条件必须填写工厂、单个物料、开始/结束日期、采购发布创建起始日期。默认工厂 1310、物料 PECU001 仅为方便现有测试，可直接修改。日期默认本周一到未来四周，查询跨度不超过 366 天。
周分类基准日期默认打开页面当天，用它确定“历史 / 本周 / 下周 / 两周以后”；不会改变日汇总粒度。
供应商可留空；客户编码可留空或输入多个，以逗号、分号或空格分隔。编码比较允许省略前导零。点击“应用客户 / 供应商”在完整已加载结果上重新筛选；修改工厂、物料或查询日期后应重新点击“查询”。
工厂、物料使用已暴露的 PlantValueHelp、ProductValueHelp 搜索帮助。供应商及客户暂以编码输入，未假设服务提供了对应值帮助或名称。

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

manifest.json 已补充 sap.app.crossNavigation.inbounds["project2-display"]，导航意图为 project2-display，保持现有 BAS 预览意图一致，应用 ID 仍为 project2。应用版本更新到 0.0.2。

如果 ADT 中只有 BSP 应用 ZSHIPMENT，却在 IAM App 的 Fiori Launchpad App Descr Item ID 搜索帮助中查不到入口：
1. 在 BAS 拉取本次配置，运行 npm run deploy，重新部署到现有 ZSHIPMENT BSP 应用及 ZSHIPMENT 包。
2. 确认部署结束成功，再刷新 ADT 的 ZSHIPMENT 包，寻找生成的 Launchpad App Descriptor Item（UIAD）。
3. 在 IAM App 的搜索帮助中选择该 UIAD 的实际技术名称。不要将 BSP 名称、sap.app.id 或 inbound 键值当作必然相同的技术名称填写。
4. 保存并 Publish Locally IAM App，继续将 IAM App 分配到 Business Catalog，并发布；最终的角色及页面分配由有权限的管理员完成。

修改文件或只运行 npm start 不会在 ABAP 后端创建 UIAD；必须重新部署。本次修改没有替用户部署到 S/4，也没有修改 IAM 或角色权限。

参考：
- https://help.sap.com/docs/bas/developing-sap-fiori-app-in-sap-business-application-studio/sap-fiori-launchpad-configuration
- https://help.sap.com/docs/ABAP_PLATFORM_NEW/b5670aaaa2364a29935f40b16499972d/2f4b3efeefaf4dcb87bcf5aa32863a74.html

