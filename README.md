🚗 挪车通知系统

📋 项目简介

一个基于 Cloudflare Workers 的智能挪车通知系统，支持多渠道推送、实时位置共享和车主确认功能。无需服务器，一键部署，快速使用。

✨ 功能特点

· 🔔 多渠道推送：支持钉钉机器人、方糖Server酱
· 📍 实时定位：自动获取位置并生成多平台地图链接
· ⏱️ 延迟发送：支持30秒延迟发送功能
· ✅ 双向确认：请求者与车主双向确认机制
· 📱 响应式设计：适配移动端和桌面端
· 🛡️ 安全可靠：内置错误处理和重试机制

🚀 快速部署

1. 创建 Worker

1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages → Create application
3. 选择 Create Worker
4. 将完整代码复制到编辑器

2. 配置环境变量

在 Worker 设置中配置以下环境变量：

必需配置（至少选择一个）

变量名 说明 示例
DINGTALK_WEBHOOK 钉钉机器人Webhook https://oapi.dingtalk.com/robot/send?access_token=xxx
SERVERCHAN_SENDKEY 方糖Server酱SendKey SCTxxxxxx

可选配置

变量名 说明 示例
PHONE_NUMBER 车主联系电话 13800138000
DINGTALK_SECRET 钉钉机器人签名密钥 SECxxxxxx

3. 绑定 KV 命名空间

```bash
# 创建 KV 命名空间
wrangler kv:namespace create "MOVE_CAR_STATUS"

# 获取命名空间 ID，更新到 wrangler.toml
```

在 wrangler.toml 中添加：

```toml
name = "move-car-notification"
main = "src/index.js"
compatibility_date = "2024-01-01"

kv_namespaces = [
  { binding = "MOVE_CAR_STATUS", id = "your_kv_id" }
]
```

⚙️ 环境变量详解

钉钉机器人配置

1. 创建钉钉机器人：
   · 打开钉钉群 → 群设置 → 智能群助手
   · 添加机器人 → 自定义机器人
   · 安全设置：建议使用"加签"
   · 复制 Webhook URL 和签名密钥
2. 配置示例：
   ```env
   DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx"
   DINGTALK_SECRET = "SECxxxxxxxx"  # 如果启用了加签
   ```

方糖 Server酱 配置

1. 获取 SendKey：
   · 访问 ServerChan
   · 登录并获取 SendKey
2. 配置示例：
   ```env
   SERVERCHAN_SENDKEY = "SCTxxxxxxxxxxxx"
   ```

可选配置

```env
PHONE_NUMBER = "13800138000"  # 在成功页面显示拨号按钮
```

🌐 测试地址

部署成功后，访问以下地址进行测试：

页面 地址 说明
🏠 主页面 https://your-worker.workers.dev/ 发送挪车通知
👤 车主页面 https://your-worker.workers.dev/owner-confirm 车主确认页面
🩺 健康检查 https://your-worker.workers.dev/api/health 系统健康状态
📡 渠道状态 https://your-worker.workers.dev/api/push-channels 推送渠道信息
🔧 测试钉钉 https://your-worker.workers.dev/api/test-dingtalk 钉钉推送测试
📨 测试方糖 https://your-worker.workers.dev/api/test-serverchan 方糖推送测试

📡 API 接口

发送通知

· 端点：POST /api/notify
· 请求体：
  ```json
  {
    "message": "您的车挡住出口了",
    "location": {
      "lat": 39.90923,
      "lng": 116.397428
    },
    "delayed": false
  }
  ```

获取位置信息

· 端点：GET /api/get-location?notifyId=xxx
· 返回：请求者的位置信息和地图链接

车主确认

· 端点：POST /api/owner-confirm
· 请求体：
  ```json
  {
    "notifyId": "通知ID",
    "location": {
      "lat": 39.90923,
      "lng": 116.397428
    }
  }
  ```

检查状态

· 端点：GET /api/check-status?notifyId=xxx
· 返回：通知的当前状态和确认信息

🔧 故障排除

常见问题

1. KV 绑定错误
   ```
   MOVE_CAR_STATUS.put is not a function
   ```
   解决方案：
   · 确保已正确创建 KV 命名空间
   · 检查 wrangler.toml 中的绑定配置
   · 重新部署 Worker
2. 推送失败
   · 检查环境变量是否正确配置
   · 查看 Worker 日志获取详细错误信息
   · 测试单个推送渠道是否正常
3. 位置获取失败
   · 确保浏览器已授予位置权限
   · 检查设备是否支持定位功能
   · 尝试刷新页面后重试

日志查看

使用 Wrangler CLI 查看实时日志：

```bash
# 查看最新日志
wrangler tail

# 实时监控日志
wrangler tail --format=pretty

# 仅查看错误日志
wrangler tail --format=json | grep -i error
```

🛠️ 开发与调试

本地开发

1. 安装依赖：
   ```bash
   npm install -g wrangler
   ```
2. 本地启动：
   ```bash
   wrangler dev
   ```
3. 创建本地变量文件：
   ```bash
   # .dev.vars
   DINGTALK_WEBHOOK="your_webhook"
   SERVERCHAN_SENDKEY="your_sendkey"
   ```

部署命令

```bash
# 验证配置
wrangler publish --dry-run

# 部署到生产环境
wrangler publish

# 回滚到上一个版本
wrangler rollback
```

📱 使用示例

场景一：快速通知

1. 打开主页面 https://your-worker.workers.dev/
2. 点击"获取位置"授权定位
3. 选择预设留言或自定义消息
4. 点击"一键通知车主"
5. 等待车主确认

场景二：车主确认

1. 车主收到推送通知
2. 点击通知中的确认链接
3. 在车主页面点击"正在前往"
4. 系统通知请求者车主已确认

场景三：延迟发送

1. 在没有位置信息的情况下发送通知
2. 系统提示"通知将在30秒后发送"
3. 在此期间获取位置信息
4. 30秒后自动发送带有位置的通知

🔒 安全建议

1. HTTPS 强制：确保所有请求都通过 HTTPS
2. 访问限制：可配置 IP 白名单或访问密钥
3. 日志监控：定期检查 Worker 日志
4. 密钥轮换：定期更新推送渠道的密钥
5. 速率限制：建议添加请求频率限制

📄 许可证

本项目基于 MIT 许可证开源。

🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

📞 支持与反馈

如有问题或建议，请：

1. 查看 GitHub Issues
2. 提交新的 Issue
3. 或通过邮件联系维护者

---

版本: 2.1.0
最后更新: 2024年1月
兼容性: Cloudflare Workers

💡 提示：建议定期更新代码以获取最新功能和安全修复。