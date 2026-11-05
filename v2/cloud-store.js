/**
 * Split V2 Cloud Store — dedicated Firebase project only.
 * Do not reuse the V1 project: split-da653.
 *
 * Share-link semantics: everyone knowing the 24-character unguessable room code
 * can read/write its expenses after anonymous sign-in. Only the creator can
 * delete the entire room. This is not user-level private membership.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, onSnapshot, query, orderBy,
  writeBatch, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const COLLECTION = "roomsV2";
const INDEX = "usersV2";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 24; // ~120 bits of entropy. Do not shorten.
export const isRoomCode = value =>
  typeof value === "string" && /^[A-HJ-NP-Z2-9]{24}$/.test(value);

export function createRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}
export function configured() {
  return Boolean(firebaseConfig && typeof firebaseConfig.apiKey==="string"
    && firebaseConfig.apiKey.trim() && firebaseConfig.projectId
    && firebaseConfig.projectId!=="SET_NEW_PROJECT_ID"
    && firebaseConfig.projectId!=="split-da653");
}
function ensureConfiguration() {
  if (!configured()) throw new Error(
    "Firebase V2 non è ancora configurato. Serve un progetto Firebase separato dalla V1."
  );
}

export async function connectCloud() {
  ensureConfiguration();
  const firebaseApp = initializeApp(firebaseConfig, "split-v2-cloud");
  const auth = getAuth(firebaseApp);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Autenticazione anonima Firebase non riuscita.");
  const db = getFirestore(firebaseApp);
  const roomRef = roomId => {
    if (!isRoomCode(roomId)) throw new Error("Codice Split non valido.");
    return doc(db, COLLECTION, roomId);
  };
  const expenseCollection = roomId => collection(roomRef(roomId), "expenses");
  const indexRef = roomId => doc(db, INDEX, uid, "splits", roomId);
  const roomData = (id, data) => ({
    id, name:data.name || "", users:Array.isArray(data.users)?data.users:[],
    ownerUid:data.ownerUid || "", createdAt:data.createdAt?.toMillis?.()||Date.now()
  });

  return {
    uid,
    async createRoom(name, users) {
      let id;
      do { id=createRoomCode(); } while ((await getDoc(doc(db,COLLECTION,id))).exists());
      const record={name,users,ownerUid:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
      const batch=writeBatch(db);
      batch.set(roomRef(id),record);
      batch.set(indexRef(id),{name,users,createdAt:serverTimestamp()});
      await batch.commit();
      return id;
    },
    async getRoom(id) {
      const snap=await getDoc(roomRef(id));
      return snap.exists()?roomData(id,snap.data()):null;
    },
    listenMyGroups(next, fail) {
      return onSnapshot(
        query(collection(db,INDEX,uid,"splits"),orderBy("createdAt","desc")),
        snapshot=>next(snapshot.docs.map(d=>({
          id:d.id,name:d.data().name,users:Array.isArray(d.data().users)?d.data().users:[],
          createdAt:d.data().createdAt?.toMillis?.()||0
        }))),fail
      );
    },
    listenRoom(id,next,fail) {
      return onSnapshot(roomRef(id),snapshot=>next(
        snapshot.exists()?roomData(id,snapshot.data()):null
      ),fail);
    },
    listenExpenses(id,next,fail) {
      return onSnapshot(
        query(expenseCollection(id),orderBy("createdAt","desc")),
        snapshot=>next(snapshot.docs.map(d=>({id:d.id,...d.data(),
          createdAt:d.data().createdAt?.toMillis?.()||0
        }))),fail
      );
    },
    async registerGroup(id) {
      const room=await this.getRoom(id);
      if (!room) return null;
      await setDoc(indexRef(id),{
        name:room.name,users:room.users,createdAt:serverTimestamp()
      });
      return room;
    },
    async forgetGroup(id) {await deleteDoc(indexRef(id));},
    async addExpense(id,expense) {
      await addDoc(expenseCollection(id),{
        amountCents:expense.amountCents,
        payerId:expense.payerId,
        participantIds:expense.participantIds,
        note:expense.note,
        category:expense.category||"",
        createdBy:uid,
        createdAt:serverTimestamp()
      });
    },
    async changeCategory(id,expenseId,category) {
      await updateDoc(doc(expenseCollection(id),expenseId),{category:category||""});
    },
    async removeExpense(id,expenseId) {
      await deleteDoc(doc(expenseCollection(id),expenseId));
    },
    async deleteRoom(id) {
      const room=await this.getRoom(id);
      if (!room) throw new Error("Gruppo non trovato.");
      if (room.ownerUid!==uid) throw new Error("Solo il creatore può eliminare il gruppo.");
      // Delete children first: Firestore does NOT cascade subcollections.
      const snapshot=await getDocs(expenseCollection(id));
      const docs=snapshot.docs;
      for (let start=0;start<docs.length;start+=350) {
        const batch=writeBatch(db);
        docs.slice(start,start+350).forEach(item=>batch.delete(item.ref));
        await batch.commit();
      }
      await deleteDoc(roomRef(id));
      await deleteDoc(indexRef(id));
    },
    async importLocalRoom(localRoom) {
      if (!localRoom || !localRoom.name || !Array.isArray(localRoom.users) ||
          localRoom.users.length<2 || localRoom.users.length>10)
        throw new Error("Gruppo locale non valido.");
      const id=await this.createRoom(localRoom.name,localRoom.users);
      for (const expense of localRoom.expenses||[]) {
        if (!Number.isSafeInteger(expense.amountCents)||expense.amountCents<=0)continue;
        await addDoc(expenseCollection(id),{
          amountCents:expense.amountCents,payerId:expense.payerId,
          participantIds:expense.participantIds,
          note:String(expense.note||"").slice(0,140),
          category:String(expense.category||"").slice(0,55),
          createdBy:uid,createdAt:serverTimestamp()
        });
      }
      return id;
    }
  };
}
