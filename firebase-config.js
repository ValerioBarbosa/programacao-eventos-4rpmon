import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBY2xZjgl03shfbry69J1Lwnex7b2m_ha8",
  authDomain: "agenda-4rpmon.firebaseapp.com",
  projectId: "agenda-4rpmon",
  storageBucket: "agenda-4rpmon.firebasestorage.app",
  messagingSenderId: "872579809219",
  appId: "1:872579809219:web:5f5e1ede8956dec8ab4776"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  db,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
};
