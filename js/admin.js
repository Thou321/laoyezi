/* ============================================================
   老叶子 · Agent 应用工程师 —— 内容管理页（#/admin）
   密码门 + 内容列表 + 新增/编辑/删除。写操作走 admin 云函数。
   ============================================================ */
window.Admin = (function () {
  "use strict";

  var PWD_KEY = "lyz_admin_pwd";
  var DOMAINS = ["Agent应用开发", "大模型工程", "智能体实践", "自动化工作流"];
  var DIFFICULTIES = ["入门", "进阶", "实战深耕"];
  var FORMS = ["项目实战", "技术随笔", "教程复盘", "经验总结"];
  var FRESHNESS = ["最新更新", "近期更新", "历史内容"];

  var pwd = "";
  var list = [];
  var editing = null; // null=新增，对象=编辑

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function $(sel) { return document.querySelector(sel); }

  /* ---------- 视图：入口 ---------- */
  function render() {
    var app = $("#app");
    if (!window.CloudSource || !window.CloudSource.enabled()) {
      app.innerHTML = unconfiguredHtml();
      return;
    }
    pwd = sessionStorage.getItem(PWD_KEY) || "";
    if (pwd) {
      loadList();
    } else {
      renderLogin();
    }
  }

  function unconfiguredHtml() {
    return (
      '<div class="detail-wrap fade-up">' +
        '<h1 class="page-title">内容管理</h1>' +
        '<div class="callout warn admin-callout">云端尚未配置。请先在 <code>js/config.js</code> 填入 CloudBase 环境 ID 与 Publishable Key，并在控制台部署 <code>admin</code> 云函数。详见 <code>DEPLOY.md</code>。</div>' +
        '<a class="empty-action" href="#/home">← 返回首页</a>' +
      "</div>"
    );
  }

  /* ---------- 视图：密码门 ---------- */
  function renderLogin() {
    $("#app").innerHTML =
      '<div class="detail-wrap fade-up admin-wrap">' +
        '<h1 class="page-title">内容管理</h1>' +
        '<p class="page-desc">请输入管理密码进入（密码在 CloudBase 云函数中校验）。</p>' +
        '<div class="admin-login">' +
          '<input type="password" id="admin-pwd" placeholder="管理密码" autocomplete="off">' +
          '<button class="empty-action" id="admin-login-btn">进入管理</button>' +
        "</div>" +
        '<div class="admin-msg" id="admin-msg"></div>' +
        '<a class="back-link" href="#/home">← 返回首页</a>' +
      "</div>";

    $("#admin-login-btn").addEventListener("click", doLogin);
    $("#admin-pwd").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
  }

  async function doLogin() {
    var v = $("#admin-pwd").value.trim();
    if (!v) { msg("请输入密码"); return; }
    try {
      await window.CloudSource.callAdmin("list", v, {});
      sessionStorage.setItem(PWD_KEY, v);
      pwd = v;
      await loadList();
    } catch (e) {
      msg(e.message || "密码错误");
    }
  }

  function msg(t) {
    var el = $("#admin-msg");
    if (el) el.textContent = t;
  }

  /* ---------- 数据 ---------- */
  async function loadList() {
    try {
      var res = await window.CloudSource.callAdmin("list", pwd, {});
      list = res.data || [];
      renderList();
    } catch (e) {
      // 密码失效等
      sessionStorage.removeItem(PWD_KEY);
      pwd = "";
      renderLogin();
    }
  }

  /* ---------- 视图：列表 ---------- */
  function renderList() {
    var rows = list.map(function (d) {
      var badge = d.type === "project"
        ? '<span class="type-badge project">项目</span>'
        : '<span class="type-badge blog">博客</span>';
      return (
        '<tr>' +
          '<td>' + badge + "</td>" +
          '<td class="admin-title">' + esc(d.title) + "</td>" +
          '<td>' + esc(d.date || "") + "</td>" +
          '<td class="admin-ops">' +
            '<button class="admin-btn" data-edit="' + esc(d._id || d.id) + '">编辑</button>' +
            '<button class="admin-btn danger" data-del="' + esc(d._id || d.id) + '">删除</button>' +
          "</td>" +
        "</tr>"
      );
    }).join("");

    $("#app").innerHTML =
      '<div class="detail-wrap fade-up admin-wrap">' +
        '<div class="admin-head">' +
          '<h1 class="page-title">内容管理</h1>' +
          '<div class="admin-actions">' +
            '<button class="empty-action" id="admin-new">+ 新增内容</button>' +
            '<button class="admin-btn" id="admin-logout">退出</button>' +
          "</div>" +
        "</div>" +
        '<p class="page-desc">共 <strong>' + list.length + "</strong> 条内容，改动实时同步到线上。</p>" +
        (list.length
          ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
            "<th>类型</th><th>标题</th><th>日期</th><th>操作</th></tr></thead><tbody>" + rows + "</tbody></table></div>"
          : '<div class="empty-state"><div class="empty-title">还没有内容</div><div class="empty-desc">点右上角「+ 新增内容」开始。</div></div>') +
        '<a class="back-link" href="#/home">← 返回首页</a>' +
      "</div>";

    $("#admin-new").addEventListener("click", function () { openForm(null); });
    $("#admin-logout").addEventListener("click", function () {
      sessionStorage.removeItem(PWD_KEY); pwd = ""; renderLogin();
    });
    document.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-edit");
        openForm(list.find(function (d) { return (d._id || d.id) === id; }));
      });
    });
    document.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-del");
        if (confirm("确定删除这条内容？删除后不可恢复。")) doRemove(id);
      });
    });
  }

  /* ---------- 视图：表单 ---------- */
  function openForm(item) {
    editing = item;
    var d = item || {};
    var tags = (d.tags || []).join(", ");
    var opts = function (arr, cur) {
      return arr.map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === cur ? " selected" : "") + ">" + esc(o) + "</option>";
      }).join("");
    };
    var typeOpts = '<option value="project"' + (d.type !== "blog" ? " selected" : "") + ">项目</option>" +
      '<option value="blog"' + (d.type === "blog" ? " selected" : "") + ">博客文章</option>";

    $("#app").innerHTML =
      '<div class="detail-wrap fade-up admin-wrap">' +
        '<h1 class="page-title">' + (item ? "编辑内容" : "新增内容") + "</h1>" +
        '<form class="admin-form" id="admin-form">' +
          '<div class="form-grid">' +
            formField("分类", '<select id="f-type" class="f-input">' + typeOpts + "</select>") +
            formField("标题 *", '<input id="f-title" class="f-input" value="' + esc(d.title || "") + '" placeholder="标题">') +
            formField("领域", '<select id="f-domain" class="f-input"><option value="">—</option>' + opts(DOMAINS, d.domain) + "</select>") +
            formField("难度", '<select id="f-difficulty" class="f-input"><option value="">—</option>' + opts(DIFFICULTIES, d.difficulty) + "</select>") +
            formField("形式", '<select id="f-form" class="f-input"><option value="">—</option>' + opts(FORMS, d.form) + "</select>") +
            formField("新鲜度", '<select id="f-freshness" class="f-input"><option value="">—</option>' + opts(FRESHNESS, d.freshness) + "</select>") +
            formField("标签", '<input id="f-tags" class="f-input" value="' + esc(tags) + '" placeholder="逗号分隔，如 RAG, 向量数据库">') +
            formField("日期", '<input id="f-date" class="f-input" value="' + esc(d.date || "") + '" placeholder="2026-08-26">') +
            formField("浏览数", '<input id="f-views" class="f-input" type="number" value="' + esc(d.views || 0) + '">') +
            formField("阅读时长", '<input id="f-readTime" class="f-input" value="' + esc(d.readTime || "") + '" placeholder="博客用，如 8 分钟">') +
            formField("精选", '<label class="f-check"><input id="f-featured" type="checkbox"' + (d.featured ? " checked" : "") + "> 首页精选展示</label>") +
          "</div>" +
          '<div class="form-field full"><label>摘要</label><textarea id="f-summary" class="f-input" rows="3" placeholder="一句话摘要">' + esc(d.summary || "") + "</textarea></div>" +
          '<div class="form-field full"><label>正文（HTML）</label><textarea id="f-content" class="f-input mono" rows="12" placeholder="支持 h2/p/ul/pre 等 HTML">' + esc(d.content || "") + "</textarea></div>" +
          '<div class="form-actions">' +
            '<button type="button" class="admin-btn" id="f-cancel">取消</button>' +
            '<button type="submit" class="empty-action">保存</button>' +
          "</div>" +
        "</form>" +
        '<div class="admin-msg" id="admin-msg"></div>' +
      "</div>";

    $("#f-cancel").addEventListener("click", function () { renderList(); });
    $("#admin-form").addEventListener("submit", function (e) {
      e.preventDefault();
      doSave();
    });
  }

  function formField(label, inner) {
    return '<div class="form-field"><label>' + label + "</label>" + inner + "</div>";
  }

  function readForm() {
    var tags = $("#f-tags").value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
    return {
      type: $("#f-type").value,
      title: $("#f-title").value.trim(),
      summary: $("#f-summary").value.trim(),
      domain: $("#f-domain").value,
      difficulty: $("#f-difficulty").value,
      form: $("#f-form").value,
      freshness: $("#f-freshness").value,
      tags: tags,
      date: $("#f-date").value.trim(),
      views: parseInt($("#f-views").value, 10) || 0,
      readTime: $("#f-readTime").value.trim(),
      featured: $("#f-featured").checked,
      content: $("#f-content").value
    };
  }

  async function doSave() {
    var data = readForm();
    if (!data.title) { msg("标题不能为空"); return; }
    try {
      if (editing) {
        await window.CloudSource.callAdmin("update", pwd, { id: editing._id || editing.id, data: data });
      } else {
        await window.CloudSource.callAdmin("create", pwd, { data: data });
      }
      // 保存成功 → 让公开页刷新数据并回到首页
      if (window.App && window.App.refresh) window.App.refresh();
    } catch (e) {
      msg(e.message || "保存失败");
    }
  }

  async function doRemove(id) {
    try {
      await window.CloudSource.callAdmin("remove", pwd, { id: id });
      if (window.App && window.App.refresh) window.App.refresh();
    } catch (e) {
      msg(e.message || "删除失败");
    }
  }

  return { render: render };
})();
