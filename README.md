# Media Metadata Proxy

用于通过 Vercel 统一代理 **TMDB** 和 **TheTVDB**，适配 Emby、Jellyfin 等元数据刮削场景。

## 功能概览

- 同时代理 TMDB 与 TheTVDB
- 单入口分发（`api/index.js`）+ 双上游代理模块（`api/tmdb.js`、`api/tvdb.js`）
- 支持 `GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS`
- 自动透传常见请求头（含 `Authorization`）
- `GET` 请求内存缓存（默认 10 分钟）
- TMDB 图片直连重写（`/tmdb/t/p/*` -> `image.tmdb.org/t/p/*`）
- TheTVDB 图片直连重写（`/tvdb/artworks/*` -> `artworks.thetvdb.com/*`）

## 路由规则

当前 `vercel.json` 规则如下：

- `/tmdb/t/p/:path*` -> `https://image.tmdb.org/t/p/:path*`
- `/tvdb/artworks/:path*` -> `https://artworks.thetvdb.com/:path*`
- `/:path*` -> `/api/index.js`

`api/index.js` 内部分发：

- `/tmdb/*` -> TMDB 代理
- `/tvdb/*` -> TheTVDB 代理
- 其他路径 -> `404`

## 快速部署

### 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/2061360308/media-metadata-proxy)

### 手动部署

1. `fork` 本仓库
2. 在 Vercel 新建项目并选择该仓库
3. 部署完成后绑定自定义域名（推荐）

## 使用方法

> 某些场景下无法直接更改请求域名，可以使用mitmproxy进行拦截转发。[mitmproxy Docker 示例](./docs/mitmproxy-docker-example.md)

### TMDB

原始接口：

`https://api.themoviedb.org/3/configuration`

代理后：

`https://<YOUR_PROXY_HOST>/tmdb/3/configuration`

### TMDB 图片

原始图片：

`https://image.tmdb.org/t/p/w500/xxx.jpg`

代理后：

`https://<YOUR_PROXY_HOST>/tmdb/t/p/w500/xxx.jpg`

### TheTVDB 登录

原始接口：

`POST https://api4.thetvdb.com/v4/login`

代理后：

`POST https://<YOUR_PROXY_HOST>/tvdb/v4/login`

请求体示例：

```json
{
  "apikey": "YOUR_TVDB_API_KEY"
}
```

### TheTVDB 图片

原始图片：

`https://artworks.thetvdb.com/banners/movies/103937/backgrounds/103937.jpg`

代理后：

`https://<YOUR_PROXY_HOST>/tvdb/artworks/banners/movies/103937/backgrounds/103937.jpg`

## 代理自测脚本（Node + axios）

仓库内置脚本：`scripts/test-proxy.js`

使用步骤：

1. 复制配置模板：`scripts/.env.example` -> `scripts/.env`
2. 至少设置：`PROXY_HOST`
3. 可选设置：`TMDB_API_KEY`、`TVDB_API_KEY`、`TVDB_PIN`、`TVDB_ARTWORK_PATH`
4. 执行：`npm run test:proxy`

说明：

- `PROXY_HOST` 未设置会直接提示缺少必填配置
- 如果未设置 `TMDB_API_KEY` / `TVDB_API_KEY`，脚本会验证代理是否能返回上游错误信息（而不是只测成功场景）
- 脚本会额外检测 `GET /tvdb/artworks/{path}`（默认可通过 `TVDB_ARTWORK_PATH` 覆盖）
- 输出会自动脱敏 `api_key` 查询参数和 TVDB token

## 常见问题

### 1) 返回 `Authentication Required` HTML，而不是 API JSON

这是 Vercel 的 Deployment Protection 在拦截请求。  
请检查：

- 项目是否关闭了访问保护，或
- 你是否在访问受保护的 deployment URL（`*.vercel.app` 的临时部署域名）

建议优先用绑定的生产域名进行调用。

### 2) Vercel 报 `Invalid vercel.json` 或 `Unexpected token '﻿'`

通常是 JSON 文件包含 UTF-8 BOM。  
请确保 `vercel.json`、`package.json` 使用 **UTF-8 无 BOM** 或 ASCII 编码。

## 免责声明

- 本项目仅用于学习与个人用途，请遵守 TMDB / TheTVDB 的服务条款与授权要求。
- 不提供任何第三方数据授权保证。
