// app/lib/firebaseClient.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type User } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export const FIREBASE_AVAILABLE =
  !!process.env.NEXT_PUBLIC_FB_API_KEY &&
  !!process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN &&
  !!process.env.NEXT_PUBLIC_FB_PROJECT_ID &&
  !!process.env.NEXT_PUBLIC_FB_APP_ID;

let app: FirebaseApp | null = null;

if (FIREBASE_AVAILABLE) {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FB_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID || undefined,
    appId: process.env.NEXT_PUBLIC_FB_APP_ID!,
  };
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const db: Firestore | null = FIREBASE_AVAILABLE && app ? getFirestore(app) : null;

export async function ensureAnonAuth(): Promise<User> {
  if (!FIREBASE_AVAILABLE || !app) {
    throw new Error("Firebase n’est pas configuré (variables NEXT_PUBLIC_* manquantes).");
  }
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  const user = auth.currentUser;
  if (!user) throw new Error("Impossible d'initialiser l’auth anonyme.");
  return user;
}
