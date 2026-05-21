# CF-FLUX-MCP (简化版)

这是一个简化版的Cloudflare Flux MCP服务器，用于Cursor编辑器集成。

## 功能特点

- 基于Cloudflare Workers的AI图像生成
- 简单直接的MCP集成
- 最小化依赖和复杂性

## 使用方法

1. 确保安装了Node.js
2. 设置 `FLUX_TOKEN` 环境变量为你在 Worker 上配置的 Bearer Token（详见下方"配置 FLUX_TOKEN"）
3. 运行`final-simple.bat`查看启动信息（脚本会先校验 `FLUX_TOKEN` 是否已设置，未设置时直接报错退出）
4. 在Cursor编辑器中配置MCP:
   - 打开设置 -> Copilot设置 -> MCP程序
   - 添加新程序，**务必通过 `env` 字段把 FLUX_TOKEN 传给子进程**，例如：
     ```json
     {
       "name": "CF-Flux-Simple",
       "command": "node",
       "args": ["D:\\Desktop\\CF-FLUX1.0\\CF-FLUX-MCP\\simple-server-final.js"],
       "env": { "FLUX_TOKEN": "<the same token you set on the Worker>" }
     }
     ```
   - 描述: Flux图像生成
   - 如果未在 `env` 中提供 `FLUX_TOKEN`，服务器会立即退出并向 stderr 打印一条 actionable 的错误信息，Cursor 端 MCP 连接也会立即失败。

5. 在Cursor编辑器中使用命令:
   ```
   /generate-flux-image prompt="美丽的山脉风景" model="@cf/black-forest-labs/flux-2-klein-4b" width=1024 height=1024 steps=4
   ```

## 配置 FLUX_TOKEN

`FLUX_TOKEN` 是 Worker 通过 `Authorization: Bearer <token>` 校验调用方身份所用的 Bearer Token，**不再硬编码**在代码或文档中。三处需要保持一致：

- **Worker 端**：在 `cf-flux-schnell/` 目录下执行 `npx wrangler secret put FLUX_TOKEN`，按提示输入并重新部署。Worker 在缺失该 secret 时会返回 503，并提示需要先 `wrangler secret put FLUX_TOKEN`。
- **MCP 服务器（本目录）**：在 Cursor MCP 配置的 `"env"` 块中加入 `"FLUX_TOKEN": "<value>"`，或者在启动 shell 中先 `set FLUX_TOKEN=...`（Windows）/ `export FLUX_TOKEN=...`（macOS/Linux）。值必须与 Worker secret 完全一致。
- **WebUI**：首次访问设置页时会提示同时输入 Worker URL 和 API Token，填入同一个值即可。

## 参数说明

- `prompt`: 图像描述文本 (必填)
- `model`: 模型 id (可选)，可选值：
  - `@cf/black-forest-labs/flux-2-klein-4b` (默认，蒸馏轻量版，1-8 步，默认 4)
  - `@cf/black-forest-labs/flux-2-klein-9b` (蒸馏均衡版，1-8 步，默认 4)
  - `@cf/black-forest-labs/flux-2-dev` (完整 Dev 版本，1-50 步，默认 25)
- `width`: 图像宽度 (可选，默认 1024，范围 256-2048，建议为 32 的倍数)
- `height`: 图像高度 (可选，默认 1024，范围 256-2048，建议为 32 的倍数)
- `steps`: 生成步数 (可选)。klein 系列支持 1-8，flux-2-dev 支持 1-50；缺省时由 Worker 按所选模型补默认值
- `output_dir` / `filename`: 可选，要求 MCP 端将生成的图片落盘到指定目录与文件名

## API格式

请求格式:
```
POST https://XXXXXXXXXXXXXXXXXXXXXXXXXXXX
Headers:
  Content-Type: application/json
  Authorization: Bearer <YOUR_FLUX_TOKEN>

Body:
{
  "prompt": "图像描述",
  "model": "@cf/black-forest-labs/flux-2-klein-4b",
  "width": 1024,
  "height": 1024,
  "steps": 4
}
```

> `<YOUR_FLUX_TOKEN>` 是你通过 `npx wrangler secret put FLUX_TOKEN` 在 Worker 上配置的 Bearer Token，调用方需要原样附在 `Authorization` 头上。请务必使用一个新生成的随机值（例如 `openssl rand -hex 32`），不要复用历史上泄露过的旧 token。

> 全部三个 FLUX.2 模型共用 Cloudflare Workers AI 的每日 10,000 Neurons 免费额度。

## 故障排除

如果遇到问题:
1. 检查`worker_url.txt`文件是否存在且包含正确的URL
2. 确保Cursor设置中的命令路径正确，并且 `env.FLUX_TOKEN` 已配置（参见上方"配置 FLUX_TOKEN"）
3. 查看命令行输出是否有错误信息；若 stderr 出现 `FLUX_TOKEN env var is not set` 即为未配置 token
4. 调整`steps`参数到所选模型支持的范围内（klein 系列 1-8，flux-2-dev 1-50）
5. 若 Worker 返回 503 并提示 `wrangler secret put FLUX_TOKEN`，说明 Worker 端尚未配置 secret，请按"配置 FLUX_TOKEN"中"Worker 端"步骤设置后重新部署

## 文件说明

- `simple-server-final.js`: 主要的MCP服务器文件
- `final-simple.bat`: 启动批处理文件
- `package.json`: 项目依赖
- `worker_url.txt`: Worker URL配置 