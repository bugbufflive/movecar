addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event))
})

// ========== 配置常量 ==========
const CONFIG = {
  KV_TTL: 3600,
  NOTIFY_EXPIRY: 600,
  DELAY_TIMEOUT: 30000,
  CACHE_TTL: 60,
  APP_NAME: '挪车通知系统',
  VERSION: '2.2.0',
  LOG_EXPIRY: 86400 * 7
}

// 推送渠道配置
const PUSH_CONFIG = {
  DINGTALK_ENABLED: typeof DINGTALK_WEBHOOK !== 'undefined',
  WEWORK_ENABLED: typeof WEWORK_WEBHOOK !== 'undefined',
  PUSHPLUS_ENABLED: typeof PUSHPLUS_TOKEN !== 'undefined',
  MULTI_CHANNEL: true,
  RETRY_ATTEMPTS: 2
}

// 状态枚举
const STATUS = {
  WAITING: 'waiting',
  CONFIRMED: 'confirmed',
  ERROR: 'error',
  PENDING: 'pending'
}

// 消息模板
const MESSAGES = {
  NOTIFY_TITLE: '🚗 挪车请求',
  NOTIFY_BODY: '车旁有人等待，请尽快处理',
  DEFAULT_MESSAGE: '车旁有人等待',
  LOCATION_PROVIDED: '📍 已附带位置信息',
  LOCATION_MISSING: '⚠️ 未提供位置信息',
  ERROR: '操作失败，请重试',
  SUCCESS: '操作成功',
  DELAYED_NOTIFY: '⏳ 通知已发送（延迟30秒）'
}

// ========== 工具函数 ==========
function wgs84ToGcj02(lat, lng) {
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  if (outOfChina(lat, lng)) return { lat, lng };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}

function generateMapUrls(lat, lng) {
  try {
    const gcj = wgs84ToGcj02(lat, lng);
    return {
      amapUrl: `https://uri.amap.com/marker?position=${gcj.lng},${gcj.lat}&name=位置&src=MoveCar`,
      appleUrl: `https://maps.apple.com/?ll=${gcj.lat},${gcj.lng}&q=位置&t=m`,
      baiduUrl: `https://api.map.baidu.com/marker?location=${gcj.lat},${gcj.lng}&title=位置&output=html&coord_type=gcj02&src=MoveCar`,
      googleUrl: `https://www.google.com/maps?q=${gcj.lat},${gcj.lng}&z=17`
    };
  } catch (error) {
    console.error('地图URL生成失败:', error);
    return null;
  }
}

function validateLocation(location) {
  if (!location || typeof location !== 'object') return null;
  const lat = parseFloat(location.lat);
  const lng = parseFloat(location.lng);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
}

function generateId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function errorResponse(error, status = 500) {
  return new Response(JSON.stringify({
    success: false,
    error: error.message || '服务器内部错误',
    timestamp: Date.now(),
    requestId: generateId()
  }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function successResponse(data = {}, status = 200) {
  return new Response(JSON.stringify({
    success: true,
    data,
    timestamp: Date.now(),
    requestId: generateId()
  }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }
  });
}

// ========== 推送日志 ==========
async function logPush(channel, notifyId, success, responseData, error, event) {
  try {
    const logEntry = {
      channel,
      notifyId,
      timestamp: Date.now(),
      success,
      response: responseData || null,
      error: error ? (error.message || String(error)) : null
    };
    const logKey = `push_log_${channel}_${notifyId}_${Date.now()}`;
    await MOVE_CAR_STATUS.put(logKey, JSON.stringify(logEntry), { expirationTtl: CONFIG.LOG_EXPIRY });
  } catch (err) {
    console.error('写入推送日志失败:', err);
  }
}

// ========== 推送渠道实现 ==========
// 钉钉机器人推送
async function sendDingTalkNotification(data, event) {
  try {
    let webhookUrl = DINGTALK_WEBHOOK;
    if (typeof DINGTALK_SECRET !== 'undefined' && DINGTALK_SECRET) {
      const timestamp = Date.now();
      const stringToSign = `${timestamp}\n${DINGTALK_SECRET}`;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(DINGTALK_SECRET);
      const messageData = encoder.encode(stringToSign);
      const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = await crypto.subtle.sign('HMAC', key, messageData);
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
      const encodedSignature = encodeURIComponent(signatureBase64);
      webhookUrl += `&timestamp=${timestamp}&sign=${encodedSignature}`;
    }
    
    let text = `## ${data.title}\n\n**留言**: ${data.message}\n\n**位置状态**: ${data.locationStatus}\n\n**时间**: ${formatTime(data.timestamp)}\n\n**通知ID**: ${data.id}\n\n`;
    if (data.mapUrls) {
      text += `### 地图链接\n- [高德地图](${data.mapUrls.amapUrl})\n- [Apple地图](${data.mapUrls.appleUrl})\n- [百度地图](${data.mapUrls.baiduUrl})\n\n`;
    }
    text += `[点击确认已收到](${data.confirmUrl})`;
    
    const dingTalkMessage = {
      msgtype: "markdown",
      markdown: { title: data.title, text: text },
      at: { isAtAll: false }
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `MoveCar/${CONFIG.VERSION}` },
      body: JSON.stringify(dingTalkMessage)
    });
    const result = await response.json();
    if (result.errcode !== 0) {
      throw new Error(`钉钉推送失败: ${result.errmsg} (code: ${result.errcode})`);
    }
    event.waitUntil(logPush('dingtalk', data.id, true, result, null, event));
    return { success: true, response: result, timestamp: Date.now() };
  } catch (error) {
    event.waitUntil(logPush('dingtalk', data.id, false, null, error, event));
    console.error('钉钉推送失败:', error);
    throw error;
  }
}

// 企业微信机器人推送（模板卡片）
async function sendWeWorkNotification(data, event) {
  try {
    const webhookUrl = WEWORK_WEBHOOK;
    
    const templateCard = {
      msgtype: "template_card",
      template_card: {
        card_type: "text_notice",
        source: {
          icon_url: "https://wework.qpic.cn/wwpic/252813_jOfDHtcISzuodLa_1629280209/0",
          desc: "挪车通知系统",
          desc_color: 0
        },
        main_title: {
          title: data.title,
          desc: data.message
        },
        emphasis_content: {
          title: "🚗",
          desc: "请尽快处理"
        },
        sub_title_text: `位置状态：${data.locationStatus}`,
        horizontal_content_list: [
          { keyname: "留言", value: data.message },
          { keyname: "时间", value: formatTime(data.timestamp) },
          { keyname: "通知ID", value: data.id }
        ],
        jump_list: [
          { type: 1, url: data.confirmUrl, title: "✅ 确认已收到" }
        ],
        card_action: {
          type: 1,
          url: data.confirmUrl
        }
      }
    };
    
    if (data.mapUrls) {
      if (data.mapUrls.amapUrl) {
        templateCard.template_card.horizontal_content_list.push({
          keyname: "高德地图",
          value: "点击导航",
          type: 1,
          url: data.mapUrls.amapUrl
        });
      }
      if (data.mapUrls.appleUrl) {
        templateCard.template_card.horizontal_content_list.push({
          keyname: "Apple地图",
          value: "点击导航",
          type: 1,
          url: data.mapUrls.appleUrl
        });
      }
      if (data.mapUrls.baiduUrl) {
        templateCard.template_card.horizontal_content_list.push({
          keyname: "百度地图",
          value: "点击导航",
          type: 1,
          url: data.mapUrls.baiduUrl
        });
      }
    }
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `MoveCar/${CONFIG.VERSION}` },
      body: JSON.stringify(templateCard)
    });
    const result = await response.json();
    if (result.errcode !== 0) {
      throw new Error(`企业微信推送失败: ${result.errmsg} (code: ${result.errcode})`);
    }
    event.waitUntil(logPush('wework', data.id, true, result, null, event));
    return { success: true, response: result, timestamp: Date.now() };
  } catch (error) {
    event.waitUntil(logPush('wework', data.id, false, null, error, event));
    console.error('企业微信推送失败:', error);
    throw error;
  }
}

// PushPlus 推送（微信）
async function sendPushPlusNotification(data, event) {
  try {
    const pushplusUrl = 'https://www.pushplus.plus/send';
    const token = PUSHPLUS_TOKEN;
    
    let content = `## ${data.title}\n\n`;
    content += `**留言**：${data.message}\n\n`;
    content += `**位置状态**：${data.locationStatus}\n\n`;
    content += `**时间**：${formatTime(data.timestamp)}\n\n`;
    content += `**通知ID**：${data.id}\n\n`;
    
    if (data.mapUrls) {
      content += `### 地图导航\n`;
      content += `[高德地图](${data.mapUrls.amapUrl}) | [Apple地图](${data.mapUrls.appleUrl}) | [百度地图](${data.mapUrls.baiduUrl})\n\n`;
    }
    
    content += `[点击确认已收到](${data.confirmUrl})`;
    
    const params = new URLSearchParams();
    params.append('token', token);
    params.append('title', data.title);
    params.append('content', content);
    params.append('template', 'markdown');
    
    const response = await fetch(pushplusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    
    const result = await response.json();
    if (result.code !== 200) {
      throw new Error(`PushPlus推送失败: ${result.msg} (code: ${result.code})`);
    }
    event.waitUntil(logPush('pushplus', data.id, true, result, null, event));
    return { success: true, response: result, timestamp: Date.now() };
  } catch (error) {
    event.waitUntil(logPush('pushplus', data.id, false, null, error, event));
    console.error('PushPlus推送失败:', error);
    throw error;
  }
}

// 发送通知到所有渠道
async function sendNotifications(data, event) {
  const results = [];
  const promises = [];
  await MOVE_CAR_STATUS.put(`notify_status_${data.id}`, 'sending', { expirationTtl: CONFIG.NOTIFY_EXPIRY });
  
  if (PUSH_CONFIG.DINGTALK_ENABLED && typeof DINGTALK_WEBHOOK !== 'undefined') {
    promises.push(
      sendDingTalkNotification(data, event).then(result => {
        results.push({ channel: 'dingtalk', ...result });
      }).catch(error => {
        results.push({ channel: 'dingtalk', success: false, error: error.message });
      })
    );
  }
  if (PUSH_CONFIG.WEWORK_ENABLED && typeof WEWORK_WEBHOOK !== 'undefined') {
    promises.push(
      sendWeWorkNotification(data, event).then(result => {
        results.push({ channel: 'wework', ...result });
      }).catch(error => {
        results.push({ channel: 'wework', success: false, error: error.message });
      })
    );
  }
  if (PUSH_CONFIG.PUSHPLUS_ENABLED && typeof PUSHPLUS_TOKEN !== 'undefined') {
    promises.push(
      sendPushPlusNotification(data, event).then(result => {
        results.push({ channel: 'pushplus', ...result });
      }).catch(error => {
        results.push({ channel: 'pushplus', success: false, error: error.message });
      })
    );
  }
  
  if (promises.length > 0) {
    await Promise.allSettled(promises);
    const success = results.some(r => r.success);
    await MOVE_CAR_STATUS.put(`notify_status_${data.id}`, success ? 'sent' : 'failed', { expirationTtl: CONFIG.NOTIFY_EXPIRY });
  } else {
    throw new Error('未启用任何推送渠道');
  }
  return results;
}

// ========== API处理函数 ==========
async function handleHealthCheck() {
  const kvStatus = typeof MOVE_CAR_STATUS !== 'undefined';
  const now = Date.now();
  let startTime = await MOVE_CAR_STATUS.get('start_time');
  if (!startTime) {
    startTime = now;
    await MOVE_CAR_STATUS.put('start_time', startTime.toString(), { expirationTtl: 86400 * 30 });
  }
  return successResponse({
    status: 'healthy',
    timestamp: now,
    uptime: now - parseInt(startTime),
    services: {
      kv: kvStatus,
      dingtalk: PUSH_CONFIG.DINGTALK_ENABLED,
      wework: PUSH_CONFIG.WEWORK_ENABLED,
      pushplus: PUSH_CONFIG.PUSHPLUS_ENABLED
    },
    config: { version: CONFIG.VERSION, multiChannel: PUSH_CONFIG.MULTI_CHANNEL }
  });
}

async function handlePushChannelsInfo() {
  const channels = {
    dingtalk: {
      enabled: PUSH_CONFIG.DINGTALK_ENABLED,
      configured: typeof DINGTALK_WEBHOOK !== 'undefined',
      hasSecret: typeof DINGTALK_SECRET !== 'undefined',
      name: '钉钉机器人',
      description: '钉钉群聊机器人推送',
      icon: '🤖'
    },
    wework: {
      enabled: PUSH_CONFIG.WEWORK_ENABLED,
      configured: typeof WEWORK_WEBHOOK !== 'undefined',
      name: '企业微信机器人',
      description: '企业微信群机器人推送',
      icon: '💬'
    },
    pushplus: {
      enabled: PUSH_CONFIG.PUSHPLUS_ENABLED,
      configured: typeof PUSHPLUS_TOKEN !== 'undefined',
      name: 'PushPlus',
      description: '微信推送服务（通过PushPlus）',
      icon: '📱'
    }
  };
  return successResponse({
    channels,
    multiChannel: PUSH_CONFIG.MULTI_CHANNEL,
    activeChannels: Object.values(channels).filter(c => c.configured).length
  });
}

async function handleNotify(request, url, event) {
  try {
    const body = await request.json();
    const message = body.message?.trim() || MESSAGES.DEFAULT_MESSAGE;
    const location = validateLocation(body.location);
    const delayed = body.delayed || false;
    const notifyId = generateId(12);
    const confirmUrl = `${url.origin}/owner-confirm?notifyId=${notifyId}`;
    
    const notifyData = {
      id: notifyId,
      title: MESSAGES.NOTIFY_TITLE,
      message: message,
      location: location,
      confirmUrl: confirmUrl,
      origin: url.origin,
      timestamp: Date.now(),
      status: STATUS.PENDING,
      requesterInfo: {
        ip: request.headers.get('cf-connecting-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    };
    
    if (location) {
      const urls = generateMapUrls(location.lat, location.lng);
      if (urls) {
        notifyData.mapUrls = urls;
        notifyData.locationStatus = MESSAGES.LOCATION_PROVIDED;
        await MOVE_CAR_STATUS.put(`requester_location_${notifyId}`, JSON.stringify({
          lat: location.lat, lng: location.lng, ...urls, timestamp: Date.now()
        }), { expirationTtl: CONFIG.KV_TTL });
      } else {
        notifyData.locationStatus = MESSAGES.LOCATION_MISSING;
      }
    } else {
      notifyData.locationStatus = MESSAGES.LOCATION_MISSING;
    }
    
    await MOVE_CAR_STATUS.put(`notify_record_${notifyId}`, JSON.stringify(notifyData), { expirationTtl: CONFIG.KV_TTL });
    await MOVE_CAR_STATUS.put(`notify_status_${notifyId}`, STATUS.WAITING, { expirationTtl: CONFIG.NOTIFY_EXPIRY });
    await updateStats('total_requests');
    
    if (delayed) {
      setTimeout(async () => {
        await sendNotifications(notifyData, event);
      }, CONFIG.DELAY_TIMEOUT);
      return successResponse({
        id: notifyId,
        status: 'delayed',
        message: MESSAGES.DELAYED_NOTIFY,
        estimatedTime: Date.now() + CONFIG.DELAY_TIMEOUT,
        hasLocation: !!location
      });
    } else {
      const pushResults = await sendNotifications(notifyData, event);
      const success = pushResults.some(r => r.success);
      if (success) await updateStats('success_requests');
      return successResponse({
        id: notifyId,
        status: success ? 'sent' : 'failed',
        message: success ? MESSAGES.SUCCESS : MESSAGES.ERROR,
        hasLocation: !!location,
        channels: pushResults,
        summary: {
          total: pushResults.length,
          success: pushResults.filter(r => r.success).length,
          failed: pushResults.filter(r => !r.success).length
        }
      });
    }
  } catch (error) {
    console.error('通知发送失败:', error);
    return errorResponse(error);
  }
}

async function updateStats(type) {
  const key = `stats_${type}`;
  let value = await MOVE_CAR_STATUS.get(key) || '0';
  value = (parseInt(value) + 1).toString();
  await MOVE_CAR_STATUS.put(key, value, { expirationTtl: 86400 * 30 });
  await MOVE_CAR_STATUS.put('stats_last_request', Date.now().toString(), { expirationTtl: 86400 * 30 });
}

async function handleGetLocation(request) {
  try {
    const notifyId = new URL(request.url).searchParams.get('notifyId');
    if (!notifyId) return errorResponse(new Error('缺少通知ID参数'), 400);
    const data = await MOVE_CAR_STATUS.get(`requester_location_${notifyId}`);
    if (data) return successResponse(JSON.parse(data));
    return errorResponse(new Error('位置信息不存在或已过期'), 404);
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleOwnerConfirmAction(request) {
  try {
    const body = await request.json();
    const notifyId = body.notifyId || generateId(12);
    const ownerLocation = validateLocation(body.location);
    let locationData = null;
    if (ownerLocation) {
      const urls = generateMapUrls(ownerLocation.lat, ownerLocation.lng);
      if (urls) {
        locationData = { lat: ownerLocation.lat, lng: ownerLocation.lng, ...urls, timestamp: Date.now(), type: 'owner_location' };
        await MOVE_CAR_STATUS.put(`owner_location_${notifyId}`, JSON.stringify(locationData), { expirationTtl: CONFIG.KV_TTL });
      }
    }
    await MOVE_CAR_STATUS.put(`notify_status_${notifyId}`, STATUS.CONFIRMED, { expirationTtl: CONFIG.NOTIFY_EXPIRY });
    await MOVE_CAR_STATUS.put(`notify_confirmed_${notifyId}`, Date.now().toString(), { expirationTtl: CONFIG.KV_TTL });
    return successResponse({ message: '确认成功', hasLocation: !!locationData, notifyId, timestamp: Date.now() });
  } catch (error) {
    const notifyId = body.notifyId || generateId(12);
    await MOVE_CAR_STATUS.put(`notify_status_${notifyId}`, STATUS.CONFIRMED, { expirationTtl: CONFIG.NOTIFY_EXPIRY });
    return successResponse({ message: '确认成功（位置信息处理失败）', error: error.message, notifyId });
  }
}

async function handleCheckStatus(request) {
  try {
    const notifyId = new URL(request.url).searchParams.get('notifyId');
    if (!notifyId) return errorResponse(new Error('缺少通知ID参数'), 400);
    const [status, ownerLocation, confirmedTime] = await Promise.all([
      MOVE_CAR_STATUS.get(`notify_status_${notifyId}`),
      MOVE_CAR_STATUS.get(`owner_location_${notifyId}`),
      MOVE_CAR_STATUS.get(`notify_confirmed_${notifyId}`)
    ]);
    return successResponse({
      status: status || STATUS.WAITING,
      ownerLocation: ownerLocation ? JSON.parse(ownerLocation) : null,
      confirmedTime: confirmedTime ? parseInt(confirmedTime) : null,
      confirmedAgo: confirmedTime ? Date.now() - parseInt(confirmedTime) : null,
      timestamp: Date.now()
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function testDingTalkPush(event) {
  try {
    if (typeof DINGTALK_WEBHOOK === 'undefined') return errorResponse(new Error('钉钉机器人未配置'), 400);
    const testData = {
      id: generateId(12),
      title: '🚗 挪车通知测试',
      message: '这是一条测试消息，用于验证钉钉机器人配置是否正常。关键词：挪车',
      locationStatus: MESSAGES.LOCATION_PROVIDED,
      confirmUrl: 'https://car.fireboxwork.workers.dev/owner-confirm?test=true',
      origin: 'https://car.fireboxwork.workers.dev',
      timestamp: Date.now(),
      mapUrls: {
        amapUrl: 'https://uri.amap.com/marker?position=116.397428,39.90923&name=测试位置',
        appleUrl: 'https://maps.apple.com/?ll=39.90923,116.397428&q=测试位置',
        baiduUrl: 'https://api.map.baidu.com/marker?location=39.90923,116.397428&title=测试位置'
      }
    };
    const result = await sendDingTalkNotification(testData, event);
    return successResponse({ message: '钉钉测试推送发送成功！请检查钉钉群是否收到消息。', result, timestamp: Date.now() });
  } catch (error) {
    return errorResponse(error);
  }
}

async function testWeWorkPush(event) {
  try {
    if (typeof WEWORK_WEBHOOK === 'undefined') return errorResponse(new Error('企业微信机器人未配置'), 400);
    const testData = {
      id: generateId(12),
      title: '🚗 挪车通知测试',
      message: '这是一条测试消息，用于验证企业微信机器人配置是否正常。',
      locationStatus: MESSAGES.LOCATION_PROVIDED,
      confirmUrl: 'https://car.fireboxwork.workers.dev/owner-confirm?test=true',
      origin: 'https://car.fireboxwork.workers.dev',
      timestamp: Date.now(),
      mapUrls: {
        amapUrl: 'https://uri.amap.com/marker?position=116.397428,39.90923&name=测试位置',
        appleUrl: 'https://maps.apple.com/?ll=39.90923,116.397428&q=测试位置',
        baiduUrl: 'https://api.map.baidu.com/marker?location=39.90923,116.397428&title=测试位置'
      }
    };
    const result = await sendWeWorkNotification(testData, event);
    return successResponse({ message: '企业微信测试推送发送成功！请检查企业微信群是否收到消息。', result, timestamp: Date.now() });
  } catch (error) {
    return errorResponse(error);
  }
}

async function testPushPlusPush(event) {
  try {
    if (typeof PUSHPLUS_TOKEN === 'undefined') return errorResponse(new Error('PushPlus未配置'), 400);
    const testData = {
      id: generateId(12),
      title: '🚗 挪车通知测试',
      message: '这是一条测试消息，用于验证PushPlus配置是否正常。',
      locationStatus: MESSAGES.LOCATION_PROVIDED,
      confirmUrl: 'https://car.fireboxwork.workers.dev/owner-confirm?test=true',
      origin: 'https://car.fireboxwork.workers.dev',
      timestamp: Date.now(),
      mapUrls: {
        amapUrl: 'https://uri.amap.com/marker?position=116.397428,39.90923&name=测试位置',
        appleUrl: 'https://maps.apple.com/?ll=39.90923,116.397428&q=测试位置',
        baiduUrl: 'https://api.map.baidu.com/marker?location=39.90923,116.397428&title=测试位置'
      }
    };
    const result = await sendPushPlusNotification(testData, event);
    return successResponse({ message: 'PushPlus测试推送发送成功！请检查微信是否收到消息。', result, timestamp: Date.now() });
  } catch (error) {
    return errorResponse(error);
  }
}

// ========== 主请求处理器 ==========
async function handleRequest(request, event) {
  const url = new URL(request.url);
  const path = url.pathname;
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    if (path.startsWith('/api/')) {
      if (path === '/api/health') return handleHealthCheck();
      if (path === '/api/push-channels') return handlePushChannelsInfo();
      if (path === '/api/notify' && request.method === 'POST') return await handleNotify(request, url, event);
      if (path === '/api/get-location') return await handleGetLocation(request);
      if (path === '/api/owner-confirm' && request.method === 'POST') return await handleOwnerConfirmAction(request);
      if (path === '/api/check-status') return await handleCheckStatus(request);
      if (path === '/api/test-dingtalk') return await testDingTalkPush(event);
      if (path === '/api/test-wework') return await testWeWorkPush(event);
      if (path === '/api/test-pushplus') return await testPushPlusPush(event);
      return new Response('Not Found', { status: 404 });
    }
    if (path === '/owner-confirm') return await renderOwnerPage(url.origin);
    return await renderMainPage(url.origin);
  } catch (error) {
    console.error('请求处理错误:', error);
    return errorResponse(error, 500);
  }
}

// ========== 页面渲染函数 ==========
async function renderConfigErrorPage() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>配置错误 - ${CONFIG.APP_NAME}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      margin: 0;
    }
    .error-container {
      max-width: 500px;
      width: 100%;
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      text-align: center;
    }
    .error-icon { font-size: 64px; color: #ef4444; margin-bottom: 20px; }
    h1 { color: #1f2937; margin-bottom: 16px; font-size: 24px; }
    p { color: #6b7280; margin-bottom: 24px; line-height: 1.6; }
    .config-steps { text-align: left; background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .config-step { margin-bottom: 12px; padding-left: 24px; position: relative; }
    .config-step:before { content: '•'; position: absolute; left: 8px; color: #3b82f6; font-weight: bold; }
    code { background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 14px; }
    .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; transition: background 0.2s; }
    .btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <h1>推送渠道未配置</h1>
    <p>请至少配置一个推送渠道才能使用${CONFIG.APP_NAME}</p>
    <div class="config-steps">
      <div class="config-step">在Cloudflare Workers环境变量中添加：</div>
      <div class="config-step"><code>DINGTALK_WEBHOOK = "your_webhook_url"</code> (钉钉机器人)</div>
      <div class="config-step"><code>WEWORK_WEBHOOK = "your_webhook_url"</code> (企业微信机器人)</div>
      <div class="config-step"><code>PUSHPLUS_TOKEN = "your_token"</code> (PushPlus)</div>
    </div>
    <a href="https://developers.cloudflare.com/workers/platform/environment-variables/" class="btn" target="_blank">查看配置文档</a>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

async function renderMainPage(origin) {
  const phone = typeof PHONE_NUMBER !== 'undefined' ? PHONE_NUMBER : '';
  const hasAtLeastOneChannel = PUSH_CONFIG.DINGTALK_ENABLED || PUSH_CONFIG.WEWORK_ENABLED || PUSH_CONFIG.PUSHPLUS_ENABLED;
  if (!hasAtLeastOneChannel) return renderConfigErrorPage();
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CONFIG.APP_NAME}</title>
  <style>
    :root {
      --primary: #0093E9;
      --secondary: #80D0C7;
      --success: #10B981;
      --warning: #F59E0B;
      --danger: #EF4444;
      --light: #F9FAFB;
      --dark: #1F2937;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      min-height: 100vh;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .container { width: 100%; max-width: 500px; }
    .card {
      background: white;
      border-radius: 20px;
      padding: 30px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
      margin-bottom: 20px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover { transform: translateY(-4px); box-shadow: 0 24px 48px rgba(0, 0, 0, 0.15); }
    .header { text-align: center; padding: 30px 20px; }
    .icon {
      width: 80px; height: 80px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .icon span { font-size: 40px; color: white; }
    h1 { color: var(--dark); margin-bottom: 10px; font-size: 28px; }
    .subtitle { color: #6B7280; font-size: 16px; }
    .input-group { margin-bottom: 20px; }
    textarea {
      width: 100%; min-height: 120px; padding: 15px;
      border: 2px solid #E5E7EB; border-radius: 12px;
      font-size: 16px; font-family: inherit; resize: vertical;
      transition: border-color 0.3s;
    }
    textarea:focus { outline: none; border-color: var(--primary); }
    .tags { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; }
    .tag {
      background: #F3F4F6; color: #4B5563; padding: 10px 15px;
      border-radius: 20px; font-size: 14px; cursor: pointer;
      transition: all 0.2s; border: none;
    }
    .tag:hover { background: #E5E7EB; transform: translateY(-2px); }
    .tag:active { transform: scale(0.98); }
    .location-card {
      display: flex; align-items: center; padding: 20px;
      background: #F9FAFB; border-radius: 12px; margin-bottom: 20px;
      cursor: pointer; transition: background 0.2s, transform 0.2s;
    }
    .location-card:hover { background: #F3F4F6; }
    .location-card:active { transform: scale(0.99); }
    .location-icon {
      width: 50px; height: 50px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      border-radius: 12px; display: flex; align-items: center; justify-content: center;
      margin-right: 15px;
    }
    .location-icon span { font-size: 24px; color: white; }
    .location-content { flex: 1; }
    .location-title { font-weight: 600; color: var(--dark); margin-bottom: 5px; }
    .location-status { color: #6B7280; font-size: 14px; }
    .btn-primary {
      width: 100%; padding: 18px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: 600;
      cursor: pointer; transition: transform 0.2s; display: flex;
      align-items: center; justify-content: center; gap: 10px;
    }
    .btn-primary:hover { transform: translateY(-2px); }
    .btn-primary:active { transform: scale(0.98); }
    .channels-status { display: flex; justify-content: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    .channel-badge {
      padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600;
      display: flex; align-items: center; gap: 5px;
    }
    .channel-badge.active { background: #D1FAE5; color: #065F46; }
    .channel-badge.inactive { background: #F3F4F6; color: #6B7280; }
    .channel-dot { width: 8px; height: 8px; border-radius: 50%; }
    .active .channel-dot { background: #10B981; }
    .inactive .channel-dot { background: #9CA3AF; }
    .toast {
      position: fixed; top: 20px; left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background: white; padding: 15px 25px; border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1); font-weight: 600;
      opacity: 0; transition: all 0.3s; z-index: 1000;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    @media (max-width: 480px) {
      .card { padding: 20px; }
      .header { padding: 20px 15px; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card header">
      <div class="icon"><span>🚗</span></div>
      <h1>${CONFIG.APP_NAME}</h1>
      <p class="subtitle">一键通知车主挪车</p>
    </div>
    <div class="card">
      <div class="input-group">
        <textarea id="messageInput" placeholder="请输入留言给车主...（可选）"></textarea>
        <div class="tags">
          <button class="tag" onclick="setMessage('您的车挡住出口了')">🚗 挡路</button>
          <button class="tag" onclick="setMessage('临时停靠，请尽快挪车')">⏱️ 临停</button>
          <button class="tag" onclick="setMessage('电话无法接通')">📞 未接</button>
          <button class="tag" onclick="setMessage('麻烦尽快挪车，谢谢')">🙏 加急</button>
        </div>
      </div>
      <div class="location-card" onclick="requestLocation()">
        <div class="location-icon"><span id="locationIcon">📍</span></div>
        <div class="location-content">
          <div class="location-title">我的位置</div>
          <div class="location-status" id="locationStatus">点击获取位置信息</div>
        </div>
      </div>
      <button id="notifyBtn" class="btn-primary" onclick="sendNotification()">
        <span>🔔</span><span>一键通知车主</span>
      </button>
      <div class="channels-status" id="channelsStatus"></div>
    </div>
  </div>
  <div id="toast" class="toast"></div>
  <script>
    let userLocation = null;
    let notificationId = null;
    window.addEventListener('DOMContentLoaded', () => { checkPushChannels(); });
    function setMessage(message) { document.getElementById('messageInput').value = message; }
    async function requestLocation() {
      const statusEl = document.getElementById('locationStatus');
      const iconEl = document.getElementById('locationIcon');
      statusEl.textContent = '正在获取位置...';
      iconEl.textContent = '⏳';
      if (!navigator.geolocation) {
        statusEl.textContent = '❌ 浏览器不支持定位';
        iconEl.textContent = '📍';
        return;
      }
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        });
        userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        statusEl.textContent = '✅ 位置获取成功';
        iconEl.textContent = '📍';
      } catch (error) {
        let msg = '❌ 位置获取失败';
        if (error.code === error.PERMISSION_DENIED) msg = '❌ 位置权限被拒绝';
        else if (error.code === error.TIMEOUT) msg = '❌ 定位超时';
        statusEl.textContent = msg;
        iconEl.textContent = '📍';
      }
    }
    async function checkPushChannels() {
      try {
        const response = await fetch('/api/push-channels');
        const data = await response.json();
        updateChannelStatus(data.data.channels);
      } catch (error) { console.error('渠道检查失败:', error); }
    }
    function updateChannelStatus(channels) {
      const container = document.getElementById('channelsStatus');
      let html = '';
      if (channels.dingtalk.enabled) {
        html += \`<div class="channel-badge \${channels.dingtalk.configured ? 'active' : 'inactive'}" title="\${channels.dingtalk.description}">
          <span class="channel-dot"></span><span>\${channels.dingtalk.icon} \${channels.dingtalk.name}</span>
        </div>\`;
      }
      if (channels.wework.enabled) {
        html += \`<div class="channel-badge \${channels.wework.configured ? 'active' : 'inactive'}" title="\${channels.wework.description}">
          <span class="channel-dot"></span><span>\${channels.wework.icon} \${channels.wework.name}</span>
        </div>\`;
      }
      if (channels.pushplus && channels.pushplus.enabled) {
        html += \`<div class="channel-badge \${channels.pushplus.configured ? 'active' : 'inactive'}" title="\${channels.pushplus.description}">
          <span class="channel-dot"></span><span>\${channels.pushplus.icon} \${channels.pushplus.name}</span>
        </div>\`;
      }
      container.innerHTML = html;
    }
    async function sendNotification() {
      const btn = document.getElementById('notifyBtn');
      const message = document.getElementById('messageInput').value.trim();
      const delayed = !userLocation;
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span>⏳</span><span>发送中...</span>';
      try {
        const response = await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message || '车旁有人等待，请尽快挪车', location: userLocation, delayed: delayed })
        });
        const data = await response.json();
        if (data.success) {
          notificationId = data.data.id;
          showToast(delayed ? '⏳ 通知将在30秒后发送' : '✅ 通知发送成功', delayed ? 'warning' : 'success');
          showSuccessPage(data.data);
        } else {
          throw new Error(data.error || '发送失败');
        }
      } catch (error) {
        showToast(\`❌ \${error.message}\`, 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
    function showSuccessPage(data) {
      const container = document.querySelector('.container');
      const channelName = (c) => {
        if (c.channel === 'dingtalk') return '钉钉';
        if (c.channel === 'wework') return '企业微信';
        if (c.channel === 'pushplus') return '微信';
        return c.channel;
      };
      const channelsText = data.channels.filter(c => c.success).map(channelName).join('、');
      container.innerHTML = \`
        <div class="card header">
          <div class="icon" style="background: linear-gradient(135deg, #10B981, #059669);"><span>✅</span></div>
          <h1>通知已发送！</h1>
          <p class="subtitle">车主已收到通知，正在赶来...</p>
        </div>
        <div class="card">
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 20px;">🎉</div>
            <h2 style="margin-bottom: 10px;">等待车主回应</h2>
            <p style="color: #6B7280; margin-bottom: 30px;">已通过\${channelsText}发送通知</p>
            <div id="ownerStatus" style="display: none; background: #D1FAE5; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <h3 style="color: #065F46;">车主已确认</h3>
              <p style="color: #065F46;">正在赶来，请稍候</p>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px;">
              <button class="tag" onclick="location.reload()" style="flex: 1; background: var(--primary); color: white;">再次通知</button>
              \${'${phone}' ? \`<a href="tel:${phone}" class="tag" style="flex: 1; background: var(--danger); color: white; text-decoration: none; text-align: center;">拨打电话</a>\` : ''}
            </div>
          </div>
        </div>
      \`;
      startStatusPolling();
    }
    function startStatusPolling() {
      if (!notificationId) return;
      const interval = setInterval(async () => {
        try {
          const response = await fetch(\`/api/check-status?notifyId=\${notificationId}\`);
          const data = await response.json();
          if (data.success && data.data.status === 'confirmed') {
            const ownerStatus = document.getElementById('ownerStatus');
            if (ownerStatus) ownerStatus.style.display = 'block';
            clearInterval(interval);
          }
        } catch (error) { console.error('状态检查失败:', error); }
      }, 3000);
      setTimeout(() => clearInterval(interval), 120000);
    }
    function showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast';
      if (type === 'error') { toast.style.background = '#FEE2E2'; toast.style.color = '#991B1B'; }
      else if (type === 'success') { toast.style.background = '#D1FAE5'; toast.style.color = '#065F46'; }
      else if (type === 'warning') { toast.style.background = '#FEF3C7'; toast.style.color = '#92400E'; }
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-cache' } });
}

async function renderOwnerPage(origin) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>车主确认 - ${CONFIG.APP_NAME}</title>
  <style>
    :root { --primary: #667eea; --secondary: #764ba2; --success: #10B981; --warning: #F59E0B; --danger: #EF4444; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      min-height: 100vh; padding: 20px; display: flex; justify-content: center; align-items: center;
    }
    .container { width: 100%; max-width: 400px; }
    .card {
      background: white; border-radius: 20px; padding: 40px 30px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1); text-align: center;
    }
    .emoji { font-size: 60px; margin-bottom: 20px; display: block; }
    h1 { color: #1F2937; margin-bottom: 10px; font-size: 24px; }
    .subtitle { color: #6B7280; margin-bottom: 30px; line-height: 1.5; }
    .location-section {
      background: #F3F4F6; border-radius: 12px; padding: 20px; margin-bottom: 20px;
      text-align: left; display: none;
    }
    .location-section.show { display: block; }
    .location-section p { color: #4B5563; margin-bottom: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .map-links { display: flex; flex-direction: column; gap: 10px; }
    .map-btn {
      padding: 12px; border-radius: 10px; text-decoration: none; font-weight: 600;
      text-align: center; transition: transform 0.3s; display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .map-btn:hover { transform: translateY(-2px); }
    .map-btn.amap { background: #1890ff; color: white; }
    .map-btn.apple { background: #1d1d1f; color: white; }
    .map-btn.baidu { background: #2932e1; color: white; }
    .btn {
      width: 100%; padding: 18px; background: linear-gradient(135deg, var(--success), #059669);
      color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: 600;
      cursor: pointer; transition: transform 0.3s; display: flex; align-items: center;
      justify-content: center; gap: 10px; margin-bottom: 20px;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn:active { transform: translateY(0); }
    .btn:disabled { background: #9CA3AF; cursor: not-allowed; }
    .success-message {
      background: #D1FAE5; border-radius: 12px; padding: 20px;
      color: #065F46; font-weight: 600; display: none;
    }
    .success-message.show { display: block; }
    .footer { margin-top: 20px; font-size: 12px; color: #9CA3AF; text-align: center; }
    @media (max-width: 480px) { .card { padding: 30px 20px; } .emoji { font-size: 50px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <span class="emoji">👋</span>
      <h1>收到挪车请求</h1>
      <p class="subtitle">对方正在等待，请尽快确认处理</p>
      <div id="locationArea" class="location-section">
        <p>📍 对方位置</p>
        <div class="map-links">
          <a id="amapLink" href="#" target="_blank" class="map-btn amap"><span>🗺️</span><span>高德地图</span></a>
          <a id="appleLink" href="#" target="_blank" class="map-btn apple"><span>🍎</span><span>Apple地图</span></a>
          <a id="baiduLink" href="#" target="_blank" class="map-btn baidu"><span>🔍</span><span>百度地图</span></a>
        </div>
      </div>
      <button id="confirmBtn" class="btn" onclick="confirmMove()"><span>🚗</span><span>我已知晓，正在前往</span></button>
      <div id="successMessage" class="success-message"><span>✅</span><span>已通知对方您正在赶来！</span></div>
      <div class="footer"><p>${CONFIG.APP_NAME} v${CONFIG.VERSION}</p></div>
    </div>
  </div>
  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const notifyId = urlParams.get('notifyId');
    const isTest = urlParams.get('test') === 'true';
    window.addEventListener('DOMContentLoaded', async () => {
      if (isTest) {
        document.querySelector('h1').textContent = '测试通知';
        document.querySelector('.subtitle').textContent = '这是一条测试消息';
      }
      if (notifyId) {
        try {
          const response = await fetch(\`/api/get-location?notifyId=\${notifyId}\`);
          const data = await response.json();
          if (data.success && data.data) {
            const locationArea = document.getElementById('locationArea');
            const amapLink = document.getElementById('amapLink');
            const appleLink = document.getElementById('appleLink');
            const baiduLink = document.getElementById('baiduLink');
            if (data.data.amapUrl) {
              locationArea.classList.add('show');
              amapLink.href = data.data.amapUrl;
              appleLink.href = data.data.appleUrl;
              baiduLink.href = data.data.baiduUrl;
            }
          }
        } catch (error) { console.log('获取位置信息失败:', error); }
      }
    });
    async function confirmMove() {
      const btn = document.getElementById('confirmBtn');
      const successMsg = document.getElementById('successMessage');
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>确认中...</span>';
      let ownerLocation = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
          });
          ownerLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        } catch (error) { console.log('位置获取失败:', error); }
      }
      try {
        const response = await fetch('/api/owner-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notifyId: notifyId || 'test_' + Date.now(), location: ownerLocation })
        });
        const data = await response.json();
        if (data.success) {
          btn.innerHTML = '<span>✅</span><span>已确认</span>';
          btn.style.background = '#9CA3AF';
          successMsg.classList.add('show');
          if (isTest) setTimeout(() => window.close(), 3000);
        } else {
          throw new Error(data.error || '确认失败');
        }
      } catch (error) {
        console.error('确认失败:', error);
        btn.disabled = false;
        btn.innerHTML = '<span>🚗</span><span>我已知晓，正在前往</span>';
        alert('确认失败，请重试: ' + error.message);
      }
    }
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-cache' } });
}
