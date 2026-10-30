/* =========================================================
   ONE-TIME MIGRATION: approve everyone who already has an account
   and make yourself an admin.

   Why: the new rules only let APPROVED people into tips, gallery and
   birthdays. Accounts created before this change have no membership
   record yet, so this script creates one (status "approved") for each.

   How to run (from this "functions" folder):
     1) npm install
     2) Firebase console > Project settings > Service accounts >
        "Generate new private key". Save the file OUTSIDE the project
        (never commit it).
     3) Windows (PowerShell):
          $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\key.json"
          node approve-existing-members.js your-email@gmail.com
        Mac/Linux:
          GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node approve-existing-members.js your-email@gmail.com

   The email you pass becomes an admin (can approve requests and
   receives the notifications). Safe to run again.
   ========================================================= */
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

admin.initializeApp({ projectId: 'lap-ans' });
const auth = admin.auth();
const db = admin.firestore();

(async () => {
  const adminEmail = String(process.argv[2] || '').trim().toLowerCase();
  if (!adminEmail) {
    console.error('Usage: node approve-existing-members.js your-email@gmail.com');
    process.exit(1);
  }

  let pageToken;
  let created = 0;
  let skipped = 0;
  let admins = 0;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      const ref = db.collection('members').doc(u.uid);
      const snap = await ref.get();
      const isAdminUser = (u.email || '').toLowerCase() === adminEmail;

      if (!snap.exists) {
        await ref.set({
          uid: u.uid,
          name: String(u.displayName || (u.email || '').split('@')[0] || 'Member').slice(0, 30),
          email: u.email || '',
          message: 'Existing member (migrated)',
          status: 'approved',
          requestedAt: FieldValue.serverTimestamp(),
          decidedAt: FieldValue.serverTimestamp(),
          decidedBy: 'migration'
        });
        created++;
      } else if (isAdminUser && snap.data().status !== 'approved') {
        await ref.update({ status: 'approved', decidedAt: FieldValue.serverTimestamp(), decidedBy: 'migration' });
      } else {
        skipped++;
      }

      if (isAdminUser) {
        await db.collection('admins').doc(u.uid).set({ email: u.email || '', createdAt: FieldValue.serverTimestamp() });
        admins++;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`Done. Approved ${created} existing account(s), skipped ${skipped}, admin set for ${admins} account(s).`);
  if (!admins) console.log('WARNING: no account matched ' + adminEmail + ' - check the email and run again.');
})().catch((e) => { console.error(e); process.exit(1); });
