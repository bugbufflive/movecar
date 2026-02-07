# 🚗 挪车服务部署手册 (Cloudflare Workers)

本指南将帮助你快速部署一套自动化的挪车通知系统，支持多种推送渠道，确保及时接收挪车请求。

---

## 🛠️ 1. 部署步骤

按照以下流程，仅需三步即可完成上线：

1. **代码导入**：将本项目提供的完整代码复制并粘贴到 [Cloudflare Worker](https://dash.cloudflare.com/) 编辑器中。
2. **环境变量**：在 Workers 设置的 **Settings -> Variables** 中配置所需的变量。
3. **KV 空间绑定**：
   - 在 **Settings -> Variables -> KV Namespace Bindings** 中添加绑定。
   - **变量名称 (Variable name)**: `MOVE_CAR_STATUS`
   - **目标空间 (KV namespace)**: 选择你预先创建好的 KV 空间。

---

## ⚙️ 2. 环境变量配置

请根据你使用的通知渠道，选择性配置以下参数。

### 📩 必需项（至少配置一种渠道）
| 变量名 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `DINGTALK_WEBHOOK` | 钉钉机器人 Webhook 地址 | `https://oapi.dingtalk.com/robot/...` |
| `SERVERCHAN_SENDKEY` | Server酱 (方糖) 推送密钥 | `SCTxxxxxxxxxxxx` |

### 🔧 可选项
| 变量名 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `PHONE_NUMBER` | 页面显示的预览/联系电话 | `13800138000` |
| `DINGTALK_SECRET` | 钉钉安全设置中的“加签”密钥 | `SECxxxxxxxx` |

---

## 🔗 3. 测试与访问地址

部署成功后，建议依次访问以下地址验证功能是否正常：

* **🌐 访客主页** `https://your-worker.workers.dev/`  
  *用途：模拟扫码者看到的挪车申请页面。*

* **👤 车主确认页** `https://your-worker.workers.dev/owner-confirm`  
  *用途：车主收到通知后，点击确认已处理的反馈页。*

* **🏥 系统健康检查** `https://your-worker.workers.dev/api/health`  
  *用途：返回 `OK` 表示服务运行正常。*

* **📊 渠道状态查询** `https://your-worker.workers.dev/api/push-channels`  
  *用途：检查当前哪些推送路径已生效。*

---

## 📝 配置文件示例

如果你喜欢在本地管理或通过脚本配置，可以参考以下格式：

```bash
# --- 钉钉配置 ---
# 钉钉机器人 Webhook
DINGTALK_WEBHOOK = "[https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx](https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx)"
# 钉钉安全加签密钥 (可选)
DINGTALK_SECRET = "SECxxxxxxxx"

# --- Server酱配置 ---
# 方糖推送 Key
SERVERCHAN_SENDKEY = "SCTxxxxxxxxxxxx"

# --- 车主信息 ---
# 车主联系电话
PHONE_NUMBER = "13800138000"
