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

const CACHE_NAME = 'pide-v1'
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

// Recibir notificaciones push en segundo plano
messaging.onBackgroundMessage(payload => {
  console.log('Notificación en segundo plano:', payload)
  const { title, body } = payload.notification
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [500, 200, 500, 200, 500],
    requireInteraction: true // mantiene la notificación visible
  })
})