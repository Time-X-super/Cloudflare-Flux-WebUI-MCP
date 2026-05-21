# Flux Schnell

一个基于Cloudflare Worker与AI绑定的文生图应用。支持WebUI界面和Cursor编辑器集成。

## 快速开始

1. 双击运行`start-flux-schnell.bat`
2. 根据需要选择以下选项之一：
   - 选项1：直接启动WebUI (如果您已有Worker URL)
   - 选项2：部署Worker并获取URL，然后启动WebUI
   - 选项3：从最近部署中自动提取Worker URL
   - 选项4：启动CF-FLUX-MCP，用于Cursor编辑器集成（已完成）
3. 如果选择部署Worker，系统会打开浏览器，请登录您的Cloudflare账户并授权
4. 部署完成后，请复制显示的Worker URL
5. 根据您选择的使用方式继续操作：
   - WebUI：在界面中输入Worker URL，点击"保存并继续"按钮开始使用
   - Cursor：按照提示配置MCP程序

## 目录结构

- `cf-flux-schnell/` - Cloudflare Worker源代码
- `weiui/` - 图形用户界面
- `CF-FLUX-MCP/` - Cursor编辑器集成代码（已完成）
- `*.bat` - 各种帮助脚本

## 特性

- 基于Cloudflare Workers AI的高质量文生图
- 双重使用方式：
  - 响应式现代化WebUI界面
  - Cursor编辑器直接集成
- 支持多种语言（英文、简体中文、繁体中文、俄语、阿拉伯语、法语、德语、西班牙语）
- 可调整生成步数，平衡质量与速度
- 生成历史记录与快速重用
- 便捷的图像下载功能
- 全自动部署与配置

## 部署说明

本应用使用Cloudflare Worker提供AI文生图服务，需要您拥有Cloudflare账户（免费）。

### 部署方式

1. **交互式浏览器认证(推荐)**: 
   - 运行`start-flux-schnell.bat`并选择选项2
   - 系统会打开浏览器让您登录Cloudflare账户
   - 部署完成后会自动保存Worker URL
   - 无需手动获取API Token

2. **手动部署**:
   - 进入`cf-flux-schnell`目录
   - 运行`npm install`
   - 运行`npx wrangler deploy`
   - 运行`save-worker-url.bat`保存获取的URL

## 使用方式

### 1. WebUI界面

直接通过图形界面使用，支持：
- 可视化的提示词输入
- 图像预览
- 历史记录管理
- 多语言切换

### 2. Cursor编辑器集成

1. 启动MCP服务：
   - 运行`start-flux-schnell.bat`选择选项4
   - 系统会自动启动MCP服务

2. 配置Cursor：
   - 打开Cursor设置
   - 选择"Copilot设置"
   - 进入"MCP程序"选项卡
   - 添加新程序：
     - 命令：`node 完整路径\CF-FLUX-MCP\simple-server-final.js`
     - 名称：CF-FLUX-MCP
     - 描述：Flux图像生成

3. 在编辑器中使用：
```
/generate-flux-image prompt="您想生成的图像描述" model="@cf/black-forest-labs/flux-2-klein-4b" width=1024 height=1024 steps=4
```

参数说明：
- `prompt`：图像描述（必填）
- `model`：模型 id（可选，默认 `@cf/black-forest-labs/flux-2-klein-4b`），可选值：
  - `@cf/black-forest-labs/flux-2-klein-4b`（蒸馏轻量版，1-8 步，默认 4）
  - `@cf/black-forest-labs/flux-2-klein-9b`（蒸馏均衡版，1-8 步，默认 4）
  - `@cf/black-forest-labs/flux-2-dev`（完整 Dev 版本，1-50 步，默认 25）
- `width`：图像宽度（可选，默认 1024，范围 256-2048，建议为 32 的倍数）
- `height`：图像高度（可选，默认 1024，范围 256-2048，建议为 32 的倍数）
- `steps`：生成步数（可选）。klein 系列支持 1-8，flux-2-dev 支持 1-50；缺省时由 Worker 按所选模型自动补默认值

## API说明

Worker部署后将提供文生图API，可通过以下方式调用：

```
POST https://your-worker-url.workers.dev
Headers:
  Content-Type: application/json
  Authorization: Bearer <YOUR_FLUX_TOKEN>

Body:
{
  "prompt": "您想生成的图像描述",
  "model": "@cf/black-forest-labs/flux-2-klein-4b",
  "width": 1024,
  "height": 1024,
  "steps": 4
}
```

`<YOUR_FLUX_TOKEN>` 是您通过 `npx wrangler secret put FLUX_TOKEN` 在 Worker 上配置的 Bearer Token，详见下方"配置 API Token"。

可用的 FLUX.2 模型及推荐步数范围：

- `@cf/black-forest-labs/flux-2-klein-4b`：蒸馏轻量版，速度最快，步数 1-8（默认 4）
- `@cf/black-forest-labs/flux-2-klein-9b`：蒸馏均衡版，质量与速度兼顾，步数 1-8（默认 4）
- `@cf/black-forest-labs/flux-2-dev`：完整 Dev 版本，质量最高，步数 1-50（默认 25）

`model`、`width`、`height`、`steps` 均为可选参数；省略时由 Worker 使用上述默认值。三个 FLUX.2 模型均运行在 Cloudflare Workers AI，并共用同一份每日 10,000 Neurons 的免费额度。

## 配置 API Token

Worker 通过 `Authorization: Bearer <token>` 校验调用方身份，对应的 token 由 Worker 端的 `FLUX_TOKEN` secret 决定。**该值不再硬编码在仓库中**，三处需要保持一致：

1. **Worker 端**：

   ```bash
   cd cf-flux-schnell
   npx wrangler secret put FLUX_TOKEN
   # 按提示粘贴 token，然后重新部署
   npx wrangler deploy
   ```

   未设置该 secret 时，Worker 会返回 503 并在响应体里提示 `wrangler secret put FLUX_TOKEN`。

2. **WebUI**：首次访问设置页时同时填写 Worker URL 和 API Token，两个值都会保存在浏览器 localStorage 中；点击"重置"会清除两者。Token 必须与 Worker 上配置的 `FLUX_TOKEN` 完全一致。

3. **MCP 服务器（CF-FLUX-MCP）**：在 Cursor MCP 配置的 `"env"` 块中加入 `"FLUX_TOKEN": "<value>"`，例如：

   ```json
   {
     "name": "CF-Flux-Simple",
     "command": "node",
     "args": ["D:\\Desktop\\CF-FLUX1.0\\CF-FLUX-MCP\\simple-server-final.js"],
     "env": { "FLUX_TOKEN": "<the same token you set on the Worker>" }
   }
   ```

   也可以在启动 shell 中先 `set FLUX_TOKEN=...`（Windows）/ `export FLUX_TOKEN=...`（macOS/Linux）。未配置时 MCP 服务器会立即退出并打印 actionable 报错，Cursor 端连接同步失败。

> **重要：之前在仓库公开历史中出现过的 token 已视为泄露，必须更换。** 请使用一个新生成的随机值，例如 `openssl rand -hex 32`，并把它分别写入 Worker secret、WebUI 设置页和 MCP 的 `env.FLUX_TOKEN`。

## 多语言支持

本应用WebUI界面支持以下语言：
- 英文 (English)
- 简体中文
- 繁体中文
- 俄语 (Русский)
- 阿拉伯语 (العربية)
- 法语 (Français)
- 德语 (Deutsch)
- 西班牙语 (Español)

语言会自动根据浏览器设置检测，也可以通过界面右上角的语言选择器手动切换。

## 故障排除

> 如果调用接口出现 **401 Unauthorized** 或 **503**（响应体提示 `wrangler secret put FLUX_TOKEN`），通常是 token 未配置或三方不一致，请先查看 [配置 API Token](#配置-api-token) 章节。

### WebUI相关
- **部署失败**: 确保您登录了正确的Cloudflare账户，并拥有部署Worker的权限
- **不显示Worker URL**: 部署成功后，URL会在命令行中显示；您也可以在Cloudflare仪表板的Workers页面找到URL
- **WebUI无法启动**: 检查是否已安装Node.js，并尝试重新安装依赖（`cd weiui && npm install`）
- **URL保存后不生效**: 尝试重置配置并重新输入URL，确保点击"保存并继续"按钮

### Cursor集成相关
- **找不到Worker URL**: 确保`worker_url.txt`文件存在并包含正确的URL
- **MCP连接失败**: 检查Cursor设置中的命令路径是否正确，现在应使用`simple-server-final.js`
- **图像生成失败**: 确保提示词不包含特殊字符，步数在所选模型的有效范围内（klein 系列 1-8，flux-2-dev 1-50）
- **中文提示词处理**: 系统现已内置简单的中英文转换能力，但复杂的中文可能需要您手动输入英文提示词

## 获取帮助

如需更多帮助，请参考`获取Worker URL指南.md`文档，或访问[Cloudflare Workers文档](https://developers.cloudflare.com/workers/)。

## 特别感谢

感谢Cloudflare提供AI服务，让大家能够体验文生图的魅力。 