# API

基础路径为 `/api/v1`。除身份选择和健康检查外，业务请求必须携带：

```http
X-Our-Tomorrow-Role: boy | girl
```

该 Header 只用于选择固定身份，不是认证凭据。

## 端点

| 方法   | 路径                             | 说明                                          |
| ------ | -------------------------------- | --------------------------------------------- |
| POST   | `/identity/select`               | 初始化并选择固定身份                          |
| PATCH  | `/couples/current`               | 按 `version` 更新纪念日或扉页句子             |
| GET    | `/statuses/current`              | 获取双方仍有效的当前状态                      |
| PUT    | `/statuses/me`                   | 新建或替换自己的当前状态                      |
| DELETE | `/statuses/me`                   | 提前收起自己的当前状态                        |
| GET    | `/notes`                         | 获取全部往来留言，按时间倒序                  |
| POST   | `/notes`                         | 独立保存并发送一张留言                        |
| POST   | `/notes/:id/mark-viewed`         | 收件人标记留言已读                            |
| POST   | `/places/nearby`                 | 将一次性 GPS 坐标转换为高德坐标并返回附近建筑 |
| GET    | `/places/status/:id/map-preview` | 获取情侣空间内状态位置的高德地图图片          |
| GET    | `/health/live`                   | 进程存活检查                                  |
| GET    | `/health/ready`                  | API 与数据库就绪检查                          |

## 位置

`latitude` 与 `longitude` 必须同时存在或同时为空。浏览器只在用户点击定位按钮时读取一次坐标；API 完成 GPS→高德坐标转换、逆地理编码和地图图片代理。请求日志不记录坐标或高德 Key。

## 留言

每次 `POST /notes` 都创建一条独立记录。留言不覆盖、不合并、不定时发送，也不自动消失。`readAt` 为空时为 `VISIBLE`，有值时为 `VIEWED`。

## 错误

```json
{
  "statusCode": 409,
  "code": "STATE_CONFLICT",
  "message": "The resource changed before this request could be applied",
  "requestId": "...",
  "timestamp": "...",
  "path": "/statuses/me"
}
```
