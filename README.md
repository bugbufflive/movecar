🚗 挪车通知服务 — 使用说明

本服务基于 Cloudflare Workers 实现，支持通过 钉钉机器人 或 Server 酱（方糖） 向车主发送挪车提醒。部署简单，配置灵活。

🛠️ 一、部署步骤

1. 部署代码
- 将完整代码复制到  中。

2. 配置环境变量

✅ 至少需配置一个推送渠道

🔔 必填（二选一）
钉钉机器人 Webhook 地址
DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=你的令牌"

或 Server 酱 SendKey
SERVERCHAN_SENDKEY = "你的方糖SendKey"

⚙️ 可选配置
车主联系电话（用于前端展示或短信提示）
PHONE_NUMBER = "13800138000"

若钉钉机器人启用了"加签"，请填写签名密钥
DINGTALK_SECRET = "SECxxxxxxxx"

3. 绑定 KV 命名空间
- 在 Worker 设置中绑定一个 KV 命名空间，命名为：
    MOVE_CAR_STATUS
  
  用于记录通知状态，防止重复推送。

🧪 二、测试地址

部署成功后，可通过以下路径验证服务是否正常运行：
功能               访问地址
主页面             https://your-worker.workers.dev/
车主确认页面       https://your-worker.workers.dev/owner-confirm
健康检查           https://your-worker.workers.dev/api/health
推送渠道状态       https://your-worker.workers.dev/api/push-channels

💡 请将 your-worker 替换为你实际的 Worker 子域名。

📋 三、环境变量配置示例

钉钉机器人（推荐开启加签）
DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=abcdef1234567890"
DINGTALK_SECRET  = "SEC1234567890abcdef1234567890abcdef1234567890"

Server 酱（方糖）
SERVERCHAN_SENDKEY = "SCT1234567890abcdef1234567890"

车主电话（用于前端提示）
PHONE_NUMBER = "13800138000"

✅ 部署完成后，访问主页面即可触发通知，车主可通过 /owner-confirm 页面一键确认已挪车，避免重复打扰。

如需进一步定制（如添加微信、短信等通道），欢迎扩展推送模块！