// ==========================================================================
// QuizPulse — firebase.js
// This file ONLY handles Firebase configuration and initialization.
// It creates the "db" (Firestore) and "auth" (Authentication) variables
// that the other JavaScript files (auth.js and app.js) use.
// ==========================================================================

// ===== 1. FIREBASE CONFIGURATION OBJECT =====
// Replace the placeholder values below with your Firebase project settings
// from the Firebase Console (Project Settings -> General -> Your apps -> Web app).
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};


// ===== 2. GLOBAL DATABASE AND AUTH VARIABLES =====
// These variables will be accessed by auth.js and app.js
var db = null;
var auth = null;

// ===== 3. INITIALIZE FIREBASE =====
// We check if the Firebase library is loaded on the page
if (typeof firebase !== "undefined") {
  // Check if the user has replaced the default project id
  if (firebaseConfig.projectId !== "YOUR_PROJECT_ID") {
    try {
      // Initialize Firebase App
      firebase.initializeApp(firebaseConfig);

      // Create database and auth instances
      db = firebase.firestore();
      auth = firebase.auth();

      console.log("Firebase connected successfully to: " + firebaseConfig.projectId);
    } catch (initError) {
      console.log("Firebase initialization notice: " + initError.message);
    }
  } else {
    console.log("Running in local storage fallback mode (replace YOUR_PROJECT_ID in firebase.js to use live Firestore).");
  }
} else {
  console.log("Firebase CDN scripts not detected. Running in local storage fallback mode.");
}

