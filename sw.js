const CACHE_NAME = 'finance-pwa-v6';
const SHARED_RECEIPTS_CACHE = 'finance-shared-receipts-v1';

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

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_PRECACHE).catch(err => {
                console.warn('Pre-cache parcial realizado:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME && key !== SHARED_RECEIPTS_CACHE) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;

    // Handle Android PWA Share Target POST
    if (request.method === 'POST') {
        const sharePath = new URL('share-target', self.registration.scope).pathname;
        if (new URL(request.url).pathname === sharePath) {
            event.respondWith(receiveSharedReceipt(request));
        }
        return;
    }

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Bypass Firebase API/Firestore/Auth calls and Cloud Storage
    if (url.origin.includes('googleapis.com') ||
        url.origin.includes('firebaseio.com') ||
        url.origin.includes('firestore.googleapis.com') ||
        url.origin.includes('identitytoolkit') ||
        url.origin.includes('firebasestorage.googleapis.com')) {
        return;
    }

    // HTML / Navigation: Network-First with Cache fallback for instant offline support
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request).then(response => {
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

    // Code assets (JS, CSS): Network-First to guarantee immediate updates and prevent stale cache
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.search.includes('v=')) {
        event.respondWith(
            fetch(request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return networkResponse;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // Static Assets (Fonts, Images): Stale-While-Revalidate for maximum speed
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
        console.error('Unable to receive shared receipt', error);
        return Response.redirect(new URL('?sharedReceiptError=unavailable', appUrl), 303);
    }
}

// Memory & Cache Cleanup Message Listener
self.addEventListener('message', async event => {
    if (event.data && event.data.action === 'CLEAR_CACHES') {
        try {
            const keys = await caches.keys();
            for (const key of keys) {
                if (key !== CACHE_NAME) {
                    await caches.delete(key);
                }
            }

            // Prune shared receipts older than 24h
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

            // Re-cache fresh app shell
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
