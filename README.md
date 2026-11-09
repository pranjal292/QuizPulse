# QuizPulse — Real-Time Assessment Platform

QuizPulse is a lightweight, real-time examination and quiz platform built with vanilla **HTML5**, **CSS3**, and **JavaScript**, powered by **Google Cloud Firestore**.

---

## Features

- **Organizer Studio**:
  - Create assessments using standardized JSON schema.
  - Built-in schema validator with instant syntax/key error feedback.
  - Real-time room control (Start Quiz, End Quiz) with synchronized 6-digit room codes.
  - Granular post-quiz visibility control (`marks_only`, `marks_and_answers`, `full_analysis`).
  - Historical reports, class averages, question difficulty percentages, and individual candidate drill-downs.

- **Student Portal**:
  - Simple 6-digit room code check-in with single-attempt enforcement.
  - Synchronized waiting lobby with live entry window countdown (Timer 1).
  - Fullscreen examination screen with live attempt duration timer (Timer 2).
  - 1-strike anti-cheat monitoring (window blur, tab switching, and fullscreen exit detection).
  - Autosaved question drafts to prevent data loss on accidental disconnects.
  - Immediate evaluation and breakdown based on organizer-configured visibility.

---

## File Structure

```text
├── index.html        # Landing page & role entry (Organizer / Student)
├── teacher.html      # Organizer dashboard, creator, live room & drill-downs
├── student.html      # Candidate check-in & synchronized waiting lobby
├── quiz.html         # Candidate exam screen (fullscreen, timer, anti-cheat)
├── firebase.js       # Firebase & Firestore initialization
├── auth.js           # Organizer/Student authentication, queries & statistics
├── app.js            # Active quiz engine (timers, grading, draft autosave)
├── vercel.json       # Deployment configuration for clean URLs
└── .gitignore        # Git ignore rules
```

---

## Getting Started

### 1. Configure Firebase / Firestore

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. In the left sidebar, click **Build** → **Firestore Database** → **Create database** (choose **Start in test mode**).
3. Under **Project settings** (⚙️) → **Your apps**, click the **Web (`</>`)** icon to register an app.
4. Open `firebase.js` and paste your project settings into `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

> **Note**: If left with placeholder values, QuizPulse will automatically run in local storage fallback mode so you can test immediately offline.

### 2. Run Locally

Serve the project folder with any local server:

```bash
# Using Node (npx)
npx serve .

# Or using Python
python -m http.server 3000
```

Open `http://localhost:3000` in your browser.

---

## Deployment (Vercel)

Deploy to Vercel with zero build configuration:

```bash
npx vercel
```

Or connect this repository directly in the [Vercel Dashboard](https://vercel.com/new).

---

## License

MIT License &copy; 2026 QuizPulse
