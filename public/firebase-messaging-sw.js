importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: "AIzaSyDkeYrLUoX-lGukvvIwzYIJzyVVZWRTioY",
  authDomain: "pedi-app.firebaseapp.com",
  projectId: "pedi-app",
  storageBucket: "pedi-app.firebasestorage.app",
  messagingSenderId: "988731532546",
  appId: "1:988731532546:web:188356fc2bba23c706ce1b"
})

const messaging = firebase.messaging()

const CACHE_NAME = 'pide-v2'
const ARCHIVOS_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ARCHIVOS_CACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  )
})

// Manejar tanto notification messages como data messages
messaging.onBackgroundMessage(payload => {
  console.log('Mensaje en segundo plano:', payload)

  // Soportar data message y notification message
  const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || '🚕 Nuevo pedido'
  const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || 'Tienes una nueva solicitud'

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [500, 200, 500, 200, 500, 200, 500],
    requireInteraction: true,
    tag: 'pedido',
    renotify: true
  })
})

// Manejar push directo (fallback si FCM no procesa)
self.addEventListener('push', event => {
  console.log('Push directo recibido:', event)
  if (event.data) {
    try {
      const payload = event.data.json()
      const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || '🚕 Nuevo pedido'
      const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || 'Tienes una nueva solicitud'

      event.waitUntil(
        self.registration.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          vibrate: [500, 200, 500, 200, 500, 200, 500],
          requireInteraction: true,
          tag: 'pedido',
          renotify: true
        })
      )
    } catch(e) {
      console.log('Error procesando push:', e)
    }
  }
})