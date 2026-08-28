/* ============================================================
   老叶子 · Agent 应用工程师 —— 站点交互逻辑
   路由 / 搜索筛选 / 收藏 / 渲染
   ============================================================ */
(function () {
  "use strict";

  var DATA = window.DATA || [];

  /* ---------- 常量 ---------- */
  var DOMAINS = ["Agent应用开发", "大模型工程", "智能体实践", "自动化工作流"];
  var DIFFICULTIES = ["入门", "进阶", "实战深耕"];
  var FORMS = ["项目实战", "技术随笔", "教程复盘", "经验总结"];
  var FRESHNESS = ["最新更新", "近期更新", "历史内容"];

  var ALL_TAGS = (function () {
    var s = {};
    DATA.forEach(function (d) { (d.tags || []).forEach(function (t) { s[t] = 1; }); });
    return Object.keys(s);
  })();

  var FAV_KEY = "laoyezi_favs";

  /* ---------- 全局状态 ---------- */
  var state = {
    type: "all",        // all | project | blog（仅首页生效）
    domain: "all",
    difficulty: "all",
    form: "all",
    freshness: "all",
    tags: {},           // {tag: true}
    search: ""
  };

  var currentView = "home";       // home | projects | blog | favorites | detail
  var currentFixedType = null;    // project | blog | null
  var lastListView = "#/home";

  /* ---------- 工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* 后台正文允许少量排版标签，其他标签和危险属性一律剥离 */
  function safeContent(html, fallback) {
    if (!html) return "<p>" + esc(fallback || "") + "</p>";
    var template = document.createElement("template");
    template.innerHTML = String(html);
    var allowed = {
      P: 1, H2: 1, H3: 1, H4: 1, UL: 1, OL: 1, LI: 1,
      STRONG: 1, EM: 1, CODE: 1, PRE: 1, BLOCKQUOTE: 1,
      A: 1, BR: 1, DIV: 1, SPAN: 1
    };
    Array.prototype.slice.call(template.content.querySelectorAll("*")).forEach(function (el) {
      if (!allowed[el.tagName]) {
        el.replaceWith(document.createTextNode(el.textContent || ""));
        return;
      }
      var originalClass = el.className || "";
      var originalHref = el.getAttribute("href") || "";
      var originalTitle = el.getAttribute("title") || "";
      Array.prototype.slice.call(el.attributes).forEach(function (attr) { el.removeAttribute(attr.name); });
      if (el.tagName === "DIV" && /^(callout (tip|warn))$/.test(originalClass)) {
        el.className = originalClass;
      }
      if (el.tagName === "A" && /^(https?:|mailto:|#)/i.test(originalHref)) {
        el.setAttribute("href", originalHref);
        if (originalTitle) el.setAttribute("title", originalTitle);
        if (/^https?:/i.test(originalHref)) {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
    });
    return template.innerHTML;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ---------- 收藏（localStorage） ---------- */
  function getFavs() {
    try {
      var arr = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveFavs(arr) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function isFav(id) { return getFavs().indexOf(id) > -1; }
  function toggleFav(id) {
    var arr = getFavs();
    var i = arr.indexOf(id);
    if (i > -1) arr.splice(i, 1); else arr.push(id);
    saveFavs(arr);
    updateFavBadge();
    return i === -1; // true = 已收藏
  }
  function updateFavBadge() {
    var n = getFavs().length;
    var badge = $("#fav-badge");
    if (!badge) return;
    badge.textContent = n;
    badge.hidden = n === 0;
  }

  /* ---------- 数据查询 ---------- */
  function findById(id) {
    for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return DATA[i];
    return null;
  }
  function filterData() {
    var kw = state.search.trim().toLowerCase();
    var type = currentFixedType || state.type;
    var activeTags = Object.keys(state.tags).filter(function (k) { return state.tags[k]; });

    return DATA.filter(function (d) {
      if (type !== "all" && d.type !== type) return false;
      if (state.domain !== "all" && d.domain !== state.domain) return false;
      if (state.difficulty !== "all" && d.difficulty !== state.difficulty) return false;
      if (state.form !== "all" && d.form !== state.form) return false;
      if (state.freshness !== "all" && d.freshness !== state.freshness) return false;
      if (activeTags.length && !(d.tags || []).some(function (t) { return state.tags[t]; })) return false;
      if (kw) {
        var hay = (d.title + " " + d.summary + " " + d.domain + " " + d.difficulty + " " +
          d.form + " " + d.freshness + " " + (d.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    });
  }

  /* ---------- 徽章 ---------- */
  function dimClass(val, kind) {
    if (kind === "difficulty") {
      if (val === "入门") return "beginner";
      if (val === "进阶") return "adv";
      return "master";
    }
    if (kind === "fresh") {
      if (val === "最新更新") return "new";
      if (val === "近期更新") return "recent";
      return "old";
    }
    return "";
  }

  function starSvg(on) {
    return '<svg viewBox="0 0 24 24" width="17" height="17" fill="' + (on ? "var(--fav)" : "none") +
      '" stroke="currentColor" stroke-width="2" stroke-linejoin="round">' +
      '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';
  }
  function favStarHtml(id) {
    var on = isFav(id);
    var label = on ? "取消收藏" : "收藏";
    return '<button class="fav-btn' + (on ? " on" : "") + '" data-fav="' + esc(id) +
      '" aria-label="' + label + '" aria-pressed="' + on + '">' + starSvg(on) + "</button>";
  }

  function cardHtml(d) {
    var typeBadge = d.type === "project"
      ? '<span class="type-badge project">项目</span>'
      : '<span class="type-badge blog">博客</span>';
    var tags = (d.tags || []).slice(0, 3).map(function (t) {
      return '<span class="ctag">' + esc(t) + "</span>";
    }).join("");
    var meta = d.type === "blog" && d.readTime ? (esc(d.date) + " · " + esc(d.readTime)) : esc(d.date);

    return (
      '<article class="res-card fade-up" data-id="' + esc(d.id) + '">' +
        '<div class="card-top">' + typeBadge + favStarHtml(d.id) + "</div>" +
        '<h3 class="card-title"><a class="card-link" href="#/detail/' + esc(d.id) + '">' + esc(d.title) + "</a></h3>" +
        '<p class="card-summary">' + esc(d.summary) + "</p>" +
        '<div class="card-tags">' + tags + "</div>" +
        '<div class="card-foot">' +
          '<div class="foot-left">' +
            '<span class="dim-badge domain">' + esc(d.domain) + "</span>" +
            '<span class="dim-badge difficulty ' + dimClass(d.difficulty, "difficulty") + '">' + esc(d.difficulty) + "</span>" +
            '<span class="dim-badge fresh ' + dimClass(d.freshness, "fresh") + '">' + esc(d.freshness) + "</span>" +
          "</div>" +
          '<span>' + meta + "</span>" +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- 空状态 ---------- */
  function emptyHtml(title, desc, actionLabel, actionHash) {
    return (
      '<div class="empty-state fade-up">' +
        '<div class="empty-icon">☆</div>' +
        '<div class="empty-title">' + esc(title) + "</div>" +
        '<div class="empty-desc">' + esc(desc) + "</div>" +
        (actionHash ? '<a class="empty-action" href="' + esc(actionHash) + '">' + esc(actionLabel) + " →</a>" : "") +
      "</div>"
    );
  }

  /* ---------- 工具栏片段 ---------- */
  function segHtml() {
    return ['all', 'project', 'blog'].map(function (v) {
      var label = v === "all" ? "全部" : (v === "project" ? "项目" : "博客");
      var active = (currentFixedType || state.type) === v ? " active" : "";
      return '<button class="type-seg-btn' + active + '" data-type="' + v + '" aria-pressed="' + (active ? "true" : "false") + '">' + label + "</button>";
    }).join("");
  }
  function selectHtml(key, label, options, current) {
    var opts = ['<option value="all">全部' + label + "</option>"]
      .concat(options.map(function (o) {
        return '<option value="' + esc(o) + '"' + (current === o ? " selected" : "") + ">" + esc(o) + "</option>";
      }));
    return '<div class="filter-select" title="按' + label + '筛选"><select data-filter="' + key + '" aria-label="' + label + '">' + opts.join("") + "</select></div>";
  }
  function tagChipsHtml() {
    var chips = ALL_TAGS.map(function (t) {
      var active = !!state.tags[t];
      return '<button class="tag-chip' + (active ? " active" : "") + '" data-tag="' + esc(t) + '" aria-pressed="' + active + '">' + esc(t) + "</button>";
    });
    return '<div class="tag-row"><span class="tag-label">标签</span>' + chips.join("") + "</div>";
  }
  function toolbarHtml() {
    var seg = currentFixedType ? "" : '<div class="type-seg">' + segHtml() + "</div>";
    return (
      '<div class="toolbar">' +
        '<div class="toolbar-row">' +
          '<div class="search-box"><span class="search-icon">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>' +
            '</span>' +
            '<input type="search" id="search-input" placeholder="搜索项目、博文、标签、技术栈…" value="' + esc(state.search) + '" aria-label="搜索"></div>' +
          seg +
          selectHtml("domain", "领域", DOMAINS, state.domain) +
          selectHtml("difficulty", "难度", DIFFICULTIES, state.difficulty) +
          selectHtml("form", "形式", FORMS, state.form) +
          selectHtml("freshness", "新鲜度", FRESHNESS, state.freshness) +
          '<button class="clear-btn" id="clear-filters" type="button">清空筛选</button>' +
        "</div>" +
        tagChipsHtml() +
      "</div>"
    );
  }

  /* ---------- 结果区 ---------- */
  function renderResults() {
    var box = $("#results");
    if (!box) return;
    var list = filterData();
    box.innerHTML =
      '<div class="result-meta"><span class="result-count" role="status" aria-live="polite">共 <strong>' + list.length + "</strong> 条内容</span></div>" +
      (list.length
        ? '<div class="card-grid">' + list.map(cardHtml).join("") + "</div>"
        : emptyHtml("没有找到相关内容", "换个关键词，或调整一下筛选条件试试，说不定有惊喜。"));
    bindCardEvents(box);
  }

  function syncControlsUI() {
    // 更新分段按钮高亮
    $all(".type-seg-btn").forEach(function (b) {
      var active = b.getAttribute("data-type") === (currentFixedType || state.type);
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
    // 更新标签 chip 高亮
    $all(".tag-chip").forEach(function (c) {
      var active = !!state.tags[c.getAttribute("data-tag")];
      c.classList.toggle("active", active);
      c.setAttribute("aria-pressed", active);
    });
  }

  function resetFilters() {
    state.type = "all";
    state.domain = "all";
    state.difficulty = "all";
    state.form = "all";
    state.freshness = "all";
    state.tags = {};
    state.search = "";
    var si = $("#search-input");
    if (si) si.value = "";
    syncControlsUI();
    renderResults();
  }

  /* ---------- 事件绑定 ---------- */
  function bindListEvents() {
    var si = $("#search-input");
    if (si) {
      si.addEventListener("input", debounce(function () {
        state.search = si.value;
        renderResults();
      }, 180));
    }
    $all(".type-seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.type = b.getAttribute("data-type");
        syncControlsUI();
        renderResults();
      });
    });
    $all('[data-filter]').forEach(function (sel) {
      sel.addEventListener("change", function () {
        state[sel.getAttribute("data-filter")] = sel.value;
        renderResults();
      });
    });
    $all(".tag-chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var tag = c.getAttribute("data-tag");
        state.tags[tag] = !state.tags[tag];
        syncControlsUI();
        renderResults();
      });
    });
    var clear = $("#clear-filters");
    if (clear) clear.addEventListener("click", resetFilters);
  }

  function bindCardEvents(scope) {
    $all(".fav-btn", scope).forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-fav");
        var nowFav = toggleFav(id);
        btn.classList.toggle("on", nowFav);
        btn.setAttribute("aria-pressed", nowFav);
        btn.setAttribute("aria-label", nowFav ? "取消收藏" : "收藏");
        var svg = btn.querySelector("svg");
        if (svg) svg.setAttribute("fill", nowFav ? "var(--fav)" : "none");
        btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
        if (currentView === "favorites" && !nowFav) {
          var card = btn.closest(".res-card");
          if (card) {
            card.style.transition = "opacity .22s, transform .22s";
            card.style.opacity = "0";
            card.style.transform = "scale(.96)";
            setTimeout(renderFavorites, 200);
          }
        }
      });
    });
    $all(".res-card", scope).forEach(function (card) {
      function openCard(e) {
        if (e.target.closest(".fav-btn, .card-link")) return;
        location.hash = "#/detail/" + card.getAttribute("data-id");
      }
      card.addEventListener("click", openCard);
    });
  }

  /* ---------- 首页 Bento ---------- */
  function byDateDesc(a, b) { return (b.date || "").localeCompare(a.date || ""); }
  function byViewsDesc(a, b) { return (b.views || 0) - (a.views || 0); }

  function miniItemHtml(d) {
    var meta = d.type === "blog" && d.readTime ? esc(d.date) + " · " + esc(d.readTime) : esc(d.date);
    return (
      '<a class="mini-item" data-id="' + esc(d.id) + '" href="#/detail/' + esc(d.id) + '" aria-label="查看：' + esc(d.title) + '">' +
        '<span class="dot"></span>' +
        '<div class="mi-body"><div class="mi-title">' + esc(d.title) + "</div>" +
        '<div class="mi-meta">' + meta + "</div></div>" +
      "</a>"
    );
  }

  function renderHome() {
    var projects = DATA.filter(function (d) { return d.type === "project"; });
    var blogs = DATA.filter(function (d) { return d.type === "blog"; });
    var featured = projects.filter(function (d) { return d.featured; }).slice(0, 3);
    var recent = DATA.slice().sort(byDateDesc).slice(0, 4);
    var newBlogs = blogs.slice().sort(byDateDesc).slice(0, 4);
    var popular = DATA.slice().sort(byViewsDesc).slice(0, 4);

    var featuredHtml = featured.map(function (d) {
      return (
        '<a class="featured-item" data-id="' + esc(d.id) + '" href="#/detail/' + esc(d.id) + '" aria-label="查看：' + esc(d.title) + '">' +
          '<span class="fi-icon">◇</span>' +
          '<div class="fi-body"><div class="fi-title">' + esc(d.title) + "</div>" +
          '<div class="fi-meta">' + esc(d.domain) + " · " + esc(d.difficulty) + "</div></div>" +
          (isFav(d.id) ? '<span class="fi-fav">★</span>' : "") +
        "</a>"
      );
    }).join("");

    $("#app").innerHTML =
      '<div class="bento fade-up">' +
        '<section class="bento-card bento-intro">' +
          '<div class="intro-eyebrow"><span class="signal-dot" aria-hidden="true"></span>AGENT SYSTEMS / ENGINEERING</div>' +
          '<h1 class="intro-name">让智能体从 Demo<br><span>进入真实生产。</span></h1>' +
          '<span class="intro-role">老叶子 · Agent 应用工程师</span>' +
          '<div class="intro-text">' +
            "<p>我是老叶子，一名专注于落地实践的 Agent 应用工程师。深耕大模型智能体开发、自动化工作流搭建、AI 工程化落地领域，专注把各类大模型能力从 demo 转化为可落地、可复用、高效率的工程化应用。</p>" +
            "<p>本站用于沉淀个人实战项目、技术复盘、踩坑经验与工程思考，记录 Agent 应用开发的成长轨迹，分享可落地、可复用的 AI 工程实践方案。</p>" +
          "</div>" +
          '<div class="intro-skills"><div class="skill-label">擅长</div><div class="skill-tags">' +
            ["LLM 智能体搭建", "自定义工作流编排", "AI 应用轻量化部署", "自动化效率工具开发", "大模型落地问题排查与优化"]
              .map(function (s) { return '<span class="skill-tag">' + s + "</span>"; }).join("") +
          "</div></div>" +
          '<div class="intro-actions"><a class="primary-action" href="#/projects">查看项目 <span aria-hidden="true">→</span></a>' +
            '<a class="secondary-action" href="#/blog">阅读技术博客</a></div>' +
        "</section>" +

        '<section class="bento-card bento-featured">' +
          '<div class="card-kicker">精选 Agent 实战项目</div>' +
          '<div class="featured-list">' + featuredHtml + "</div>" +
        "</section>" +

        '<section class="bento-card bento-stats">' +
          '<div class="card-kicker">站点概览</div>' +
          '<div class="stats-grid">' +
            '<div class="stat-row"><span class="stat-label">实战项目</span><span class="stat-value">' + projects.length + '<span class="stat-unit">个</span></span></div>' +
            '<div class="stat-row"><span class="stat-label">技术博客</span><span class="stat-value">' + blogs.length + '<span class="stat-unit">篇</span></span></div>' +
            '<div class="stat-row"><span class="stat-label">我的收藏</span><span class="stat-value">' + getFavs().length + '<span class="stat-unit">条</span></span></div>' +
          "</div>" +
        "</section>" +

        '<section class="bento-card bento-latest">' +
          '<div class="card-kicker">最新技术动态</div>' +
          '<div class="mini-list">' + recent.map(miniItemHtml).join("") + "</div>" +
        "</section>" +

        '<section class="bento-card bento-blogs">' +
          '<div class="card-kicker">新增博文</div>' +
          '<div class="mini-list">' + newBlogs.map(miniItemHtml).join("") + "</div>" +
        "</section>" +

        '<section class="bento-card bento-popular">' +
          '<div class="card-kicker">热门内容</div>' +
          '<div class="mini-list">' + popular.map(miniItemHtml).join("") + "</div>" +
        "</section>" +
      "</div>" +

      '<div class="page-head"><h1 class="page-title">探索全部内容</h1>' +
        '<p class="page-desc">项目实战与技术博客，搜索或筛选，秒级定位你想要的。</p></div>' +
      toolbarHtml() +
      '<div id="results"></div>';

    bindBento();
    bindListEvents();
    renderResults();
  }

  function bindBento() {
    $all(".mini-item, .featured-item", $("#app")).forEach(function (it) {
      function openItem() {
        location.hash = "#/detail/" + it.getAttribute("data-id");
      }
      it.addEventListener("click", openItem);
    });
  }

  /* ---------- 列表页 ---------- */
  function renderList(title, desc) {
    $("#app").innerHTML =
      '<div class="list-page">' +
        '<div class="page-head"><h1 class="page-title">' + esc(title) + "</h1>" +
        '<p class="page-desc">' + esc(desc) + "</p></div>" +
        toolbarHtml() +
        '<div id="results"></div>' +
      "</div>";
    bindListEvents();
    renderResults();
  }

  /* ---------- 详情页 ---------- */
  function renderDetail(id) {
    var d = findById(id);
    if (!d) { location.hash = "#/home"; return; }

    var typeBadge = d.type === "project"
      ? '<span class="type-badge project">项目</span>'
      : '<span class="type-badge blog">博客</span>';
    var meta = d.type === "blog" && d.readTime
      ? esc(d.date) + " · " + esc(d.readTime) + " · " + (d.views || 0) + " 次阅读"
      : esc(d.date) + " · " + (d.views || 0) + " 次浏览";

    $("#app").innerHTML =
      '<div class="detail-wrap fade-up">' +
        '<a class="back-link" href="' + esc(lastListView) + '">← 返回</a>' +
        '<div class="detail-head">' +
          '<div class="detail-badges">' + typeBadge +
            '<span class="dim-badge domain">' + esc(d.domain) + "</span>" +
            '<span class="dim-badge difficulty ' + dimClass(d.difficulty, "difficulty") + '">' + esc(d.difficulty) + "</span>" +
            '<span class="dim-badge form">' + esc(d.form) + "</span>" +
            '<span class="dim-badge fresh ' + dimClass(d.freshness, "fresh") + '">' + esc(d.freshness) + "</span>" +
          "</div>" +
          '<h1 class="detail-title">' + esc(d.title) + "</h1>" +
          '<div class="detail-meta">' +
            '<span>' + meta + "</span>" +
            '<span class="dm-fav">' + favStarHtml(d.id) + "<span>收藏</span></span>" +
          "</div>" +
        "</div>" +
        '<div class="article-body">' + safeContent(d.content, d.summary) + "</div>" +
        '<div class="article-foot">' +
          (d.tags || []).map(function (t) {
            return '<span class="ctag" style="background:var(--accent-gray);color:var(--text-muted);padding:4px 11px;border-radius:6px;font-size:12px">#' + esc(t) + "</span>";
          }).join("") +
        "</div>" +
      "</div>";

    var favBtn = $(".detail-wrap .fav-btn");
    if (favBtn) {
      favBtn.addEventListener("click", function () {
        var nowFav = toggleFav(d.id);
        favBtn.classList.toggle("on", nowFav);
        favBtn.setAttribute("aria-pressed", nowFav);
        favBtn.setAttribute("aria-label", nowFav ? "取消收藏" : "收藏");
        var svg = favBtn.querySelector("svg");
        if (svg) svg.setAttribute("fill", nowFav ? "var(--fav)" : "none");
        favBtn.classList.remove("pop"); void favBtn.offsetWidth; favBtn.classList.add("pop");
      });
    }
  }

  /* ---------- 收藏页 ---------- */
  function renderFavorites() {
    var list = getFavs().map(findById).filter(Boolean);
    var head = '<div class="page-head"><h1 class="page-title">我的收藏</h1>' +
      '<p class="page-desc">你收藏的所有项目与博文，跨会话持续保留，本地存储无需登录。</p></div>';

    if (!list.length) {
      $("#app").innerHTML = head +
        emptyHtml("还没有收藏任何内容", "看到喜欢的项目或博文，点一下卡片右上角的星标，就能在这里随时找到它。", "去逛逛", "#/home");
      return;
    }

    $("#app").innerHTML = head +
      '<div class="result-meta"><span class="result-count">共收藏 <strong>' + list.length + "</strong> 条内容</span></div>" +
      '<div class="card-grid">' + list.map(cardHtml).join("") + "</div>";

    bindCardEvents($("#app"));
  }

  /* ---------- 路由 ---------- */
  function route() {
    var parts = (location.hash || "#/home").replace(/^#\//, "").split("/");
    var view = parts[0] || "home";

    if (view === "home" || view === "projects" || view === "blog" || view === "favorites") {
      lastListView = location.hash || "#/home";
    }

    // 导航高亮
    var detailType = view === "detail" ? (function () {
      var d = findById(parts[1]);
      return d ? d.type : null;
    })() : null;
    $all(".nav-link").forEach(function (a) {
      var r = a.getAttribute("data-route");
      var active = false;
      if (view === "detail") active = (detailType === "blog" ? r === "blog" : r === "projects");
      else active = (r === view);
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    var pageTitle = "老叶子 · Agent 应用工程师";
    if (view === "projects") pageTitle = "项目作品 · " + pageTitle;
    else if (view === "blog") pageTitle = "技术博客 · " + pageTitle;
    else if (view === "favorites") pageTitle = "我的收藏 · " + pageTitle;
    else if (view === "detail") {
      var detail = findById(parts[1]);
      if (detail) pageTitle = detail.title + " · 老叶子";
    } else if (view === "admin") pageTitle = "内容管理 · 老叶子";
    document.title = pageTitle;

    closeMenu();

    if (view === "home") {
      currentView = "home"; currentFixedType = null;
      renderHome();
    } else if (view === "projects") {
      currentView = "projects"; currentFixedType = "project";
      renderList("项目作品", "Agent 应用开发的实战项目沉淀，从智能体到自动化工作流。");
    } else if (view === "blog") {
      currentView = "blog"; currentFixedType = "blog";
      renderList("技术博客", "技术复盘、踩坑记录、工程思考，记录成长的每一步。");
    } else if (view === "favorites") {
      currentView = "favorites"; currentFixedType = null;
      renderFavorites();
    } else if (view === "detail") {
      currentView = "detail"; currentFixedType = null;
      renderDetail(parts[1]);
    } else if (view === "admin") {
      currentView = "admin"; currentFixedType = null;
      if (window.Admin && window.Admin.render) window.Admin.render();
      else $("#app").innerHTML = '<div class="empty-state"><div class="empty-title">管理模块未加载</div></div>';
    } else {
      location.hash = "#/home";
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    var app = $("#app");
    if (app) window.setTimeout(function () { app.focus({ preventScroll: true }); }, 0);
  }

  /* ---------- 移动端菜单 ---------- */
  function toggleMenu() {
    var nav = $("#site-nav");
    var btn = $("#nav-toggle");
    nav.classList.toggle("open");
    btn.classList.toggle("open");
    btn.setAttribute("aria-expanded", nav.classList.contains("open"));
  }
  function closeMenu() {
    var nav = $("#site-nav");
    var btn = $("#nav-toggle");
    if (nav) nav.classList.remove("open");
    if (btn) { btn.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
  }

  /* ---------- 云端数据加载（失败回退本地 data.js） ---------- */
  function rebuildTags(arr) {
    var s = {};
    arr.forEach(function (d) { (d.tags || []).forEach(function (t) { s[t] = 1; }); });
    return Object.keys(s);
  }
  function applyRemoteData(arr) {
    if (!arr || !arr.length) return;
    DATA = arr;
    window.DATA = arr;
    ALL_TAGS = rebuildTags(arr);
  }
  async function loadRemoteData() {
    if (!window.CloudSource || !window.CloudSource.readEnabled()) return false;
    try {
      var remote = await window.CloudSource.fetchContent();
      if (remote && remote.length) { applyRemoteData(remote); return true; }
    } catch (e) { /* 保持本地数据 */ }
    return false;
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    updateFavBadge();
    window.addEventListener("hashchange", route);
    $("#nav-toggle").addEventListener("click", toggleMenu);
    $all(".nav-link").forEach(function (a) { a.addEventListener("click", closeMenu); });
    route();
    if (await loadRemoteData()) route();
  }

  /* 暴露给管理页：保存/删除后刷新数据并回首页 */
  window.App = {
    refresh: async function () {
      await loadRemoteData();
      location.hash = "#/home";
      route();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
