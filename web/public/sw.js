self.addEventListener('push', (event) => {
  const { title, body, data } = event.data.json();
  event.waitUntil(self.registration.showNotification(title ?? 'CP Club Tracker', { body, data, icon: '/icon-192.png' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url || '/'));
});
