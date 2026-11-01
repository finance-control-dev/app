/**
 * ============================================================================
 * SERVICE WORKER - CONTROLE FINANCEIRO PWA
 * ============================================================================
 * Versão do Cache Ativo: finance-pwa-v17
 * 
 * ARQUITETURA DE ARMAZENAMENTO E RESILIÊNCIA OFFLINE:
 * 1. TIER 1 - Navegação e Código Fonte (HTML, JS, CSS):
 *    - Estratégia: Network-First com bypass de cache ('no-store')
 *    - Objetivo: Garantir que atualizações de código e novos componentes visuais
 *      sejam carregados imediatamente no celular do usuário sem retenção em cache zumbi.
 *    - Fallback: Em caso de ausência de rede (offline total), serve a versão em cache.
 * 
 * 2. TIER 2 - Ativos Estáticos (Fontes, Ícones, Imagens PNG/SVG):
 *    - Estratégia: Stale-While-Revalidate
 *    - Objetivo: Velocidade instantânea de abertura (0ms) enquanto revalida em segundo plano.
 * 
 * 3. TIER 3 - Tráfego de API e Banco de Dados em Nuvem (Firebase / Firestore / Auth):
 *    - Estratégia: Bypass Total do Cache
 *    - Objetivo: Nunca interceptar dados dinâmicos do Firestore ou tokens de autenticação,
 *      preservando a sincronização em tempo real nativa do Firebase SDK.
 * 
 * 4. RECURSO NATIVO ANDROID: Web Share Target API:
 *    - Intercepta requisições POST para '/share-target' disparadas pelo menu 'Compartilhar' do Android.
 *    - Grava o arquivo de comprovante (imagem/PDF) em cache isolado e abre o app com o ID compartilhado.
 * ============================================================================
 */

const CACHE_NAME = 'finance-pwa-v17';
const SHARED_RECEIPTS_CACHE = 'finance-shared-receipts-v1';

/** Lista de ativos essenciais para o funcionamento mínimo do App Shell offline */
const STATIC_PRECACHE = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './manifest.json',
    './favicon.png',
    './icon-192.png',
    './icon-512.png',
    './icon.png',
    './pix-qr.png',
    './assets/icons/favicon.png',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/icon.png'
];

/**
 * CICLO DE VIDA: INSTALAÇÃO
 * Grava o precache do shell da aplicação e ativa imediatamente via skipWaiting().
 */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_PRECACHE).catch(err => {
                console.warn('Pre-cache parcial realizado:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

/**
 * CICLO DE VIDA: ATIVAÇÃO
 * Remove caches legados de versões antigas e assume o controle de todas as abas abertas.
 */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    // Preserva apenas a versão atual e o cache de comprovantes compartilhados
                    if (key !== CACHE_NAME && key !== SHARED_RECEIPTS_CACHE) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

/**
 * CICLO DE VIDA: INTERCEPTAÇÃO DE REQUISIÇÕES (FETCH)
 */
self.addEventListener('fetch', event => {
    const request = event.request;

    // 1. Suporte a Compartilhamento Direto de Comprovantes via Android (Share Target POST)
    if (request.method === 'POST') {
        const sharePath = new URL('share-target', self.registration.scope).pathname;
        if (new URL(request.url).pathname === sharePath) {
            event.respondWith(receiveSharedReceipt(request));
        }
        return;
    }

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 2. Bypass de chamadas do Firebase Auth, Firestore, APIs do Google e Cloud Storage
    if (url.origin.includes('googleapis.com') ||
        url.origin.includes('firebaseio.com') ||
        url.origin.includes('firestore.googleapis.com') ||
        url.origin.includes('identitytoolkit') ||
        url.origin.includes('firebasestorage.googleapis.com')) {
        return;
    }

    // 3. Documento HTML / Navegação: Network-First com no-store para evitar cache preso no mobile
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request, { cache: 'no-store' }).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => {
                return caches.match(request).then(cached => cached || caches.match('./index.html'));
            })
        );
        return;
    }

    // 4. Scripts e Estilos (JS, CSS): Network-First para atualização imediata de patches de código
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.search.includes('v=')) {
        event.respondWith(
            fetch(request, { cache: 'no-store' }).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return networkResponse;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // 5. Ativos Estáticos (Fontes, Imagens, Ícones): Stale-While-Revalidate para abertura instantânea
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return networkResponse;
            }).catch(() => null);

            return cachedResponse || fetchPromise;
        })
    );
});

/**
 * Processa arquivos de comprovantes recebidos do Android através da Web Share Target API.
 * Armazena temporariamente o Blob no cache SHARED_RECEIPTS_CACHE e redireciona para o app com ?sharedReceipt=UUID.
 * @param {Request} request Requisição POST com multipart/form-data
 * @returns {Promise<Response>} Redirecionamento HTTP 303 para a interface do app
 */
async function receiveSharedReceipt(request) {
    const appUrl = new URL(self.registration.scope);
    try {
        const form = await request.formData();
        const file = form.getAll('files').find(item => item && typeof item.arrayBuffer === 'function' && item.name);
        if (!file || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) {
            return Response.redirect(new URL('?sharedReceiptError=unsupported', appUrl), 303);
        }
        if (file.size > 12 * 1024 * 1024) {
            return Response.redirect(new URL('?sharedReceiptError=too-large', appUrl), 303);
        }

        const shareId = crypto.randomUUID();
        const cache = await caches.open(SHARED_RECEIPTS_CACHE);
        const cacheUrl = new URL(`__shared_receipts__/${shareId}`, appUrl);
        await cache.put(cacheUrl, new Response(file, {
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'X-Shared-File-Name': encodeURIComponent(file.name),
                'X-Shared-Timestamp': String(Date.now())
            }
        }));

        const launchUrl = new URL(`?sharedReceipt=${encodeURIComponent(shareId)}`, appUrl);
        return Response.redirect(launchUrl, 303);
    } catch (error) {
        console.error('Falha ao processar comprovante compartilhado:', error);
        return Response.redirect(new URL('?sharedReceiptError=unavailable', appUrl), 303);
    }
}

/**
 * GERENCIADOR DE MENSAGENS INTER-PROCESSO (postMessage)
 * Permite que a interface do usuário solicite a limpeza de caches obsoletos e arquivos temporários > 24h.
 */
self.addEventListener('message', async event => {
    if (event.data && event.data.action === 'CLEAR_CACHES') {
        try {
            const keys = await caches.keys();
            for (const key of keys) {
                if (key !== CACHE_NAME) {
                    await caches.delete(key);
                }
            }

            // Expurga comprovantes compartilhados temporários com mais de 24 horas de existência
            const sharedCache = await caches.open(SHARED_RECEIPTS_CACHE);
            const sharedKeys = await sharedCache.keys();
            const now = Date.now();
            for (const req of sharedKeys) {
                const res = await sharedCache.match(req);
                const timestamp = Number(res?.headers.get('X-Shared-Timestamp')) || 0;
                if (!timestamp || (now - timestamp) > 24 * 60 * 60 * 1000) {
                    await sharedCache.delete(req);
                }
            }

            // Recarrega o shell da versão atual no cache
            const currentCache = await caches.open(CACHE_NAME);
            await currentCache.addAll(STATIC_PRECACHE).catch(() => {});

            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({ success: true, timestamp: Date.now() });
            }
        } catch (err) {
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({ success: false, error: String(err) });
            }
        }
    }
});

/**
 * CLIQUE EM NOTIFICAÇÕES PUSH
 * Ao tocar na notificação de vencimento de conta, foca na janela ativa ou abre uma nova.
 */
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});
