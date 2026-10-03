import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth';
import { uploadRouter } from './routes/upload';
import { backupRouter } from './routes/backup';
import { runRealHealthCheck } from './firebase';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الوسائط والأمان
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * فحص الصحة الشامل مع اختبار اتصال حقيقي بـ Cloud Firestore و Firebase Storage
 * GET /api/health
 */
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const result = await runRealHealthCheck();
    const isHealthy = result.firestore === 'connected' && result.storage === 'connected';

    if (!result.serviceAccount && !isHealthy) {
      return res.status(503).json({
        ...result,
        message: 'الخادم يعمل، ولكن بانتظار تزويد ملف مفتاح الخدمة الخاص serviceAccountKey.json لتفعيل الاتصال الكامل بـ Firebase.',
        error: result.details || 'بيانات اعتماد الخدمة (Service Account) غير متوفرة أو تفتقر إلى الأذونات.',
        actionRequired: [
          '1. افتح Firebase Console: https://console.firebase.google.com/',
          '2. انتقل إلى Project Settings -> Service accounts.',
          '3. اضغط على Generate new private key.',
          '4. ضع الملف المنزّل داخل backend/credentials/serviceAccountKey.json',
          '5. تأكد من تفعيل Cloud Firestore و Firebase Storage في لوحة تحكم مشروعك.'
        ]
      });
    }

    return res.status(isHealthy ? 200 : 503).json(result);
  } catch (error: any) {
    return res.status(500).json({
      backend: 'online',
      firestore: 'error',
      storage: 'error',
      serviceAccount: false,
      error: error.message || 'حدث خطأ غير متوقع أثناء فحص الاتصال بـ Firebase'
    });
  }
});

// تسجيل المسارات الرسمية للـ REST API
app.use('/api', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/backup', backupRouter);

// معالج الأخطاء العام
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: 'حدث خطأ داخلي في خادم الـ Backend: ' + (err.message || 'Unknown error')
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Personal Cloud Backup Backend Server is running!`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 REST API endpoints: /api/login, /api/register, /api/upload/backup, /api/health`);
  console.log(`=======================================================`);
});

export default app;
