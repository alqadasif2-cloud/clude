import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateJwt } from '../middleware/auth';
import { adminFirestore, bucket } from '../firebase';

export const backupRouter = Router();

backupRouter.use(authenticateJwt);

/**
 * جلب تفاصيل أحدث نسخة احتياطية
 * GET /api/backup/latest
 */
backupRouter.get('/latest', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const username = req.user?.username;
    if (!username) return res.status(401).json({ success: false, error: 'غير مصرح' });

    const syncStateDoc = await adminFirestore
      .collection('users')
      .doc(username)
      .collection('metadata')
      .doc('sync_state')
      .get();

    if (!syncStateDoc.exists) {
      return res.json({
        success: true,
        lastSyncTimestamp: null,
        message: 'لا توجد نسخ احتياطية مسجلة حتى الآن'
      });
    }

    const data = syncStateDoc.data();
    return res.json({
      success: true,
      lastSyncTimestamp: data?.lastSyncTimestamp || null,
      deviceModel: data?.deviceModel,
      updatedAt: data?.updatedAt
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * جلب سجل جلسات النسخ الاحتياطي السابقة
 * GET /api/backup/history
 */
backupRouter.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const username = req.user?.username;
    if (!username) return res.status(401).json({ success: false, error: 'غير مصرح' });

    const sessionsSnap = await adminFirestore
      .collection('users')
      .doc(username)
      .collection('backup_sessions')
      .orderBy('syncTimestamp', 'desc')
      .limit(50)
      .get();

    const sessions = sessionsSnap.docs.map((doc: any) => doc.data());

    return res.json({
      success: true,
      sessionsCount: sessions.length,
      sessions
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
