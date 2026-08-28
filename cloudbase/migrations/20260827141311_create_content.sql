-- 建 content 表：站点内容（项目 / 博客）
CREATE TABLE public.content (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'project',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT '',
  form TEXT NOT NULL DEFAULT '',
  freshness TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  date TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  read_time TEXT NOT NULL DEFAULT '',
  featured BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 公开读：匿名与登录用户可读
GRANT SELECT ON public.content TO anon, authenticated;

-- 行级安全：默认拒绝写，仅开放读（写走云函数服务端权限）
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_public_read ON public.content FOR SELECT USING (true);
