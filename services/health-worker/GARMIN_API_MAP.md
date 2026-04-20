# Garmin Connect API Mapping

Mapeamento da integração Garmin Connect via biblioteca `garminconnect` (Python).

**Status:** ✅ Ativo  
**Última atualização:** 2026-04-19  
**Abordagem:** Usar `garminconnect` library (130+ métodos) em vez de requisições HTTP diretas

---

## Endpoints Confirmados ✅

### Daily Metrics (Métricas Diárias)
Estes endpoints já funcionam e estão integrados em `fetch_metrics()`.

```
GET https://connect.garmin.com/gc-api/wellness-service/wellness/dailySummaryChart/{date}
```
- **Autenticação:** Session cookie via `garmin.garth.sess`
- **Retorna:** Steps, distance, calories, active minutes, etc
- **Status:** ✅ Funcionando
- **Arquivo:** `garmin.py:fetch_metrics()`

### Sleep Data
```
GET https://connect.garmin.com/gc-api/sleep-service/sleep/{date}
```
- **Autenticação:** Session cookie
- **Retorna:** Sleep duration, deep/light/REM/awake minutes, sleep score
- **Status:** ✅ Funcionando

### Heart Rate Data
```
GET https://connect.garmin.com/gc-api/wellness-service/wellness/heartRateVariabilityData/{date}
```
- **Autenticação:** Session cookie
- **Retorna:** Resting HR, average HR, max HR
- **Status:** ✅ Funcionando

### Body Battery
```
GET https://connect.garmin.com/gc-api/wellness-service/wellness/bodyBattery/{startDate}/{endDate}
```
- **Autenticação:** Session cookie
- **Retorna:** Battery min/max/end, charged, drained
- **Status:** ✅ Funcionando

### Stress Data
```
GET https://connect.garmin.com/gc-api/wellness-service/wellness/dailyStress/{date}
```
- **Autenticação:** Session cookie
- **Retorna:** Average stress level, max stress level, rest duration
- **Status:** ✅ Funcionando

### Activity Types (Reference)
```
GET https://connect.garmin.com/gc-api/activity-service/activityTypes
```
- **Autenticação:** Session cookie
- **Retorna:** Lista de todos os tipos de atividade (260+) com IDs e nomes
- **Status:** ✅ Funcionando
- **Uso:** Mapear activity type IDs para nomes legíveis

---

### Activity Details ✅
```
GET https://connect.garmin.com/gc-api/activity-service/activity/{activityId}
```
- **Autenticação:** Session cookie
- **Retorna:** Todos os detalhes da atividade via `summaryDTO`
- **Status:** ✅ Confirmado (2026-04-18)
- **Campos principais:**
  - `summaryDTO.duration` (segundos)
  - `summaryDTO.calories` (kcal)
  - `summaryDTO.averageHR` (bpm)
  - `summaryDTO.maxHR` (bpm)
  - `summaryDTO.distance` (metros)
  - `summaryDTO.activeSets` (número de séries)
  - `summaryDTO.totalExerciseReps` (total de reps)
  - `summaryDTO.startTimeLocal` (ISO string)

**Exemplo de response:**
```json
{
  "activityId": 22570976114,
  "activityName": "Strength",
  "activityTypeDTO": { "typeKey": "strength_training", ... },
  "summaryDTO": {
    "duration": 3889.606,
    "calories": 403.0,
    "averageHR": 122.0,
    "maxHR": 163.0,
    "activeSets": 28,
    "totalExerciseReps": 247,
    ...
  }
}
```

---

### Exercise Sets (Strength Training) ✅
```
GET https://connect.garmin.com/gc-api/activity-service/activity/{activityId}/exerciseSets
```
- **Autenticação:** Session cookie
- **Retorna:** Array de séries com detalhes de exercícios
- **Status:** ✅ Confirmado (2026-04-18)
- **Campos por série:**
  - `setType`: "ACTIVE" ou "REST"
  - `duration`: segundos
  - `repetitionCount`: número de reps
  - `exercises`: array com exercícios detectados
  - `startTime`: ISO string

**Exemplo:**
```json
{
  "activityId": 22570976114,
  "exerciseSets": [
    {
      "setType": "ACTIVE",
      "duration": 110.149,
      "repetitionCount": 10,
      "weight": 0.0,
      "exercises": [
        {
          "name": "JUMPING_JACKS",
          "category": "CARDIO",
          "probability": 69.921875
        }
      ],
      "startTime": "2026-04-18T12:26:49.0"
    },
    {
      "setType": "REST",
      "duration": 68.952,
      "repetitionCount": null,
      ...
    }
  ]
}
```

---

### Activities List ✅
```python
garmin.get_activities(start, limit)
```
- **Biblioteca:** `garminconnect` (Python)
- **HTTP endpoint interno:** `GET /gc-api/activitylist-service/activities/search/activities`
- **Autenticação:** Automática via Bearer token DI (gerenciado pela biblioteca)
- **Parâmetros:** `start` (índice, 0, 1, 2...), `limit` (quantidade, ex: 10)
- **Retorna:** Array com lista de atividades
- **Status:** ✅ Confirmado (2026-04-19) - **Funcionando via garminconnect**
- **Campos retornados:**
  - `activityId` 
  - `activityName`
  - `activityType` (dict com `typeKey`, `typeId`)
  - `startTimeLocal` (ISO string)
  - `duration` (segundos em float)
  - `calories`
  - `distance` (metros)
  - `activeSets` (strength training)
  - `summarizedExerciseSets` - resumo dos exercícios com categoria, reps, duration, sets, maxWeight

**Exemplo de uso (Python):**
```python
from garminconnect import Garmin

garmin = Garmin()
garmin.garth.loads(session_dump)

activities = garmin.get_activities(start=0, limit=10)
```

**Exemplo de resposta:**
```json
[
  {
    "activityId": 22570976114,
    "activityName": "Strength",
    "activityType": { "typeKey": "strength_training", "typeId": 73 },
    "startTimeLocal": "2026-04-18 14:26:49",
    "duration": 3889.6,
    "calories": 403.0,
    "distance": 0.0,
    "activeSets": 28,
    "summarizedExerciseSets": [
      {
        "category": "PUSH_UP",
        "reps": 63,
        "duration": 334378.0,
        "sets": 7,
        "maxWeight": 0
      },
      {
        "category": "PULL_UP",
        "reps": 40,
        "duration": 93522.0,
        "sets": 4,
        "maxWeight": 0
      }
    ]
  }
]
```

---

## Implementação Atual

**Abordagem:** Usar `garminconnect` library (Python) ao invés de requisições HTTP diretas.

**Razão:** 
- Os endpoints REST diretos (ex: `/gc-api/activitylist-service/...`) retornam 403 Forbidden
- A biblioteca `garminconnect` encapsula a autenticação correta (Bearer token DI) e os endpoints reais
- Mais robusto e mantido pela comunidade

**Biblioteca:** 
- https://github.com/cyberjunky/python-garminconnect
- 130+ métodos para todas as features do Garmin Connect

---

## Discovery Workflow

1. **Captura (Browser):** Você identifica endpoint no Network tab
2. **Documentação:** Preenche template acima com URL, method, response structure
3. **Teste (Python):** Eu crio teste em `test_garmin_endpoints.py`
4. **Integração:** Adiciona ao `fetch_recent_activities()` se funcionar
5. **Logging:** Registra em `GARMIN_API_MAP.md` como confirmado

---

## Prioridade

1. ⭐⭐⭐ **Activities list** → Sem isso não conseguimos listar atividades
2. ⭐⭐⭐ **Activity details** → Nome, tipo, duração, calorias, HR
3. ⭐⭐ **Exercise sets** → Importante pra strength training (seu caso)
4. ⭐ **Split summaries** → Detalhes adicionais pra atividades de corrida/ciclismo

---

## Segurança & Rate Limiting

- ✅ Usar sessão autenticada (conta própria)
- ✅ Fazer requisições com intervalo de 1-2 segundos
- ⚠️ Se receber 429 (Too Many Requests), parar por 1 hora
- ⚠️ Se conta ficar bloqueada, é risco conhecido (improvável com uso razoável)

---

## Notas

- Endpoints mudam com atualizações da Garmin (documentar versão se possível)
- Alguns endpoints podem estar beta ou deprecated
- Resposta pode variar baseada no tipo de atividade
- Headers importantes: `User-Agent`, `origin`, `referer`
