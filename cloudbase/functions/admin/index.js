/* ============================================================
   老叶子站点 · admin 云函数（HTTP Web 函数）
   - 公开读：action=read（无需密码，给首页拉内容）
   - 管理写：action=list/create/update/remove（需密码，服务端用 service_role 写库）
   - 自带 CORS 响应头，跨域由函数自己处理，无需控制台白名单
   依赖：Node 18 全局 fetch（无需 node-sdk）
   ============================================================ */
"use strict";

// 环境 ID（公开信息，非密钥）
var ENV = "personal-web-d7gp7q673d30d0e04";
var REST = "https://" + ENV + ".api.tcloudbasegateway.com/v1/rdb/rest";

var ADMIN_KEY = process.env.ADMIN_API_KEY || "";      // service_role / 服务端 Key，云端环境变量
var ADMIN_PWD = process.env.ADMIN_PASSWORD || "laoyezi2026";

/* ---------- CORS ---------- */
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
}
function resp(status, obj, origin) {
  return { statusCode: status, headers: corsHeaders(origin), body: JSON.stringify(obj) };
}

/* ---------- 数据库（服务端 service_role，绕过 RLS 写） ---------- */
async function rest(method, path, body, extraHeaders) {
  if (!ADMIN_KEY) return { ok: false, status: 500, data: "ADMIN_API_KEY 未配置" };
  var headers = Object.assign({ Authorization: "Bearer " + ADMIN_KEY, "Content-Type": "application/json" }, extraHeaders || {});
  var r = await fetch(REST + path, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  });
  var text = await r.text();
  var data;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { ok: r.ok, status: r.status, data: data };
}

/* snake_case 行 -> 前端 camelCase 对象 */
function toItem(row) {
  if (!row) return row;
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

/* 前端 camelCase 对象 -> snake_case 行 */
function toRow(item) {
  item = item || {};
  return {
    type: item.type || "blog",
    title: item.title || "",
    summary: item.summary || "",
    domain: item.domain || "",
    difficulty: item.difficulty || "",
    form: item.form || "",
    freshness: item.freshness || "",
    tags: item.tags || [],
    date: item.date || "",
    views: parseInt(item.views, 10) || 0,
    read_time: item.readTime || "",
    featured: !!item.featured,
    body: item.content || ""
  };
}

/* ---------- 主入口（HTTP 触发） ---------- */
async function main(event) {
  var h = event.headers || {};
  var origin = h.origin || h.Origin || h.HTTP_ORIGIN || "*";

  // 预检
  if (event.httpMethod === "OPTIONS") return resp(204, "", origin);

  // 解析请求体
  var payload;
  try {
    payload = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || event.data || {});
  } catch (e) {
    return resp(400, { code: 1, msg: "无效请求体" });
  }
  if (!payload || typeof payload !== "object") return resp(400, { code: 1, msg: "无效请求" });

  var action = payload.action;

  // 公开读（首页用，不需密码）
  if (action === "read") {
    var r1 = await rest("GET", "/content");
    if (!r1.ok) return resp(500, { code: 1, msg: "读取失败：" + r1.status });
    var rows = Array.isArray(r1.data) ? r1.data : [];
    return resp(200, { code: 0, data: rows.map(toItem) });
  }

  // 以下操作需密码
  if (payload.password !== ADMIN_PWD) return resp(401, { code: 1, msg: "密码错误" });

  if (action === "list") {
    var r2 = await rest("GET", "/content");
    if (!r2.ok) return resp(500, { code: 1, msg: "读取失败：" + r2.status });
    var rows2 = Array.isArray(r2.data) ? r2.data : [];
    return resp(200, { code: 0, data: rows2.map(toItem) });
  }

  if (action === "create") {
    var r3 = await rest("POST", "/content", [toRow(payload.data)], { "Prefer": "return=representation" });
    if (!r3.ok) return resp(500, { code: 1, msg: "创建失败：" + r3.status });
    var created = Array.isArray(r3.data) ? r3.data[0] : r3.data;
    return resp(200, { code: 0, data: toItem(created) });
  }

  if (action === "update") {
    if (!payload.id) return resp(400, { code: 1, msg: "缺少 id" });
    var r4 = await rest("PATCH", "/content?id=eq." + encodeURIComponent(payload.id), toRow(payload.data));
    if (!r4.ok) return resp(500, { code: 1, msg: "更新失败：" + r4.status });
    var updated = Array.isArray(r4.data) ? r4.data[0] : r4.data;
    return resp(200, { code: 0, data: toItem(updated) });
  }

  if (action === "remove") {
    if (!payload.id) return resp(400, { code: 1, msg: "缺少 id" });
    var r5 = await rest("DELETE", "/content?id=eq." + encodeURIComponent(payload.id));
    if (!r5.ok) return resp(500, { code: 1, msg: "删除失败：" + r5.status });
    return resp(200, { code: 0, msg: "已删除" });
  }

  return resp(400, { code: 1, msg: "未知操作：" + action });
}

exports.main = main;
