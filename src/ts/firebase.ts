import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyBWlQ5GR3TAJSzIKgnNcs_Re2IGBfnXStw',
  authDomain: 'akapen-kenpindai.firebaseapp.com',
  projectId: 'akapen-kenpindai',
  storageBucket: 'akapen-kenpindai.firebasestorage.app',
  messagingSenderId: '618899038254',
  appId: '1:618899038254:web:c5a99011bfab9be25bffbf',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
