# 老叶子 · 站点云端内容管理 部署指引

环境已开通（**PostgreSQL 模式**，环境 ID `personal-web-d7gp7q673d30d0e04`）。
本指引用于「理解架构」与「日后重部署」；首次云化已在 `thou321` 账号下完成。

> 配置完成前，站点自动回退本地 `js/data.js`，照常能访问，不影响使用。

---

## 架构速览（务必先看）

- **数据库**：CloudBase PostgreSQL，表 `public.content`（不是文档型集合）。
- **公开读**：前端用 **Publishable Key（anon 角色）** 直连 PG REST API 读取；表上 RLS 策略 `content_public_read`（`FOR SELECT USING (true)`）允许匿名读。
- **管理写**：`#/admin` 页调用 `admin` 云函数，函数用 **service_role API Key** 直连 REST 写入（绕过 RLS），并校验管理密码。
- **为什么绕开 node-sdk**：`@cloudbase/node-sdk` 的 `rdb()` 会把**环境 ID 当成 schema 名**，导致 `Invalid schema: <envId>` 报错。因此 admin 函数与前端读都改为**直接 `fetch` REST**，不依赖 node-sdk（`package.json` 的 `dependencies` 为空）。

---

## 1. 数据库（已建好，仅重做时参考）

PostgreSQL 模式，执行 `cloudbase/migrations/` 里的建表 SQL 创建 `public.content`，并加公开读 RLS：

```sql
-- 允许匿名（Publishable Key）读取内容
CREATE POLICY content_public_read ON public.content FOR SELECT USING (true);
```

> 任何客户端都**不能直接写**；写操作只走 `admin` 云函数（service_role），保证安全。

## 2. 部署 admin 云函数（重部署重点）

1. 控制台「云函数」→ 新建，名称 `admin`，运行时 **Node.js 18**。
2. 上传 `cloudbase/functions/admin/index.js` 与 `package.json`
   （`dependencies: {}`，**不需要** node-sdk，纯 `fetch` REST）。
3. **配置环境变量（关键，漏了写库必失败）**：
   - `ADMIN_API_KEY` = 你的 **service_role / 服务端 API Key**
     （CloudBase「API Key 配置」里**非 anon、有权限写库**的那个 Key，**不是** Publishable Key）。写库就靠它。
   - `ADMIN_PASSWORD` = 管理密码，默认 `laoyezi2026`（可改）。
4. 保存并部署，状态变「正常」。

## 3. Publishable Key（已填好，仅重做时参考）

控制台「API Key 配置」生成 **Publishable Key（anon）**，已写入 `js/config.js` 的 `cloudbaseAccessKey`。
前端公开读用它；**切忌**把它当 `ADMIN_API_KEY` 用（anon 无权写）。

## 4. 使用管理页

- 站点地址加 `#/admin`，如 `https://你的域名/index.html#/admin`
- 输入管理密码（默认 `laoyezi2026`）进入，可**新增 / 编辑 / 删除**项目与博客，保存后前台即时生效。

> 管理页不公开入口，只有知道 `#/admin` 和密码的人能进。

---

## ⚠️ 上线前必配：CloudBase 网关 CORS（不配则云端读写全失效）

站点托管到 GitHub Pages 后，浏览器从 `https://thou321.github.io` **跨域**请求
CloudBase 网关（`*.api.tcloudbasegateway.com`）。若网关未放行该来源，浏览器会
拦截前端 `fetch`：

- **首页读不到云端数据** → 静默回退本地 `js/data.js`（后台改的内容看不到）
- **`#/admin` 写库失败**

> 此前本地 / 沙箱测试 REST 成功，是因为 node `fetch` 不受浏览器同源策略约束；
> 真正上线受 CORS 限制，**必须配**。

配置位置（控制台，二选一）：
- 环境「**安全配置 / 安全来源**」→ 添加 `https://thou321.github.io`
- 或网关 CORS 白名单直接设 `*`（`*` 仅建议开发期图省事，生产用精确来源）

---

## 部署站点本体到 GitHub Pages（`thou321` 账号）

前端是纯静态，已确认资源全为相对路径、hash 路由不依赖路径，放子路径
`/laoyezi/` 可正常工作，无需改代码。

1. **GitHub 新建仓库 `laoyezi`**（Public，不要勾选 README / .gitignore，保持空仓库）。
2. 本地仓库已初始化并提交（commit `51c94d8`），关联远程并推送：
   ```bash
   git remote add origin https://github.com/thou321/laoyezi.git
   git push -u origin main
   ```
   （推送需 GitHub 凭证；本机若已缓存 `thou321` 登录即可直推，否则按提示登录 / 填 token）
3. 仓库 **Settings → Pages** → Source 选 **Deploy from a branch**，
   Branch 选 **main** / 目录 **/ (root)** → Save。
4. 等待约 1 分钟构建，访问：
   - 前台：`https://thou321.github.io/laoyezi/`
   - 管理页：`https://thou321.github.io/laoyezi/#/admin`（密码 `laoyezi2026`）
5. **上线后务必先配上方「CORS」**，否则云端读写为空、管理页写不进。

### 其他托管（备选，未采用）
- **CloudBase 静态托管**：控制台「静态网站托管」上传本目录文件。
- **CloudStudio**：本地直接部署，拿外网链接。

---

## 本机 push 网络排错（国内常见）

`git push` 报 `Connection was reset` / `Could not connect to server`（github.com:443）：
国内直连 GitHub 常被重置；本沙箱环境同样出不了 GitHub，**只能在你本机解决**，且需让 git 走你访问 GitHub 用的代理。

1. 确认本机代理端口（常见：Clash / Clash Verge `7890`；V2RayN http `10809` / socks `10808`；SSR `1080`）。
2. 给 git 配代理后重试：
   ```bash
   git config --global http.proxy http://127.0.0.1:7890
   git config --global https.proxy http://127.0.0.1:7890
   git push -u origin main
   ```
3. 推完取消全局代理（避免影响其他仓库）：
   ```bash
   git config --global --unset http.proxy
   git config --global --unset https.proxy
   ```
4. 备选：改用 SSH（`git remote set-url origin git@github.com:thou321/laoyezi.git`，需本机 SSH key 已加入 GitHub）；或避开高峰期重试（reset 偶发）。

---

## 常见问题

- **管理页「密码错误」**：云函数环境变量 `ADMIN_PASSWORD` 与输入不一致。
- **能读但不能增 / 改 / 删**：`admin` 函数没配 `ADMIN_API_KEY`，或配成了 Publishable Key（anon 无权写）。
- **首页空白 / 还是本地数据**：F12 看 Console；多为 `config.js` 环境 ID / Key 填错，或 Publishable Key 无效。
- **只想先本地预览**：不填 `config.js` 即可，站点走本地 `js/data.js`，管理页会显示「云端尚未配置」提示。
