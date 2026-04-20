/**
 * Garmin API Discovery Helper
 *
 * Cole este script no console do browser enquanto navegando em Garmin Connect
 * Ele vai capturar todas as requisições para /gc-api/ e log as informações
 *
 * Uso:
 * 1. Abra DevTools (F12) no Garmin Connect
 * 2. Aba Console
 * 3. Cole o código abaixo
 * 4. Navegue normalmente (Activities, Activity details, etc)
 * 5. O script vai logar automaticamente cada requisição
 * 6. No final, copie o JSON output
 */

// Captura todas as requisições
const capturedRequests = [];

// Intercepta fetch
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [resource, config] = args;
  const url = typeof resource === 'string' ? resource : resource.url;

  // Só captura requisições para /gc-api/
  if (url && url.includes('/gc-api/')) {
    const startTime = Date.now();

    return originalFetch.apply(this, args)
      .then(response => {
        const duration = Date.now() - startTime;
        const contentType = response.headers.get('content-type');

        // Clona a response pra poder ler o body sem consumir
        const clonedResponse = response.clone();

        clonedResponse.text().then(body => {
          let parsedBody;
          try {
            parsedBody = contentType?.includes('application/json')
              ? JSON.parse(body)
              : body;
          } catch (e) {
            parsedBody = body.slice(0, 200) + '...';
          }

          const captured = {
            method: config?.method || 'GET',
            url: url,
            status: response.status,
            duration: duration + 'ms',
            headers: {
              'content-type': response.headers.get('content-type'),
            },
            responsePreview: JSON.stringify(parsedBody).slice(0, 500),
            timestamp: new Date().toISOString(),
          };

          capturedRequests.push(captured);
          console.log(`[GARMIN API] ${response.status} ${config?.method || 'GET'} ${url.split('/').slice(-1)[0]}`);
        });

        return response;
      });
  }

  return originalFetch.apply(this, args);
};

// Intercepta XMLHttpRequest também
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  if (url && url.includes('/gc-api/')) {
    console.log(`[GARMIN API] XHR ${method} ${url.split('/').slice(-1)[0]}`);
  }
  return originalOpen.apply(this, [method, url, ...rest]);
};

console.log('🎉 Garmin API Discovery ativado!');
console.log('Navegue normalmente. Requisições /gc-api/ serão capturadas.');
console.log('');
console.log('Quando terminar, cole isto no console:');
console.log('  copy(JSON.stringify(capturedRequests, null, 2))');
console.log('');
console.log('Depois cole o resultado aqui pra análise.');
