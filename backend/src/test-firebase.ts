import { db, storage, projectId, storageBucket, credentialInfo } from './firebase';

/**
 * سكربت الاختبار الحي الفعلي للربط مع Firebase:
 * 1. محاولة إنشاء مستند تجريبي في Cloud Firestore
 * 2. قراءة المستند والتحقق من محتواه
 * 3. رفع ملف JSON تجريبي إلى Firebase Storage
 * 4. قراءة الملف من Firebase Storage والتحقق من صحته
 * 5. حذف البيانات التجريبية لتنظيف السحابة
 * 6. طباعة تقرير مفصل بنتائج كل خطوة
 */
async function runRealEndToEndFirebaseTest() {
  console.log('===============================================================');
  console.log('🧪 بدء اختبار الاتصال الحقيقي الفعلي بـ Firebase Admin SDK');
  console.log(`📌 Project ID: ${projectId}`);
  console.log(`🪣 Storage Bucket: ${storageBucket}`);
  console.log(`🔑 Credential Source: ${credentialInfo.source} (Service Account: ${credentialInfo.isServiceAccount})`);
  console.log('===============================================================');

  const report: {
    firestoreWrite: boolean;
    firestoreRead: boolean;
    firestoreDelete: boolean;
    storageUpload: boolean;
    storageRead: boolean;
    storageDelete: boolean;
    errors: string[];
  } = {
    firestoreWrite: false,
    firestoreRead: false,
    firestoreDelete: false,
    storageUpload: false,
    storageRead: false,
    storageDelete: false,
    errors: []
  };

  const testId = `test_${Date.now()}`;

  // -------------------------------------------------------------
  // اختبار 1: Cloud Firestore (Write -> Read -> Delete)
  // -------------------------------------------------------------
  console.log('\n[1/2] 📝 جاري اختبار Cloud Firestore...');
  const testDocRef = db.collection('_integration_tests').doc(testId);
  const samplePayload = {
    testId,
    purpose: 'End-to-End Automated Connectivity Verification',
    createdAt: new Date().toISOString(),
    status: 'ACTIVE_TEST'
  };

  try {
    // أ. كتابة مستند
    await testDocRef.set(samplePayload);
    report.firestoreWrite = true;
    console.log('   ✅ 1. إنشاء مستند تجريبي في Firestore: نجح');

    // ب. قراءة المستند
    const snapshot = await testDocRef.get();
    if (snapshot.exists && snapshot.data()?.testId === testId) {
      report.firestoreRead = true;
      console.log('   ✅ 2. قراءة المستند والتحقق من التطابق: نجح');
    } else {
      throw new Error('فشلت قراءة المستند التجريبي أو البيانات غير متطابقة');
    }

    // ج. حذف المستند
    await testDocRef.delete();
    report.firestoreDelete = true;
    console.log('   ✅ 3. حذف المستند التجريبي لتنظيف قاعدة البيانات: نجح');
  } catch (fsError: any) {
    console.error('   ❌ فشل في اختبار Firestore:', fsError.message);
    report.errors.push(`Firestore: ${fsError.message}`);
  }

  // -------------------------------------------------------------
  // اختبار 2: Firebase Storage (Upload JSON -> Download -> Delete)
  // -------------------------------------------------------------
  console.log('\n[2/2] 📦 جاري اختبار Firebase Storage...');
  const testFileName = `temp_tests/backup_test_${testId}.json`;
  const fileRef = storage.file(testFileName);
  const testJsonData = JSON.stringify({
    testId,
    content: 'Automated test payload to verify Firebase Storage upload/download',
    timestamp: Date.now()
  }, null, 2);

  try {
    // أ. رفع ملف JSON تجريبي
    await fileRef.save(Buffer.from(testJsonData, 'utf-8'), {
      contentType: 'application/json',
      metadata: { testId, isTemporary: 'true' }
    });
    report.storageUpload = true;
    console.log(`   ✅ 1. رفع ملف JSON تجريبي (${testFileName}): نجح`);

    // ب. قراءة الملف وتنزيله
    const [downloadedBuffer] = await fileRef.download();
    const downloadedContent = downloadedBuffer.toString('utf-8');
    const parsedData = JSON.parse(downloadedContent);
    if (parsedData.testId === testId) {
      report.storageRead = true;
      console.log('   ✅ 2. قراءة وتنزيل الملف من Firebase Storage والتحقق: نجح');
    } else {
      throw new Error('محتوى الملف المنزّل غير متطابق مع الملف المرفوع');
    }

    // ج. حذف الملف التجريبي
    await fileRef.delete();
    report.storageDelete = true;
    console.log('   ✅ 3. حذف الملف التجريبي من Firebase Storage: نجح');
  } catch (stError: any) {
    console.error('   ❌ فشل في اختبار Firebase Storage:', stError.message);
    report.errors.push(`Storage: ${stError.message}`);
  }

  console.log('\n===============================================================');
  console.log('📊 ملخص نتائج الاختبار الفعلي:');
  console.log(`   - Firestore Write:  ${report.firestoreWrite ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   - Firestore Read:   ${report.firestoreRead ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   - Firestore Delete: ${report.firestoreDelete ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   - Storage Upload:   ${report.storageUpload ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   - Storage Download: ${report.storageRead ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   - Storage Delete:   ${report.storageDelete ? '✅ SUCCESS' : '❌ FAILED'}`);
  if (report.errors.length > 0) {
    console.log('\n⚠️ أسباب الفشل الحقيقية القادمة من Firebase Admin SDK:');
    report.errors.forEach(e => console.log(`   • ${e}`));
    console.log('\n💡 الحل: ضع ملف serviceAccountKey.json الرسمي من Firebase Console داخل backend/credentials/serviceAccountKey.json');
  } else {
    console.log('\n🎉 جميع العمليات نجحت بنسبة 100%! الاتصال مع Firebase Admin SDK مكتمل وجاهز للإنتاج.');
  }
  console.log('===============================================================');

  return report;
}

runRealEndToEndFirebaseTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
  });
