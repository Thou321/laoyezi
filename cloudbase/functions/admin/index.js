/* ============================================================
   老叶子 · 内容管理云函数（admin）— REST 直连 PostgreSQL 版
   绕过 node-sdk rdb 的 schema bug，直接用 CloudBase PG REST API。
   写操作使用 service_role API Key（云端环境变量 ADMIN_API_KEY）。
   密码：优先取环境变量 ADMIN_PASSWORD，否则用下方默认值。
   ============================================================ */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "laoyezi2026";
const API_KEY = process.env.ADMIN_API_KEY || "";
const ENV_ID = "personal-web-d7gp7q673d30d0e04";
const REST_BASE = "https://" + ENV_ID + ".api.tcloudbasegateway.com/v1/rdb/rest";

function authHdr() {
  return { Authorization: "Bearer " + API_KEY, "Content-Type": "application/json" };
}

/* 前端 camelCase -> 表列 snake_case */
function toRow(data) {
  return {
    type: data.type || "project",
    title: data.title || "",
    summary: data.summary || "",
    domain: data.domain || "",
    difficulty: data.difficulty || "",
    form: data.form || "",
    freshness: data.freshness || "",
    tags: Array.isArray(data.tags) ? data.tags : [],
    date: data.date || "",
    views: parseInt(data.views, 10) || 0,
    read_time: data.readTime || "",
    featured: !!data.featured,
    body: data.content || ""
  };
}

/* 表列 snake_case -> 前端 camelCase */
function toItem(row) {
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

async function restList() {
  const res = await fetch(REST_BASE + "/content", { headers: authHdr() });
  if (!res.ok) throw new Error("查询失败 " + res.status);
  const rows = await res.json();
  const items = (rows || []).map(toItem);
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return items;
}

async function restCreate(data) {
  const res = await fetch(REST_BASE + "/content", {
    method: "POST",
    headers: authHdr(),
    body: JSON.stringify([toRow(data)])
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("新增失败 " + res.status + " " + t);
  }
}

async function restUpdate(id, data) {
  const res = await fetch(REST_BASE + "/content?id=eq." + Number(id), {
    method: "PATCH",
    headers: authHdr(),
    body: JSON.stringify(toRow(data))
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("更新失败 " + res.status + " " + t);
  }
}

async function restRemove(id) {
  const res = await fetch(REST_BASE + "/content?id=eq." + Number(id), {
    method: "DELETE",
    headers: authHdr()
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("删除失败 " + res.status + " " + t);
  }
}

exports.main = async (event) => {
  const { action, password, id, data } = event || {};
  if (password !== ADMIN_PASSWORD) {
    return { code: 401, msg: "管理密码错误" };
  }
  try {
    if (action === "list") return { code: 0, data: await restList() };
    if (action === "create") { await restCreate(data || {}); return { code: 0 }; }
    if (action === "update") { await restUpdate(id, data || {}); return { code: 0 }; }
    if (action === "remove") { await restRemove(id); return { code: 0 }; }
    return { code: 400, msg: "未知操作：" + action };
  } catch (e) {
    return { code: 500, msg: e.message || "服务异常" };
  }
};
