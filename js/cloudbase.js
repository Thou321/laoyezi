/* ============================================================
   老叶子 · Agent 应用工程师 —— 数据源层（HTTP 云函数版）
   读 / 写统一走 admin 云函数的 HTTP 访问地址（纯 fetch，无 SDK、无 anon key）
   - 读：action=read（公开）
   - 写：action=list/create/update/remove（密码保护，函数内用 service_role 写库）
   兜底：未配置 / 加载失败时返回 null，站点回退本地 data.js
   ============================================================ */
window.CloudSource = (function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var FUNC_URL = (cfg.cloudbaseFunctionUrl || "").trim();

  /* 是否已配置云端（只需函数地址） */
  function enabled() { return !!FUNC_URL; }
  function readEnabled() { return !!FUNC_URL; }

  /* 统一 POST 到云函数 */
  async function post(action, payload) {
    var r = await fetch(FUNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    if (!r.ok) throw new Error("网络错误 " + r.status);
    var res = await r.json();
    if (!res || res.code !== 0) throw new Error((res && res.msg) || "操作失败");
    return res;
  }

  /* 公开读：拉取全部内容（函数已返回 camelCase，直接可用） */
  async function fetchContent() {
    if (!FUNC_URL) return null;
    try {
      var res = await post("read");
      return Array.isArray(res.data) ? res.data : [];
    } catch (e) {
      return null; /* 回退本地 */
    }
  }

  /* 管理写：统一走云函数（密码在 payload 内传递） */
  async function callAdmin(action, password, payload) {
    if (!FUNC_URL) throw new Error("云端未配置，请先在 js/config.js 填写 cloudbaseFunctionUrl");
    return await post(action, Object.assign({ password: password }, payload || {}));
  }

  return {
    enabled: enabled,
    readEnabled: readEnabled,
    fetchContent: fetchContent,
    callAdmin: callAdmin
  };
})();
