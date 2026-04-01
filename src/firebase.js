import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyDkeYrLUoX-lGukvvIwzYIJzyVVZWRTioY",
  authDomain: "pedi-app.firebaseapp.com",
  projectId: "pedi-app",
  storageBucket: "pedi-app.firebasestorage.app",
  messagingSenderId: "988731532546",
  appId: "1:988731532546:web:188356fc2bba23c706ce1b"
}

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

const VAPID_KEY = 'BCJKVm1VlLU88GFQl-e0PaxD6dQESU25-fnSv0sdSRbB4f5lxMbfybwZVan16IoOVfIvLFMgvKdkllpBQXyVUGg'

export const solicitarPermisoNotificaciones = async () => {
  try {
    const permiso = await Notification.requestPermission()
    if (permiso === 'granted') {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY })
      console.log('FCM Token:', token)
      return token
    }
    return null
  } catch (err) {
    console.log('Error al obtener token FCM:', err)
    return null
  }
}

export const onMensajeRecibido = (callback) => {
  onMessage(messaging, callback)
}

export { messaging }