# -*- coding: utf-8 -*-
"""
laoyezi 站点 → GitHub Pages 部署脚本
通过 GitHub REST API 推送（绕过 git 协议在国内被 reset 的问题）

原理：与 auto_dashboard.py 的 push_to_github() 一致——直接调
      api.github.com 的 contents API 把文件 PUT 上去，而非 git push。
      urllib 会自动读取 HTTPS_PROXY/HTTP_PROXY 环境变量走代理，
      因此同机下比 git 协议通畅。

用法（在本机终端，laoyezi 目录下）:
  python deploy_github.py

Token 读取顺序:
  1. 环境变量 GITHUB_TOKEN
  2. 本目录 .github_token
  3. ../xiaoshou/.github_token   （复用销售仪表盘的 token，同账号通用）

前置: token 需有 repo 权限（classic token 勾 repo 即可）
"""
import os
import base64
import json
import urllib.request
import urllib.error

REPO_OWNER = 'thou321'
REPO_NAME = 'laoyezi'
BRANCH = 'main'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SKIP_DIRS = {'.git', '__pycache__', '.workbuddy'}
# 绝不推送 token 文件
SKIP_FILES = {'.github_token'}


def load_token():
    env = os.environ.get('GITHUB_TOKEN')
    if env and env.strip():
        return env.strip()
    candidates = [
        os.path.join(BASE_DIR, '.github_token'),
        os.path.join(BASE_DIR, '..', 'xiaoshou', '.github_token'),
        os.path.join(BASE_DIR, '..', '..', 'xiaoshou', '.github_token'),
        r'C:\Users\ASUS\Desktop\xiaoshou\.github_token',
    ]
    for p in candidates:
        if os.path.isfile(p):
            with open(p, 'r', encoding='utf-8') as f:
                return f.read().strip()
    raise SystemExit(
        '未找到 GitHub Token。请设置环境变量 GITHUB_TOKEN，'
        '或在 .github_token 文件中放置有 repo 权限的 PAT。'
    )


def collect_files():
    out = []
    for root, dirs, files in os.walk(BASE_DIR):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if fn in SKIP_FILES:
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, BASE_DIR).replace(os.sep, '/')
            out.append((rel, full))
    return sorted(out)


def api_request(method, url, token, data=None):
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'laoyezi-deploy')
    req.add_header('Content-Type', 'application/json')
    if data is not None:
        req.data = json.dumps(data).encode('utf-8')
    # urllib 默认 ProxyHandler 会读取 HTTPS_PROXY/HTTP_PROXY 环境变量
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status == 204:
            return None
        return json.loads(resp.read().decode('utf-8'))


def main():
    token = load_token()
    files = collect_files()
    api_base = 'https://api.github.com/repos/{}/{}'.format(REPO_OWNER, REPO_NAME)
    ok, err = 0, 0

    print('将推送 {} 个文件到 {}/{} (分支 {})'.format(
        len(files), REPO_OWNER, REPO_NAME, BRANCH))
    print('-' * 50)

    for rel, full in files:
        try:
            with open(full, 'rb') as f:
                content = base64.b64encode(f.read()).decode('ascii')
        except Exception as e:
            print('[跳过] {} 读取失败: {}'.format(rel, e))
            err += 1
            continue

        url = '{}/contents/{}'.format(api_base, rel)
        sha = None
        try:
            info = api_request('GET', url, token)
            if isinstance(info, dict):
                sha = info.get('sha')
        except urllib.error.HTTPError as e:
            if e.code != 404:
                print('[ERR] {} 查询失败: {}'.format(rel, e))
                err += 1
                continue
        except Exception as e:
            print('[ERR] {} 查询失败: {}'.format(rel, e))
            err += 1
            continue

        body = {
            'message': 'deploy {}'.format(rel),
            'content': content,
            'branch': BRANCH,
        }
        if sha:
            body['sha'] = sha

        try:
            api_request('PUT', url, token, body)
            print('[OK] {}'.format(rel))
            ok += 1
        except Exception as e:
            print('[ERR] {} 推送失败: {}'.format(rel, e))
            err += 1

    print('-' * 50)
    print('完成: 成功 {} / 失败 {}'.format(ok, err))
    if err == 0:
        print('站点地址: https://thou321.github.io/laoyezi/')
        print('管理后台: https://thou321.github.io/laoyezi/#/admin')
        print('提示: 若仓库尚未开启 Pages，去 Settings → Pages 选 main / root，约 1 分钟生效。')
        print('别忘了在 CloudBase 控制台把 https://thou321.github.io 加入环境「安全来源」(CORS)。')


if __name__ == '__main__':
    main()
