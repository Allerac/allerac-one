"""
Test suite para descobrir e validar endpoints da Garmin Connect API.

Uso:
  1. Configure SESSION_DUMP abaixo com uma sessão válida
  2. Execute: python test_garmin_endpoints.py
  3. Verifique quais endpoints funcionam
  4. Documente os resultados em GARMIN_API_MAP.md

Notas:
  - Fazer requisições com delay entre testes (1-2 segundos)
  - Parar ao primeiro 429 (rate limit)
  - Endpoints que retornam 403 precisam de descoberta via Network tab
"""

import json
import logging
import time
from datetime import date, datetime, timedelta
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURAÇÃO
# ============================================================================

# Cole aqui uma session_dump válida (de um login bem-sucedido)
SESSION_DUMP = None  # TODO: substituir com session_dump real

# Endpoints candidatos a testar
ENDPOINTS_TO_TEST = {
    "activities_list_v1": {
        "url": "https://connect.garmin.com/gc-api/activity-service/activities",
        "method": "GET",
        "params": {"limit": 1, "sort": "startTimeInSeconds", "ascending": "false"},
        "expected_fields": ["id", "activityId", "activityName", "activityType"],
        "description": "Lista de atividades recentes",
    },
    "activities_list_v2": {
        "url": "https://connect.garmin.com/gc-api/activity-service/activities/search",
        "method": "POST",
        "data": {"limit": 1},
        "expected_fields": ["activities"],
        "description": "Lista de atividades (POST version)",
    },
    "activity_types": {
        "url": "https://connect.garmin.com/gc-api/activity-service/activityTypes",
        "method": "GET",
        "expected_fields": ["typeId", "typeKey", "displayValue"],
        "description": "Todos os tipos de atividade (CONFIRMADO ✅)",
    },
}


# ============================================================================
# TESTES
# ============================================================================


def _get_authenticated_session(session_dump: str):
    """Restaura sessão autenticada da session_dump."""
    from garminconnect import Garmin

    garmin = Garmin()
    garmin.garth.loads(session_dump)

    sess = garmin.garth.sess
    sess.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "origin": "https://connect.garmin.com",
        "referer": "https://connect.garmin.com/",
    })
    return sess


def test_endpoint(session_dump: str, endpoint_name: str, config: dict) -> dict:
    """
    Testa um endpoint e retorna resultado.

    Retorna:
        {
            "name": "activities_list_v1",
            "status": 200 | 403 | 500 | "error",
            "response_keys": ["id", "activityId", ...],
            "sample_response": "primeiros 200 chars da resposta",
            "duration_ms": 1234,
        }
    """
    result = {
        "name": endpoint_name,
        "status": None,
        "response_keys": None,
        "sample_response": None,
        "duration_ms": None,
        "error": None,
    }

    try:
        sess = _get_authenticated_session(session_dump)
        method = config.get("method", "GET").upper()
        url = config["url"]
        params = config.get("params")
        data = config.get("data")

        logger.info(f"Testando {endpoint_name}...")
        start = datetime.now()

        if method == "GET":
            resp = sess.get(url, params=params, timeout=10)
        elif method == "POST":
            resp = sess.post(url, json=data, timeout=10)
        else:
            raise ValueError(f"Method não suportado: {method}")

        duration = (datetime.now() - start).total_seconds() * 1000

        result["status"] = resp.status_code
        result["duration_ms"] = int(duration)

        # Tenta parsear resposta
        try:
            json_resp = resp.json()
            if isinstance(json_resp, dict):
                result["response_keys"] = list(json_resp.keys())[:10]
            elif isinstance(json_resp, list) and len(json_resp) > 0:
                if isinstance(json_resp[0], dict):
                    result["response_keys"] = list(json_resp[0].keys())[:10]

            result["sample_response"] = json.dumps(json_resp, default=str)[:200]
        except Exception as e:
            result["sample_response"] = resp.text[:200]

        # Status
        if resp.status_code == 200:
            logger.info(f"✅ {endpoint_name}: 200 OK (keys: {result['response_keys']})")
        else:
            logger.warning(f"❌ {endpoint_name}: {resp.status_code}")
            if resp.status_code == 429:
                logger.error("⚠️ Rate limit! Parando testes.")
                result["error"] = "Rate limited (429)"
                return result

    except Exception as e:
        logger.error(f"❌ {endpoint_name}: {e}")
        result["error"] = str(e)

    # Delay entre testes (rate limiting)
    time.sleep(1.5)

    return result


def run_all_tests(session_dump: str) -> None:
    """Executa todos os testes e mostra resultados."""
    if not session_dump:
        logger.error("❌ SESSION_DUMP não configurado!")
        logger.info("Cole uma session_dump válida na variável SESSION_DUMP")
        return

    logger.info("=" * 70)
    logger.info("GARMIN API ENDPOINT DISCOVERY")
    logger.info("=" * 70)

    results = []

    for endpoint_name, config in ENDPOINTS_TO_TEST.items():
        result = test_endpoint(session_dump, endpoint_name, config)
        results.append(result)

        if result.get("error") == "Rate limited (429)":
            break

    # Resumo
    logger.info("")
    logger.info("=" * 70)
    logger.info("RESUMO")
    logger.info("=" * 70)

    success = [r for r in results if r["status"] == 200]
    failed = [r for r in results if r["status"] != 200]

    logger.info(f"✅ Sucesso: {len(success)}/{len(results)}")
    for r in success:
        logger.info(f"   {r['name']}: {r['response_keys']}")

    if failed:
        logger.info(f"❌ Falhou: {len(failed)}/{len(results)}")
        for r in failed:
            logger.info(f"   {r['name']}: {r['status']} - {r.get('error', '')}")

    # Output JSON para análise
    logger.info("")
    logger.info("JSON Output (copie para análise):")
    logger.info(json.dumps(results, indent=2, default=str))


# ============================================================================
# NOVO TESTE (adicionado manualmente)
# ============================================================================

def test_custom_endpoint(
    session_dump: str,
    name: str,
    url: str,
    method: str = "GET",
    params: Optional[dict] = None,
    data: Optional[dict] = None,
) -> dict:
    """
    Testa um endpoint customizado.

    Uso:
        result = test_custom_endpoint(
            session_dump,
            "activities_list",
            "https://connect.garmin.com/gc-api/activity-service/activities",
            method="GET",
            params={"limit": 5}
        )
        print(json.dumps(result, indent=2, default=str))
    """
    result = {
        "name": name,
        "url": url,
        "method": method,
        "status": None,
        "response_keys": None,
        "sample_response": None,
        "error": None,
    }

    try:
        sess = _get_authenticated_session(session_dump)
        logger.info(f"Testando {name}: {method} {url}")

        if method.upper() == "GET":
            resp = sess.get(url, params=params, timeout=10)
        elif method.upper() == "POST":
            resp = sess.post(url, json=data, timeout=10)
        else:
            raise ValueError(f"Method: {method}")

        result["status"] = resp.status_code

        try:
            json_resp = resp.json()
            if isinstance(json_resp, dict):
                result["response_keys"] = list(json_resp.keys())[:15]
            elif isinstance(json_resp, list) and json_resp:
                result["response_keys"] = (
                    list(json_resp[0].keys())[:15] if isinstance(json_resp[0], dict) else None
                )

            result["sample_response"] = json.dumps(json_resp, default=str)[:500]
        except Exception as e:
            result["sample_response"] = resp.text[:500]

        logger.info(f"Status: {result['status']}, Keys: {result['response_keys']}")

    except Exception as e:
        logger.error(f"Erro: {e}")
        result["error"] = str(e)

    return result


if __name__ == "__main__":
    # Descomente para testar endpoints conhecidos:
    # run_all_tests(SESSION_DUMP)

    # Ou teste um endpoint customizado descoberto no Network tab:
    # result = test_custom_endpoint(
    #     SESSION_DUMP,
    #     "activities_list_discovered",
    #     "https://connect.garmin.com/gc-api/activity-service/activities",
    #     method="GET",
    #     params={"limit": 5}
    # )
    # print(json.dumps(result, indent=2, default=str))

    print("Configure SESSION_DUMP e descomente run_all_tests() ou test_custom_endpoint()")
