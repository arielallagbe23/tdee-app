// app/lib/firebaseClient.ts  (ou lib/firebaseClient.ts)

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// --- Config depuis .env.local (côté client => NEXT_PUBLIC_*) ---
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FB_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FB_APP_ID!,
};

// Initialisation sûre (une seule fois)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Auth anonyme si nécessaire, retourne l'utilisateur
export async function ensureAnonAuth(): Promise<User> {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  // `currentUser` est défini juste après la connexion anonyme
  const user = auth.currentUser;
  if (!user) throw new Error("Impossible d'initialiser l'authentification anonyme.");
  return user;
}
