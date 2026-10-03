import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export interface AppAccount {
  username: string;
  isLoggedIn: boolean;
}

const STORAGE_KEY = 'personal_cloud_app_username';

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getCurrentAppUser(): AppAccount | null {
  const username = localStorage.getItem(STORAGE_KEY);
  if (!username) return null;
  return { username, isLoggedIn: true };
}

export async function loginOrRegisterAppUser(username: string, password: string): Promise<{ success: boolean; message: string; username?: string }> {
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    return { success: false, message: 'اسم المستخدم يجب ألا يقل عن 3 أحرف' };
  }
  if (password.length < 4) {
    return { success: false, message: 'كلمة المرور يجب ألا تقل عن 4 خانات' };
  }

  try {
    const passwordHash = await sha256(password);
    const accountRef = doc(db, 'app_accounts', cleanUsername);
    const accountSnap = await getDoc(accountRef);

    if (accountSnap.exists()) {
      const data = accountSnap.data();
      if (data.passwordHash !== passwordHash) {
        return { success: false, message: 'كلمة المرور غير صحيحة لهذا الحساب' };
      }
    } else {
      // إنشاء حساب جديد في قاعدة بيانات Firestore الخلفية
      await setDoc(accountRef, {
        username: cleanUsername,
        passwordHash,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      }, { merge: true });
    }

    localStorage.setItem(STORAGE_KEY, cleanUsername);

    // التحقق من صلاحية قراءة وكتابة مساحة المستخدم في Firestore
    const syncStateRef = doc(db, 'users', cleanUsername, 'metadata', 'sync_state');
    await setDoc(syncStateRef, {
      lastWebAccess: serverTimestamp(),
      status: 'ACTIVE_BACKGROUND_SYNC'
    }, { merge: true });

    return { success: true, message: 'تم تسجيل الدخول وتفعيل قاعدة البيانات الخلفية بنجاح!', username: cleanUsername };
  } catch (error: any) {
    return { success: false, message: error?.message || 'حدث خطأ في الاتصال بقاعدة بيانات Firestore' };
  }
}

export function logoutAppUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function testFirestoreConnection(username: string): Promise<{ success: boolean; message: string }> {
  try {
    const testDocRef = doc(db, 'users', username, 'metadata', 'sync_state');
    await setDoc(testDocRef, {
      lastPing: serverTimestamp(),
      backendEngine: 'FIRESTORE_BACKGROUND_ONLY'
    }, { merge: true });

    return { success: true, message: 'Firestore يعمل في الخلفية بنجاح' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'خطأ في اتصال Firestore' };
  }
}
