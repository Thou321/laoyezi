# 老叶子 · 站点云端内容管理 部署指引

环境已开通（**PostgreSQL 模式**，环境 ID `personal-web-d7gp7q673d30d0e04`，上海，体验版）。
本指引用于「理解架构」与「日后重部署」。

> 配置完成前，站点自动回退本地 `js/data.js`，照常能访问，不影响使用。

---

## 架构速览（务必先看）

- **数据库**：CloudBase PostgreSQL，表 `public.content`（不是文档型集合），公开读 RLS。
- **读 / 写统一走 `admin` 云函数**：
  - 公开读：`action=read`（无需密码），函数用 service_role 读库后返回内容。
  - 管理写：`action=list/create/update/remove`（**需管理密码**），函数用 service_role 写库。
- **函数形态**：Event 云函数（Nodejs18.15，`index.main` 返回 `{statusCode,headers,body}`），
  通过 CloudBase **HTTP 网关路由**（`upstreamResourceType=SCF`，路径 `/admin`，关闭网关鉴权）暴露成公网 HTTP 端点。
  - 线上地址：`https://personal-web-d7gp7q673d30d0e04-1304006270.ap-shanghai.app.tcloudbase.com/admin`
- **前端零密钥**：站点只配置一个 `cloudbaseFunctionUrl`（云函数 HTTP 地址），
  不需要 anon Key、不需要 service_role Key 出现在前端、不需要 CloudBase JS SDK。
- **CORS 由函数自己处理 + 网关透传**：函数在响应头发 `Access-Control-Allow-Origin`，
  HTTP 网关把函数响应头原样透传，**无需去控制台配白名单**。
- **为什么绕开 node-sdk**：`@cloudbase/node-sdk` 的 `rdb()` 会把**环境 ID 当成 schema 名**
  导致 `Invalid schema`，因此改用纯 `fetch` REST（`package.json` 的 `dependencies` 为空）。

---

## 1. 数据库（已建好，仅重做时参考）

PostgreSQL 模式，执行 `cloudbase/migrations/` 里的建表 SQL 创建 `public.content`，并加公开读 RLS：

```sql
CREATE POLICY content_public_read ON public.content FOR SELECT USING (true);
```

> 任何客户端都**不能直接写**；写操作只走 `admin` 云函数（service_role），保证安全。

## 2. 部署 admin 云函数（重部署重点）

> 关键：函数是 **Event 函数**，靠 **HTTP 网关路由** 暴露，不是「HTTP Web 函数」（后者要 scf_bootstrap，更麻烦）。

### 方式 A（推荐，已验证）：用 CloudBase 连接器（MCP）一键部署
连接器已在本机连好（账号级登录，环境已绑定）。依次执行：
1. `manageFunctions` `deleteFunction`（`functionName=admin`，`confirm=true`）
2. `manageFunctions` `createFunction`：`func={name:"admin", type:"Event", runtime:"Nodejs18.15", handler:"index.main", envVariables:{ADMIN_API_KEY, ADMIN_PASSWORD}}`，
   `functionRootPath` 指向 `cloudbase/functions`（含 `admin/` 子目录）；
   - `ADMIN_API_KEY` = service_role / 服务端 API Key（控制台「API Key 配置」里有权限写库的那把，**不是** Publishable Key）
   - `ADMIN_PASSWORD` = 管理密码，默认 `laoyezi2026`
3. `manageGateway` `enableService`（`enable=true`）开启 HTTP 网关
4. `manageGateway` `createRoute`：`upstreamResourceType=SCF`、`targetName=admin`、`path=/admin`、`auth=false`
   → 拿到函数公网地址，填回 `js/config.js` 的 `cloudbaseFunctionUrl`

### 方式 B（兜底）：控制台手动
云函数 → 新建 `admin`（Node.js 18）→ 上传 `cloudbase/functions/admin/` 下 `index.js` + `package.json`
→ 配环境变量 `ADMIN_API_KEY` / `ADMIN_PASSWORD` → 开通 HTTP 访问服务并建 `/admin` 路由（关闭鉴权）
→ 复制地址填 `config.js`。

## 3. 前端配置（只需填函数地址）

`js/config.js`：

```js
window.SITE_CONFIG = {
  cloudbaseEnv: "personal-web-d7gp7q673d30d0e04",
  cloudbaseFunctionUrl: "https://personal-web-d7gp7q673d30d0e04-1304006270.ap-shanghai.app.tcloudbase.com/admin"
};
```

> 留空则站点回退本地 `js/data.js`，前台照常显示，管理页提示「云端尚未配置」。

## 4. 使用管理页

- 站点地址加 `#/admin`，如 `https://thou321.github.io/laoyezi/#/admin`
- 输入管理密码（默认 `laoyezi2026`）进入，可**新增 / 编辑 / 删除**项目与博客，保存后前台即时生效。

> 管理页不公开入口，只有知道 `#/admin` 和密码的人能进。

---

## 5. 跨域（CORS）：函数自带 + 网关透传，控制台零配置

前端从 `https://thou321.github.io` 跨域调用 `admin` 函数。实测结论：
- 函数对 **预检 OPTIONS** 精确回显 `Access-Control-Allow-Origin: https://thou321.github.io`；
  对实际请求回 `*`（`*` 对非凭证请求同样合法）。
- HTTP 网关**原样透传**函数的 CORS 响应头，浏览器跨域放行。
- 因此**不需要**在控制台配安全域名 / 白名单。
- 注意：体验版下 `envDomainManagement` 的「添加安全域名」会被套餐拦截
  （`CreateAuthDomain 当前套餐无法执行此操作`），但这**不影响**本方案——安全域名是给 CloudBase JS SDK 用的，
  本项目前端已不加载 SDK，故无影响。

---

## 6. 部署站点本体到 GitHub Pages（`thou321` 账号）

前端纯静态，资源全为相对路径、hash 路由不依赖路径，放子路径 `/laoyezi/` 正常，无需改代码。

1. **GitHub 新建仓库 `laoyezi`**（Public，不要勾选 README / .gitignore，保持空仓库）。
2. 本机运行推送脚本（复用 `xiaoshou/.github_token`，走代理绕过 git 的 Connection reset）：
   ```bash
   cd C:\Users\ASUS\Desktop\myweb\laoyezi
   python deploy_github.py
   ```
   末尾显示 `成功 13 / 失败 0` 即推送成功。
3. 仓库 **Settings → Pages** → Source 选 **Deploy from a branch**，
   Branch 选 **main** / 目录 **/ (root)** → Save。
4. 等待约 1 分钟，访问：
   - 前台：`https://thou321.github.io/laoyezi/`
   - 管理页：`https://thou321.github.io/laoyezi/#/admin`（密码 `laoyezi2026`）

> 改了站点代码 / `config.js` 后，重新跑 `python deploy_github.py` 即可，无需动 git。

---

## 常见问题

- **管理页「云端尚未配置」**：`config.js` 的 `cloudbaseFunctionUrl` 为空。
- **管理页「密码错误」**：云函数环境变量 `ADMIN_PASSWORD` 与输入不一致。
- **能进后台但增 / 改 / 删报「失败」**：`admin` 函数没配 `ADMIN_API_KEY`，或配成了 Publishable Key（anon 无权写）。
- **前台看不到后台改的内容**：先 F12 看 Network 里 `admin` 请求是否 200；若为跨域报错，确认函数地址与网关路由仍在。
- **只想先本地预览**：不填 `config.js` 即可，站点走本地 `js/data.js`，管理页显示「云端尚未配置」提示。
