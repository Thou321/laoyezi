/* ============================================================
   老叶子 · Agent 应用工程师 —— CloudBase 数据源层（PostgreSQL 版）
   公开读：直接调 CloudBase PG REST API（Publishable Key，默认 public schema）
   管理写：调用 admin 云函数（云端 service_role 写，密码校验）
   兜底：未配置 / 加载失败时返回 null，站点回退本地数据
   ============================================================ */
window.CloudSource = (function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var ENV = (cfg.cloudbaseEnv || "").trim();
  var ACCESS_KEY = (cfg.cloudbaseAccessKey || "").trim();
  var app = null;

  /* 公开读：只依赖 ENV + ACCESS_KEY（纯 fetch，不依赖 SDK）。
     这样即使 CloudBase JS SDK（CDN）加载失败，首页仍能用云端数据，不会无声回退本地。 */
  function readEnabled() {
    return !!(ENV && ACCESS_KEY);
  }

  /* 管理写：额外需要 CloudBase JS SDK（window.cloudbase）来 callFunction */
  function enabled() {
    return !!(ENV && ACCESS_KEY && typeof window.cloudbase !== "undefined");
  }

  function init() {
    if (app) return app;
    if (!enabled()) return null;
    app = window.cloudbase.init({ env: ENV, accessKey: ACCESS_KEY });
    return app;
  }

  function restBase() {
    return "https://" + ENV + ".api.tcloudbasegateway.com/v1/rdb/rest";
  }

  /* snake_case 行 -> 前端 camelCase 对象 */
  function normalizeRow(row) {
    return {
      id: String(row.id),
      type: row.type,
      title: row.title,
      summary: row.summary,
      domain: row.domain,
      difficulty: row.difficulty,
      form: row.form,
      freshness: row.freshness,
      tags: row.tags || [],
      date: row.date,
      views: row.views || 0,
      readTime: row.read_time || "",
      featured: !!row.featured,
      content: row.body || ""
    };
  }

  /* 公开读：拉取全部内容，失败返回 null（触发本地兜底） */
  async function fetchContent() {
    if (!ENV) return null;
    try {
      var res = await fetch(restBase() + "/content", {
        headers: { Authorization: "Bearer " + ACCESS_KEY }
      });
      if (!res.ok) return null;
      var rows = await res.json();
      if (Array.isArray(rows)) return rows.map(normalizeRow);
      return [];
    } catch (e) {
      return null;
    }
  }

  /* 管理写：统一走 admin 云函数（云端 service_role 写 + 密码校验） */
  async function callAdmin(action, password, payload) {
    var a = init();
    if (!a) throw new Error("云端未配置，请先在 js/config.js 填写环境 ID 与 Key");
    var r = await a.callFunction({
      name: "admin",
      data: Object.assign({ action: action, password: password }, payload || {})
    });
    var res = r && r.result;
    if (!res || res.code !== 0) {
      throw new Error((res && res.msg) || "操作失败");
    }
    return res;
  }

  return {
    enabled: enabled,
    readEnabled: readEnabled,
    fetchContent: fetchContent,
    callAdmin: callAdmin
  };
})();
