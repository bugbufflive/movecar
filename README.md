# 🚗 movecar — 智能挪车通知系统

## 项目简介
本项目基于 Cloudflare Workers 实现，支持通过钉钉机器人或 Server 酱（方糖）向车主发送挪车提醒。部署简单，配置灵活，支持实时位置共享和多推送服务。

## 部署步骤

### 1. 部署代码
将完整代码复制到 Cloudflare Worker 编辑器中。

### 2. 配置环境变量

至少需配置一个推送渠道：

- 钉钉机器人 Webhook 地址
    ```
    DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=你的令牌"
    ```
- 或 Server 酱 SendKey
    ```
    SERVERCHAN_SENDKEY = "你的方糖SendKey"
    ```

可选配置：
- 车主联系电话（用于前端展示或短信提示）
    ```
    PHONE_NUMBER = "13800138000"
    ```
- 若钉钉机器人启用了“加签”，请填写签名密钥
    ```
    DINGTALK_SECRET = "SECxxxxxxxx"
    ```

### 3. 绑定 KV 命名空间
在 Worker 设置中绑定一个 KV 命名空间，命名为 `MOVE_CAR_STATUS`，用于记录通知状态，防止重复推送。

## 测试地址
部署成功后，可通过以下路径验证服务是否正常运行：

| 功能               | 访问地址                                 |
|--------------------|------------------------------------------|
| 主页面             | https://your-worker.workers.dev/          |
| 车主确认页面       | https://your-worker.workers.dev/owner-confirm |
| 健康检查           | https://your-worker.workers.dev/api/health |
| 推送渠道状态       | https://your-worker.workers.dev/api/push-channels |

> 请将 `your-worker` 替换为你实际的 Worker 子域名。

## 环境变量配置示例

钉钉机器人（推荐开启加签）：
```env
DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=abcdef1234567890"
DINGTALK_SECRET  = "SEC1234567890abcdef1234567890abcdef1234567890"