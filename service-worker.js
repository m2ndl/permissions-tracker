const CACHE_NAME = 'work-permissions-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css', // Ensure this is cached
    '/script.js', // Ensure this is cached
    '/manifest.json', // Ensure this is cached
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMwMw.woff2' // Example font file
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache. Attempting to add URLs to cache...');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('All URLs successfully cached.');
            })
            .catch(error => {
                // Improved error logging to help identify the problematic URL
                console.error('Failed to cache one or more URLs:', error);
                // You might need to inspect the network tab during installation
                // to see which specific request caused the failure if the error
                // message itself isn't explicit about the URL.
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).catch(() => {
                    // Fallback for offline pages if needed
                    console.log('Fetch failed, no cached response.');
                });
            })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
