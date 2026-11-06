"""Read-only TLS regression checks for stdlib, requests/certifi and pip certifi."""
import concurrent.futures
import importlib
import json
import socket
import ssl

CONTROL = 'emudhra.we-have-a-problem.com'
PREFIXES = ('dv-g3b', 'dv-g3b-aaa', 'dv-g3b-noct', 'dv-g3b-aaa-noct',
            'dv-g3c', 'dv-g3c-aaa', 'ev-g3b', 'ev-g3b-aaa', 'ev-g3c',
            'ev-g3c-aaa', 'ov-g3b', 'ov-g3b-aaa', 'ov-g3c', 'ov-g3c-aaa')
HOSTS = [CONTROL] + [f'{prefix}-emudhra.we-have-a-problem.com' for prefix in PREFIXES]

def check(item):
    store, bundle, host = item
    result = dict(store=store, host=host, passed=False)
    try:
        ctx = ssl.create_default_context(cafile=bundle)
        with socket.create_connection((host, 443), timeout=15) as raw:
            with ctx.wrap_socket(raw, server_hostname=host):
                result.update(accepted=True, passed=host == CONTROL)
    except ssl.SSLCertVerificationError as error:
        # Only trust/revocation errors count. Expiry or hostname errors could
        # conceal an otherwise trusted compromised chain.
        result.update(accepted=False, code=error.verify_code, error=str(error),
                      passed=host != CONTROL and error.verify_code in (2, 18, 19, 20, 21, 23, 27))
    except Exception as error:
        result.update(error=str(error), inconclusive=True)
    return result

stores = [('stdlib', None)]
for name in ('certifi', 'pip._vendor.certifi'):
    module = importlib.import_module(name)
    stores.append((name, module.where()))
with concurrent.futures.ThreadPoolExecutor(max_workers=15) as pool:
    results = list(pool.map(check, [(store, bundle, host) for store, bundle in stores for host in HOSTS]))
for result in results:
    print(json.dumps(result), flush=True)
raise SystemExit(0 if all(result['passed'] for result in results) else 1)
