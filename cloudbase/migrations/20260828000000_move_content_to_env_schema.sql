-- 将 content 表迁移到以环境 ID 命名的业务 schema（rdb 服务默认 schema = envId）
DROP TABLE IF EXISTS public.content CASCADE;

CREATE SCHEMA IF NOT EXISTS "personal-web-d7gp7q673d30d0e04";

CREATE TABLE "personal-web-d7gp7q673d30d0e04".content (
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
GRANT SELECT ON "personal-web-d7gp7q673d30d0e04".content TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE "personal-web-d7gp7q673d30d0e04".content_id_seq TO anon, authenticated;

-- 行级安全：默认拒绝写，仅开放读（写走云函数服务端权限）
ALTER TABLE "personal-web-d7gp7q673d30d0e04".content ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_public_read ON "personal-web-d7gp7q673d30d0e04".content FOR SELECT USING (true);
