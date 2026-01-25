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
| POST | `/api/mng/media/sas` | Generate a short-lived SAS URL for direct image uploads. |

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
