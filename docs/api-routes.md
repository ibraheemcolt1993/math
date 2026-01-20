# API Routes

## Official routes

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/login` | Admin login. |
| PUT | `/api/auth/password` | Admin password update. |
| GET, PUT | `/api/admin/students` | Admin students management. |
| GET, PUT | `/api/cards-mng` | Admin cards management. |
| GET | `/api/cards` | Public cards list. |
| GET | `/api/health` | Health check. |
| POST | `/api/progress/complete` | Record student completion. |
| GET | `/api/progress/completed` | Fetch completed progress. |
| POST | `/api/students/login` | Student login. |
| GET, PUT | `/api/weeks/{week:int}` | Week details. |
| GET | `/api/weeks` | Weeks list. |
| GET | `/api/routes` | Route catalog. |

## Aliases (legacy compatibility)

| Method | Alias | Targets |
| --- | --- | --- |
| POST | `/api/admin/login` | `/api/auth/login` |
| PUT | `/api/admin/password` | `/api/auth/password` |
| GET, PUT | `/api/astu` | `/api/admin/students` |

## cURL examples

```bash
curl -X POST "https://<your-app>.azurestaticapps.net/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}'
```

```bash
curl -X POST "https://<your-app>.azurestaticapps.net/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}'
```

```bash
curl -X GET "https://<your-app>.azurestaticapps.net/api/admin/students"
```

```bash
curl -X PUT "https://<your-app>.azurestaticapps.net/api/astu" \
  -H "Content-Type: application/json" \
  -d '{"students":[]}'
```

```bash
curl -X GET "https://<your-app>.azurestaticapps.net/api/routes"
```

```bash
curl -X GET "https://<your-app>.azurestaticapps.net/api/health"
```
