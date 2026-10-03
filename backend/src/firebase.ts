import admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * إعدادات مشروع Firebase
 */
function getFirebaseAppletConfig(): any {
  try {
    const configPath = path.resolve(process.cwd(), '../firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    const rootConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(rootConfigPath)) {
      return JSON.parse(fs.readFileSync(rootConfigPath, 'utf8'));
    }
  } catch (e) {}
  return null;
}

const appletConfig = getFirebaseAppletConfig();

export const projectId = process.env.FIREBASE_PROJECT_ID || appletConfig?.projectId || 'spry-iterator-486704-d0';
export const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || appletConfig?.storageBucket || `${projectId}.firebasestorage.app`;
export const databaseId = process.env.FIREBASE_DATABASE_ID || appletConfig?.firestoreDatabaseId || 'ai-studio-androidpersonalc-7fbcb919-2591-476b-836e-da6ad9eb5e0b';

export interface CredentialResolution {
  credential: admin.credential.Credential;
  isServiceAccount: boolean;
  source: 'serviceAccountKey.json' | 'GOOGLE_APPLICATION_CREDENTIALS' | 'FIREBASE_SERVICE_ACCOUNT_JSON' | 'ApplicationDefaultCredentials';
  filePath?: string;
}

/**
 * فحص وتحديد مصدر بيانات اعتماد الخدمة (Service Account)
 */
export function resolveCredential(): CredentialResolution {
  // 1. فحص مجلد credentials/serviceAccountKey.json المباشر
  const directKeyPath = path.resolve(process.cwd(), 'credentials/serviceAccountKey.json');
  if (fs.existsSync(directKeyPath)) {
    try {
      const raw = fs.readFileSync(directKeyPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.type === 'service_account' && parsed.private_key) {
        return {
          credential: admin.credential.cert(parsed),
          isServiceAccount: true,
          source: 'serviceAccountKey.json',
          filePath: directKeyPath
        };
      }
    } catch (err: any) {
      console.warn(`[Firebase Admin] تعذر تحليل ملف ${directKeyPath}:`, err.message);
    }
  }

  // 2. فحص متغير البيئة GOOGLE_APPLICATION_CREDENTIALS
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const resolvedPath = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
    if (fs.existsSync(resolvedPath)) {
      try {
        const raw = fs.readFileSync(resolvedPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.type === 'service_account' && parsed.private_key) {
          return {
            credential: admin.credential.cert(parsed),
            isServiceAccount: true,
            source: 'GOOGLE_APPLICATION_CREDENTIALS',
            filePath: resolvedPath
          };
        }
      } catch (err: any) {
        console.warn(`[Firebase Admin] تعذر تحليل ملف ${resolvedPath}:`, err.message);
      }
    }
  }

  // 3. فحص متغير بيئة يحتوي على JSON المفتاح مباشرة (مفيد في Cloud Run و Render و Docker)
  const envRawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envRawJson) {
    try {
      const parsed = JSON.parse(envRawJson);
      if (parsed.type === 'service_account' && parsed.private_key) {
        return {
          credential: admin.credential.cert(parsed),
          isServiceAccount: true,
          source: 'FIREBASE_SERVICE_ACCOUNT_JSON'
        };
      }
    } catch (err: any) {
      console.warn('[Firebase Admin] تعذر تحليل FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
    }
  }

  // 4. الاعتماد الافتراضي للبيئة (Application Default Credentials - ADC)
  return {
    credential: admin.credential.applicationDefault(),
    isServiceAccount: false,
    source: 'ApplicationDefaultCredentials'
  };
}

export const credentialInfo = resolveCredential();

let app: admin.app.App;

if (admin.apps.length === 0) {
  try {
    app = admin.initializeApp({
      credential: credentialInfo.credential,
      projectId,
      storageBucket
    });
    console.log(`[Firebase Admin] تم تهيئة Firebase Admin SDK بنجاح.`);
    console.log(`[Firebase Admin] مصدر بيانات الاعتماد: ${credentialInfo.source} (Service Account: ${credentialInfo.isServiceAccount})`);
  } catch (error: any) {
    console.error('[Firebase Admin] خطأ أثناء التهيئة الأولية:', error.message);
    app = admin.app();
  }
} else {
  app = admin.app();
}

/**
 * كائنات الاتصال الحقيقية بـ Cloud Firestore و Firebase Storage
 */
export const db: Firestore = databaseId ? getFirestore(app, databaseId) : admin.firestore();
export const storage = admin.storage().bucket(storageBucket);
export const adminFirestore = db;
export const bucket = storage;
export const isServiceAccountLoaded = credentialInfo.isServiceAccount;

/**
 * اختبار الاتصال الحقيقي الفعلي بـ Cloud Firestore و Firebase Storage
 * يقوم بعملية كتابة وقراءة وحذف لمستند تجريبي، وفحص حاوية التخزين
 */
export async function runRealHealthCheck(): Promise<{
  backend: 'online';
  firestore: 'connected' | string;
  storage: 'connected' | string;
  projectId: string;
  bucket: string;
  serviceAccount: boolean;
  credentialSource: string;
  details?: string;
}> {
  let firestoreResult = 'unknown';
  let storageResult = 'unknown';
  let failureDetails: string | undefined;

  // 1. اختبار Firestore الحقيقي (إنشاء مستند تجريبي وقراءته ثم حذفه)
  try {
    const healthDocRef = db.collection('_health_checks').doc('connectivity_test');
    const testData = {
      timestamp: Date.now(),
      initiatedBy: 'HealthCheckEndpoint',
      testStatus: 'OK'
    };
    await healthDocRef.set(testData);
    const snap = await healthDocRef.get();

    if (snap.exists && snap.data()?.testStatus === 'OK') {
      firestoreResult = 'connected';
      // تنظيف المستند التجريبي
      await healthDocRef.delete();
    } else {
      firestoreResult = 'error: لم يتم استرجاع المستند بعد كتابته';
    }
  } catch (fsErr: any) {
    firestoreResult = `error: ${fsErr.message || fsErr.code || String(fsErr)}`;
    failureDetails = fsErr.message;
  }

  // 2. اختبار Firebase Storage الحقيقي
  try {
    const [exists] = await storage.exists();
    if (exists) {
      storageResult = 'connected';
    } else {
      storageResult = `not_found: الحاوية ${storageBucket} غير موجودة أو لم يتم تفعيل Firebase Storage في المشروع بعد`;
    }
  } catch (stErr: any) {
    storageResult = `error: ${stErr.message || stErr.code || String(stErr)}`;
    if (!failureDetails) failureDetails = stErr.message;
  }

  return {
    backend: 'online',
    firestore: firestoreResult,
    storage: storageResult,
    projectId,
    bucket: storageBucket,
    serviceAccount: credentialInfo.isServiceAccount,
    credentialSource: credentialInfo.source,
    details: failureDetails
  };
}
