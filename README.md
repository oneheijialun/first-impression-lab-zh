# 第一印象实验室 · 完整项目

[打开在线实验](https://first-impression-lab-zh.oneheijialun63.chatgpt.site/) · [研究后台](https://first-impression-lab-zh.oneheijialun63.chatgpt.site/admin)

本仓库保存当前在线版本对应的完整源码、本地启动服务、七张实验素材、眼动脚本与本地模型、数据库迁移和自动检查。根目录 index.html 为在线实验入口；实验界面和后台源码位于 public/。

本地使用 Node.js 22.13 或更新版本，完整下载并解压后双击 start.cmd，无需安装 npm 依赖。后台可通过“打开研究后台.cmd”进入，管理口令见启动窗口。本地服务的数据写入本机 SQLite；在线实验的数据写入在线 D1。具体操作见[使用说明](使用说明.md)。

源码基于已发布项目提交 e4c7b678aca7158ff3a5f6eed7fa05ab9b101292。眼动验证要求平均误差严格小于500 px。被试数据、管理口令、运行环境凭证和生成缓存均由运行环境单独保存。


公开 HTTPS 实验页面：参与者无需安装或登录。电脑使用 Chrome / Edge，允许摄像头，首次校准与验证平均误差严格小于 500 px 后进入实验；失败必须重验，后续不逐图验证。图间提示身体头部不动，仅眼睛移动；最后展示个人六张热图。

摄像头画面不录制、不保存、不上传。视线坐标、时间和问卷结果存入在线 D1 数据库。研究后台位于 /admin，使用站点所有者的 ChatGPT 账号登录，普通参与者无法查看研究数据。管理者身份由平台认证头和服务端 ADMIN_OWNER_EMAIL 配置核验，不把账号或口令写入前端。

后台包括被试与时间、逐图作答、个人 / 全体 / 2s·5s·10s 分组热图、路径与回放、九宫格占比、可恢复眼动排除、日志及 CSV / JSON 导出。

源代码：public 为实验与后台界面，worker/research-api.mjs 为在线数据接口，db/schema.ts 和 drizzle 为数据库模式与迁移。WebGazer 与模型随 public 提供，许可见 public/vendor。

本地 start.cmd / 打开研究后台.cmd 仍用于独立本机 SQLite 服务；在线参与者不需要下载或启动这些文件。

检查：node verify-cloud.mjs、node verify-eye.mjs、node verify-research.mjs、node verify-admin-ui.mjs。500 px 为本项目设定的预试阈值，摄像头估计视线仍需针对实际设备预试。
