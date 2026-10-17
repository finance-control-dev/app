self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'POST') return;

    const sharePath = new URL('share-target', self.registration.scope).pathname;
    if (new URL(request.url).pathname !== sharePath) return;

    event.respondWith(receiveSharedReceipt(request));
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
        const cache = await caches.open('finance-shared-receipts-v1');
        const cacheUrl = new URL(`__shared_receipts__/${shareId}`, appUrl);
        await cache.put(cacheUrl, new Response(file, {
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'X-Shared-File-Name': encodeURIComponent(file.name)
            }
        }));

        const launchUrl = new URL(`?sharedReceipt=${encodeURIComponent(shareId)}`, appUrl);
        return Response.redirect(launchUrl, 303);
    } catch (error) {
        console.error('Unable to receive shared receipt', error);
        return Response.redirect(new URL('?sharedReceiptError=unavailable', appUrl), 303);
    }
}

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
