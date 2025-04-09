if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope:', registration.scope);

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('New service worker is being installed:', newWorker);

                    newWorker.addEventListener('statechange', () => {
                        console.log('Service worker state changed to:', newWorker.state);

                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            if (confirm('New version available! Click OK to update.')) {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                window.location.reload();
                            }
                        }
                    });
                });
            })
            .catch(error => {
                console.log('ServiceWorker registration failed:', error);
            });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    });
}

window.addEventListener('online', () => {
    console.log('You are now online');
    document.dispatchEvent(new CustomEvent('app-online'));
});

window.addEventListener('offline', () => {
    console.log('You are now offline');
    document.dispatchEvent(new CustomEvent('app-offline'));
});

function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

window.matchMedia('(display-mode: standalone)').addEventListener('change', (event) => {
    console.log('Display mode changed:', event.matches ? 'standalone' : 'browser');
});
