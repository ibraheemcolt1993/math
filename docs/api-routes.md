# API Routes

## Official routes

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/cards` | Public cards list. |
| GET | `/api/health` | Health check. |
| POST | `/api/progress/complete` | Record student completion. |
| GET | `/api/progress/completed` | Fetch completed progress. |
| POST | `/api/students/login` | Student login. |
| GET, PUT | `/api/weeks/{week:int}` | Week details. |
| GET | `/api/weeks` | Weeks list. |
| GET | `/api/routes` | Route catalog. |

## cURL examples

```bash
curl -X POST "https://<your-app>.azurestaticapps.net/api/students/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"student","password":"secret"}'
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
