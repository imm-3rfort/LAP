const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {setGlobalOptions}=require('firebase-functions/v2');
const admin=require('firebase-admin');

admin.initializeApp();
setGlobalOptions({region:'us-central1'});
const db=admin.firestore();

exports.sendAnsNotification=onCall(async request=>{
  if(!request.auth){
    throw new HttpsError('unauthenticated','You must be signed in.');
  }

  const uid=request.auth.uid;
  const title=String(request.data?.title || '').trim();
  const body=String(request.data?.body || '').trim();

  if(!title || !body){
    throw new HttpsError('invalid-argument','Title and message are required.');
  }
  if(title.length>120 || body.length>2000){
    throw new HttpsError('invalid-argument','The edict is too long.');
  }

  const myTokens=await db.collection('fcmTokens').where('uid','==',uid).get();
  let senderRank='';
  for(const doc of myTokens.docs){
    const rank=doc.data().rank;
    if(['R1','R2','R3','R4','R5'].includes(rank)){senderRank=rank;break;}
  }

  if(!['R4','R5'].includes(senderRank)){
    throw new HttpsError('permission-denied','Only R4 and R5 can send alliance edicts.');
  }

  const allTokens=await db.collection('fcmTokens').get();
  const tokenDocs=[];
  const seen=new Set();
  for(const doc of allTokens.docs){
    const data=doc.data();
    const token=String(data.token || '').trim();
    if(token && !seen.has(token)){
      seen.add(token);
      tokenDocs.push({id:doc.id,token});
    }
  }

  let sent=0,failed=0;
  const invalid=[];
  const chunkSize=500;

  for(let i=0;i<tokenDocs.length;i+=chunkSize){
    const chunk=tokenDocs.slice(i,i+chunkSize);
    const response=await admin.messaging().sendEachForMulticast({
      tokens:chunk.map(x=>x.token),
      data:{
        title,
        body,
        url:'https://imm-3rfort.github.io/LAP/',
        type:'ANS_EDICT'
      }
    });
    sent+=response.successCount;
    failed+=response.failureCount;
    response.responses.forEach((result,index)=>{
      if(!result.success){
        const code=result.error?.code || '';
        if(code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')){
          invalid.push(chunk[index].id);
        }
      }
    });
  }

  if(invalid.length){
    const batch=db.batch();
    invalid.forEach(id=>batch.delete(db.collection('fcmTokens').doc(id)));
    await batch.commit();
  }

  await db.collection('announcements').add({
    title,
    body,
    recipient:'all',
    senderUid:uid,
    senderEmail:request.auth.token.email || '',
    senderRank,
    createdAt:admin.firestore.FieldValue.serverTimestamp(),
    notificationSent:true,
    sentDevices:sent,
    failedDevices:failed,
    totalDevices:tokenDocs.length
  });

  return {success:true,sent,failed,totalDevices:tokenDocs.length};
});
