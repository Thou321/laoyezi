/* ============================================================
   老叶子 · Agent 应用工程师 —— 站点配置
   填好下面两项即可启用云端内容管理（CloudBase）。
   留空则站点自动回退到本地 js/data.js，仍可正常访问。
   ============================================================ */
window.SITE_CONFIG = {
  // CloudBase 云开发环境 ID（仅作记录，前端实际只用到下面的函数地址）
  cloudbaseEnv: "personal-web-d7gp7q673d30d0e04",

  // admin 云函数的 HTTP 访问地址（由 CloudBase 连接器 / 控制台 HTTP 网关给出）：
  // 留空则站点自动回退到本地 js/data.js，仍可正常访问，但 #/admin 后台不可用。
  cloudbaseFunctionUrl: "https://personal-web-d7gp7q673d30d0e04-1304006270.ap-shanghai.app.tcloudbase.com/admin"
};
