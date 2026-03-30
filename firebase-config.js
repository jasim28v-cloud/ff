import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, update, get, child, remove } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyC8rvv7OihIJbTPz8wLNPPEURP6HeGXPos",
    authDomain: "coco-989ec.firebaseapp.com",
    databaseURL: "https://coco-989ec-default-rtdb.firebaseio.com",
    projectId: "coco-989ec",
    storageBucket: "coco-989ec.firebasestorage.app",
    messagingSenderId: "476879537305",
    appId: "1:476879537305:web:4bd41c433cb4a1efba6408"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export { ref, push, set, onValue, update, get, child, remove };

// Cloudinary Configuration
export const CLOUD_NAME = 'dnmpmysk6';
export const UPLOAD_PRESET = 'do_2gg';

console.log('✅ Firebase Ready');
