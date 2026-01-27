# API Routes

## Official routes

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check. |
| POST | `/api/progress/complete` | Record student completion. |
| GET | `/api/progress/completed` | Fetch completed progress. |
| POST | `/api/students/login` | Student login. |
| GET | `/api/weeks/{week:int}` | Week details. |
| GET | `/api/weeks` | Weeks list. |
| GET | `/api/routes` | Route catalog. |

## Management routes

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/ain/lin` | Admin sign-in (AIN session cookie). |
| GET | `/api/ain/me` | Fetch current admin session identity. |
| POST | `/api/ain/out` | Admin sign-out (revoke session). |
| POST | `/api/ain/pass` | Change admin password (requires session). |
| GET | `/api/mng/students` | Manage students (requires admin session). |
| POST | `/api/mng/students` | Create student (requires admin session). |
| PUT | `/api/mng/students/{studentId}` | Update student (requires admin session). |
| DELETE | `/api/mng/students/{studentId}` | Delete student (requires admin session). |
| GET | `/api/mng/cards` | Manage cards (requires admin session). |
| POST | `/api/mng/cards` | Create card (requires admin session). |
| PUT | `/api/mng/cards/{week}` | Update card (requires admin session). |
| DELETE | `/api/mng/cards/{week}` | Delete card (requires admin session). |
| GET | `/api/mng/cards/{week}/completions` | Card completions (requires admin session). |
| GET | `/api/mng/weeks/{week}/content` | Fetch week content (requires admin session). |
| PUT | `/api/mng/weeks/{week}/content` | Update week content (requires admin session). |
| POST | `/api/mng/media/sas` | Generate a short-lived SAS URL for direct image uploads (requires admin session). |

> ملاحظة: تم تعطيل/إزالة نقاط التهيئة المؤقتة لإنشاء أول مشرف بعد الإعداد الأولي.

> ملاحظة: يجب تفعيل CORS في حساب Azure Storage للسماح بالطلبات من
> `https://mango-smoke-0ebe00210.2.azurestaticapps.net` مع السماح بـ `PUT/GET/HEAD/OPTIONS`
> والرؤوس `x-ms-blob-type` و `content-type`.

## cURL examples

```bash
curl -X POST "https://<your-app>.azurestaticapps.net/api/students/login" \
  -H "Content-Type: application/json" \
  -d '{"studentId":"123456","birthYear":"2012"}'
```

```bash
curl -X GET "https://<your-app>.azurestaticapps.net/api/weeks"
```

```bash
curl -X GET "https://<your-app>.azurestaticapps.net/api/routes"
```

```bash
curl -X GET "https://<your-app>.azurestaticapps.net/api/health"
```
