# mitmproxy Docker 使用示例

本文用于在 Docker 环境中部署 `mitmproxy`，把 TMDB / TheTVDB 请求转发到本项目代理域名。

## 适用场景

- 客户端无法直接改 TMDB / TVDB 的基础域名
- 需要对现有应用（如 Emby / Jellyfin）透明接入代理
- 希望统一在局域网或服务器端做流量映射

## 前提条件

- 已部署本项目并可访问代理域名，例如：`media-metadata.example.com`
- 已安装 Docker 与 Docker Compose
- 客户端允许配置 HTTP/HTTPS 代理

## 本项目路由说明

本项目接口前缀如下：

- TMDB API：`https://<PROXY_HOST>/tmdb/...`
- TMDB 图片：`https://<PROXY_HOST>/tmdb/t/p/...`
- TheTVDB API：`https://<PROXY_HOST>/tvdb/v4/...`
- TheTVDB 图片：`https://<PROXY_HOST>/tvdb/artworks/...`

因此 `map_remote` 也必须映射到这些前缀。

## 目录准备

```bash
mkdir -p /opt/mitmproxy
cd /opt/mitmproxy
```

## .env 示例

创建 `.env` 文件：

```env
PROXY_HOST=media-metadata.example.com
MITMWEB_PASSWORD=change_me
```

说明：

- `PROXY_HOST` 只写域名，不要加 `https://`
- `MITMWEB_PASSWORD` 用于 mitmweb 面板登录

## docker-compose.yml 示例

```yaml
services:
  mitmproxy:
    image: mitmproxy/mitmproxy:latest
    container_name: media-metadata-mitmproxy
    restart: unless-stopped
    expose:
      - "8080"
    ports:
      - "8081:8081"
    command:
      - mitmweb
      - --listen-host
      - 0.0.0.0
      - --listen-port
      - "8080"
      - --set
      - confdir=/home/mitmproxy/.mitmproxy
      - --set
      - web_host=0.0.0.0
      - --set
      - web_port=8081
      - --set
      - web_open_browser=false
      - --set
      - web_password=${MITMWEB_PASSWORD}
      - --set
      - connection_strategy=lazy
      - --set
      - "map_remote=|^https://api\\.themoviedb\\.org(:443)?/|https://${PROXY_HOST}/tmdb/"
      - --set
      - "map_remote=|^https://image\\.tmdb\\.org(:443)?/|https://${PROXY_HOST}/tmdb/"
      - --set
      - "map_remote=|^https://api4\\.thetvdb\\.com(:443)?/v4/|https://${PROXY_HOST}/tvdb/v4/"
      - --set
      - "map_remote=|^https://artworks\\.thetvdb\\.com(:443)?/|https://${PROXY_HOST}/tvdb/artworks/"
      - --set
      - show_ignored_hosts=true
    volumes:
      - /opt/mitmproxy:/home/mitmproxy/.mitmproxy
```

## 启动与查看

```bash
docker compose up -d
docker compose logs -f mitmproxy
```

mitmweb 面板默认地址：

`http://<服务器IP>:8081`

## 客户端代理设置

在 Emby / Jellyfin 容器或宿主机中设置：

- `HTTP_PROXY=http://<mitmproxy-host>:8080`
- `HTTPS_PROXY=http://<mitmproxy-host>:8080`
- `NO_PROXY=localhost,127.0.0.1,::1`

并信任 mitmproxy 生成的根证书（`mitmproxy-ca-cert.pem`）。

### 示例

#### emby

> 示例仅供参考

```yaml
services:
  mitmproxy:
    image: mitmproxy/mitmproxy:latest
    container_name: emby-mitmproxy
    restart: unless-stopped
    expose:
      - "8080"
    ports:
      - "8081:8081"
    command:
      - mitmweb
      - --listen-host
      - 0.0.0.0
      - --listen-port
      - "8080"
      - --set
      - confdir=/home/mitmproxy/.mitmproxy
      - --set
      - web_host=0.0.0.0
      - --set
      - web_port=8081
      - --set
      - web_open_browser=false
      - --set
      - web_password=${MITMWEB_PASSWORD}
      - --set
      - connection_strategy=lazy
      - --set
      - "map_remote=|^https://api\\.themoviedb\\.org(:443)?/|https://${PROXY_HOST}/tmdb/"
      - --set
      - "map_remote=|^https://image\\.tmdb\\.org(:443)?/|https://${PROXY_HOST}/tmdb/"
      - --set
      - "map_remote=|^https://api4\\.thetvdb\\.com(:443)?/v4/|https://${PROXY_HOST}/tvdb/v4/"
      - --set
      - "map_remote=|^https://artworks\\.thetvdb\\.com(:443)?/|https://${PROXY_HOST}/tvdb/artworks/"
      - --set
      - show_ignored_hosts=true
    volumes:
      - ./mitmproxy:/home/mitmproxy/.mitmproxy

  emby:
    image: emby/embyserver:latest
    container_name: emby
    user: "0:0"
    depends_on:
      - mitmproxy
    ports:
      - "8096:8096"
      - "8920:8920"
    environment:
      HTTP_PROXY: http://mitmproxy:8080
      HTTPS_PROXY: http://mitmproxy:8080
      NO_PROXY: localhost,127.0.0.1,::1,host.docker.internal,mitmproxy
      http_proxy: http://mitmproxy:8080
      https_proxy: http://mitmproxy:8080
      no_proxy: localhost,127.0.0.1,::1,host.docker.internal,mitmproxy
    volumes:
      - /opt/emby/config:/config
      - /opt/emby/cache:/cache
      - /opt/emby/media:/media:ro
      - /opt/mitmproxy:/mitmproxy-ca:ro
    restart: unless-stopped
    extra_hosts:
      - host.docker.internal:host-gateway
    entrypoint:
      - /bin/sh
      - -lc
      - |
        until [ -f /mitmproxy-ca/mitmproxy-ca-cert.pem ]; do
          echo "waiting for mitmproxy CA..."
          sleep 2
        done
        cp /mitmproxy-ca/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy-ca-cert.crt
        update-ca-certificates || true
        exec /system/EmbyServer
```

#### jellyfin

> 示例仅供参考

```yaml
services:
  mitmproxy:
    image: mitmproxy/mitmproxy:latest
    container_name: jellyfin-mitmproxy
    restart: unless-stopped
    expose:
      - "8080"
    ports:
      - "8081:8081"
    command:
      - mitmweb
      - --listen-host
      - 0.0.0.0
      - --listen-port
      - "8080"
      - --set
      - confdir=/home/mitmproxy/.mitmproxy
      - --set
      - web_host=0.0.0.0
      - --set
      - web_port=8081
      - --set
      - web_open_browser=false
      - --set
      - web_password=${MITMWEB_PASSWORD}
      - --set
      - connection_strategy=lazy
      - --set
      - "map_remote=|^https://api\\.themoviedb\\.org(:443)?/|https://${PROXY_HOST}/tmdb/"
      - --set
      - "map_remote=|^https://image\\.tmdb\\.org(:443)?/|https://${PROXY_HOST}/tmdb/"
      - --set
      - "map_remote=|^https://api4\\.thetvdb\\.com(:443)?/v4/|https://${PROXY_HOST}/tvdb/v4/"
      - --set
      - "map_remote=|^https://artworks\\.thetvdb\\.com(:443)?/|https://${PROXY_HOST}/tvdb/artworks/"
      - --set
      - show_ignored_hosts=true
    volumes:
      - ./mitmproxy:/home/mitmproxy/.mitmproxy

  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    depends_on:
      - mitmproxy
    ports:
      - "8096:8096"
      - "8920:8920"
    environment:
      HTTP_PROXY: http://mitmproxy:8080
      HTTPS_PROXY: http://mitmproxy:8080
      NO_PROXY: localhost,127.0.0.1,::1,host.docker.internal,mitmproxy
      http_proxy: http://mitmproxy:8080
      https_proxy: http://mitmproxy:8080
      no_proxy: localhost,127.0.0.1,::1,host.docker.internal,mitmproxy
    volumes:
      - /opt/jellyfin/config:/config
      - /opt/jellyfin/cache:/cache
      - /opt/jellyfin/media:/media:ro
      - ./mitmproxy:/mitmproxy-ca:ro
    restart: unless-stopped
    extra_hosts:
      - host.docker.internal:host-gateway
```

容器启动后，执行一次证书导入并重启 Jellyfin：

```bash
docker exec -it jellyfin /bin/sh -lc "cp /mitmproxy-ca/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy-ca-cert.crt && update-ca-certificates"
docker restart jellyfin
```

如果镜像里没有 `update-ca-certificates`，需要先在镜像内安装 `ca-certificates`（或改为自定义镜像预装）。


## 常见错误与修正

### 1) `Invalid filter expression`

典型原因：

- `map_remote` 末尾多写了 `|`
- 把 URL 正则误当成了 filter 段

错误示例：

```bash
map_remote=|^https://api\.themoviedb\.org/|https://${PROXY_HOST}/tmdb/|
```

正确示例：

```bash
map_remote=|^https://api\.themoviedb\.org(:443)?/|https://${PROXY_HOST}/tmdb/
```

### 2) `${PROXY_HOST}` 没有被替换

建议在 compose 里使用双引号写法，并先检查展开结果：

```bash
docker compose config
```
