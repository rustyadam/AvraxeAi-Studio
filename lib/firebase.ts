import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider,
  onAuthStateChanged as realOnAuthStateChanged,
  signInWithPopup as realSignInWithPopup,
  signOut as realSignOut
} from 'firebase/auth';
import { 
  getFirestore,
  collection as realCollection,
  doc as realDoc,
  getDoc as realGetDoc,
  getDocs as realGetDocs,
  setDoc as realSetDoc,
  deleteDoc as realDeleteDoc,
  query as realQuery,
  where as realWhere,
  serverTimestamp as realServerTimestamp
} from 'firebase/firestore';

// Default mock config to prevent crashing if config is absent initially
const defaultFirebaseConfig = {
  apiKey: "MOCK_KEY",
  authDomain: "mock-project.firebaseapp.com",
  projectId: "mock-project",
  storageBucket: "mock-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
  firestoreDatabaseId: "(default)"
};

let firebaseConfig = defaultFirebaseConfig;

try {
  if (typeof window === "undefined") {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.resolve(process.cwd(), '../firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8').trim();
      if (content && content.length > 0) {
        firebaseConfig = JSON.parse(content);
      }
    }
  }
} catch (error) {
  // Silent catch
}

function isValidApiKey(key: string | undefined): boolean {
  if (!key) return false;
  if (key === "MOCK_KEY" || key === "YOUR_API_KEY" || key === "undefined") return false;
  if (key.includes("<") || key.includes(">") || key.includes("[")) return false;
  return true;
}

const isMock = !firebaseConfig || !isValidApiKey(firebaseConfig.apiKey);

// High-fidelity stub definitions for Mock Offline Mode
const mockUser = {
  uid: "mock-nashville-user-123",
  displayName: "Nashville Producer",
  email: "nashville@studio.ai",
  photoURL: "https://picsum.photos/seed/nashville/100/100",
};

class MockAuth {
  currentUser: any = null;
  private listeners: Array<(user: any) => void> = [];

  onAuthStateChanged(callback: (user: any) => void) {
    this.listeners.push(callback);
    // Trigger callback with current user state
    setTimeout(() => callback(this.currentUser), 0);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  async signInWithPopup() {
    this.currentUser = mockUser;
    this.listeners.forEach(l => l(this.currentUser));
    return { user: this.currentUser };
  }

  async signOut() {
    this.currentUser = null;
    this.listeners.forEach(l => l(null));
  }
}

// Global Exports
export let auth: any;
export let db: any;
export let googleProvider: any;

if (isMock) {
  auth = new MockAuth();
  db = { isMock: true };
  googleProvider = { isMockProvider: true };
} else {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
}

// Firestore operations adaptive routers
const LOCAL_STORAGE_KEY = "nashville_cloud_sessions_db";

const getLocalSessions = (): Record<string, any> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
};

const saveLocalSessions = (sessions: Record<string, any>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {}
};

export function collection(dbRef: any, path: string) {
  if (!isMock) return realCollection(dbRef, path);
  return { docType: "collection", path };
}

export function doc(dbRef: any, path: string, childPath?: string) {
  if (!isMock) {
    return childPath ? realDoc(dbRef, path, childPath) : realDoc(dbRef, path);
  }
  const id = childPath || path.split("/").pop() || "default";
  return { docType: "document", path: childPath ? `${path}/${childPath}` : path, id };
}

export function query(collectionRef: any, ...constraints: any[]) {
  if (!isMock) return realQuery(collectionRef, ...constraints);
  return { docType: "query", collection: collectionRef.path, constraints };
}

export function where(field: string, operator: string, value: any) {
  if (!isMock) return realWhere(field, operator, value);
  return { type: "where", field, operator, value };
}

export async function getDocs(q: any) {
  if (!isMock) return realGetDocs(q);
  
  const store = getLocalSessions();
  const docs = Object.values(store).filter((doc: any) => {
    return q.constraints?.every((c: any) => {
      if (c.type === "where" && c.field === "ownerId") {
        return doc.ownerId === c.value;
      }
      return true;
    }) ?? true;
  });

  return {
    forEach: (callback: (doc: any) => void) => {
      docs.forEach(docData => {
        callback({
          id: docData.id,
          data: () => docData
        });
      });
    }
  };
}

export async function getDoc(docRef: any) {
  if (!isMock) return realGetDoc(docRef);

  const store = getLocalSessions();
  const docId = docRef.id;
  const exists = !!store[docId];
  return {
    exists: () => exists,
    data: () => store[docId]
  };
}

export async function setDoc(docRef: any, data: any) {
  if (!isMock) return realSetDoc(docRef, data);

  const store = getLocalSessions();
  const docId = docRef.id;
  const existing = store[docId];
  const now = new Date().toISOString();
  
  const finalData = {
    ...data,
    id: docId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  
  store[docId] = finalData;
  saveLocalSessions(store);
}

export async function deleteDoc(docRef: any) {
  if (!isMock) return realDeleteDoc(docRef);

  const store = getLocalSessions();
  const docId = docRef.id;
  delete store[docId];
  saveLocalSessions(store);
}

export function serverTimestamp() {
  if (!isMock) return realServerTimestamp();
  return new Date().toISOString();
}

// Adaptive authentication routers
export function onAuthStateChanged(authInstance: any, callback: (user: any) => void) {
  if (!isMock) return realOnAuthStateChanged(authInstance, callback);
  return authInstance.onAuthStateChanged(callback);
}

export async function signInWithPopup(authInstance: any, provider: any) {
  if (!isMock) return realSignInWithPopup(authInstance, provider);
  return authInstance.signInWithPopup();
}

export async function signOut(authInstance: any) {
  if (!isMock) return realSignOut(authInstance);
  return authInstance.signOut();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  console.error("Firestore Error:", error, operationType, path);
  throw error;
}
