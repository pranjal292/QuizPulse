// ==========================================================================
// QuizPulse — auth.js
// Backend logic for authentication, database queries, and score analysis.
//
// VARIABLES USED FROM firebase.js:
// - db   : The Cloud Firestore database instance (or null in local mode)
// - auth : The Firebase Authentication instance (or null in local mode)
// ==========================================================================


// ==========================================================================
// 1. SIMPLE NOTIFICATION & MODAL HELPERS
// ==========================================================================

// Shows a simple notification toast banner at the top of any page
function showToast(messageText, isError) {
  let toastElement = document.getElementById("notification-toast");

  if (toastElement === null) {
    // Create toast dynamically if not already in HTML
    toastElement = document.createElement("div");
    toastElement.id = "notification-toast";
    toastElement.className = "toast-message hidden";
    document.body.appendChild(toastElement);
  }

  toastElement.textContent = messageText;

  if (isError === true) {
    toastElement.className = "toast-message toast-error";
  } else {
    toastElement.className = "toast-message toast-success";
  }

  toastElement.classList.remove("hidden");

  // Automatically hide after 4 seconds
  setTimeout(function() {
    toastElement.classList.add("hidden");
  }, 4000);
}

// Formats an ISO date string into a friendly readable date
function formatDateSimple(isoString) {
  if (isoString === null || isoString === undefined || isoString === "") {
    return "—";
  }

  const dateObject = new Date(isoString);
  if (isNaN(dateObject.getTime())) {
    return isoString;
  }

  const options = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  };

  return dateObject.toLocaleDateString(undefined, options);
}


// ==========================================================================
// 2. TEACHER AUTHENTICATION (NO EMAIL VERIFICATION / DIRECT DATABASE)
// Enforces: One teacher account per email address
// ==========================================================================

// Registers a new teacher account directly in the database
async function teacherSignUp(email, password, displayName) {
  try {
    const cleanEmail = email.toLowerCase().trim();
    let resolvedName = cleanEmail;
    if (displayName && displayName.trim() !== "") {
      resolvedName = displayName.trim();
    }

    // Check if an organizer with this email already exists
    let existingTeacher = null;

    if (db !== null) {
      const docSnapshot = await db.collection("organizers").doc(cleanEmail).get();
      if (docSnapshot.exists === true) {
        existingTeacher = docSnapshot.data();
      }
    } else {
      // LocalStorage fallback
      const savedOrganizersString = localStorage.getItem("quizpulse_organizers");
      if (savedOrganizersString !== null) {
        const organizersList = JSON.parse(savedOrganizersString);
        for (let i = 0; i < organizersList.length; i = i + 1) {
          if (organizersList[i].email === cleanEmail) {
            existingTeacher = organizersList[i];
            break;
          }
        }
      }
    }

    // Rule: One teacher account per email
    if (existingTeacher !== null) {
      return {
        success: false,
        errorMessage: "An account with email " + cleanEmail + " already exists. Please Sign In."
      };
    }

    // Create the new organizer account object
    const newTeacherRecord = {
      email: cleanEmail,
      name: resolvedName,
      password: password,
      createdAt: new Date().toISOString()
    };

    // Save to Firestore organizers collection
    if (db !== null) {
      await db.collection("organizers").doc(cleanEmail).set(newTeacherRecord);
    }

    // Always update local organizers storage as backup
    const savedOrganizersString = localStorage.getItem("quizpulse_organizers");
    let organizersList = [];
    if (savedOrganizersString !== null) {
      organizersList = JSON.parse(savedOrganizersString);
    }
    organizersList.push(newTeacherRecord);
    localStorage.setItem("quizpulse_organizers", JSON.stringify(organizersList));

    // Save active logged-in teacher session
    const teacherSession = {
      email: cleanEmail,
      name: resolvedName,
      loggedInAt: new Date().toISOString()
    };
    localStorage.setItem("quizpulse_teacher", JSON.stringify(teacherSession));

    showToast("Account created successfully! Welcome, " + resolvedName, false);
    return { success: true, teacher: teacherSession };
  } catch (error) {
    showToast("Sign up failed: " + error.message, true);
    return { success: false, errorMessage: error.message };
  }
}

// Signs in an existing teacher
async function teacherSignIn(email, password) {
  try {
    const cleanEmail = email.toLowerCase().trim();
    let foundTeacher = null;

    // Check Firestore
    if (db !== null) {
      const docSnapshot = await db.collection("organizers").doc(cleanEmail).get();
      if (docSnapshot.exists === true) {
        foundTeacher = docSnapshot.data();
      }
    }

    // If not found in Firestore or offline, check local storage
    if (foundTeacher === null) {
      const savedOrganizersString = localStorage.getItem("quizpulse_organizers");
      if (savedOrganizersString !== null) {
        const organizersList = JSON.parse(savedOrganizersString);
        for (let i = 0; i < organizersList.length; i = i + 1) {
          if (organizersList[i].email === cleanEmail) {
            foundTeacher = organizersList[i];
            break;
          }
        }
      }
    }

    // If account doesn't exist
    if (foundTeacher === null) {
      return {
        success: false,
        errorMessage: "No organizer account found for " + cleanEmail + ". Please click 'Create Account' first."
      };
    }

    // Verify password if one was set
    if (foundTeacher.password && password && foundTeacher.password !== password) {
      return {
        success: false,
        errorMessage: "Incorrect password for " + cleanEmail + "."
      };
    }

    // Save active logged-in session
    let resolvedName = cleanEmail;
    if (foundTeacher.name && foundTeacher.name !== "") {
      resolvedName = foundTeacher.name;
    }

    const teacherSession = {
      email: cleanEmail,
      name: resolvedName,
      loggedInAt: new Date().toISOString()
    };
    localStorage.setItem("quizpulse_teacher", JSON.stringify(teacherSession));

    showToast("Signed in as " + resolvedName, false);
    return { success: true, teacher: teacherSession };
  } catch (error) {
    showToast("Sign in failed: " + error.message, true);
    return { success: false, errorMessage: error.message };
  }
}

// Signs out the teacher
async function teacherSignOut() {
  try {
    if (auth !== null) {
      await auth.signOut();
    }
  } catch (error) {
    // Ignore signout error
  }

  localStorage.removeItem("quizpulse_teacher");
  showToast("You have been signed out.", false);
  window.location.href = "index.html";
}

// Returns the currently logged in teacher, or null if none
function getLoggedInTeacher() {
  const savedString = localStorage.getItem("quizpulse_teacher");
  if (savedString !== null && savedString !== "") {
    try {
      const teacherObject = JSON.parse(savedString);
      return teacherObject;
    } catch (parseError) {
      return null;
    }
  }
  return null;
}

// Route guard: Redirects to index.html if no teacher is logged in
function requireTeacherAuth() {
  const teacher = getLoggedInTeacher();
  if (teacher === null) {
    window.location.href = "index.html";
    return null;
  }
  return teacher;
}


// ==========================================================================
// 3. STUDENT AUTHENTICATION & SESSION MANAGEMENT
// ==========================================================================

// Validates student login credentials and checks room access
async function studentLogin(orgCode, studentId, password) {
  try {
    // Password MUST equal the username
    if (studentId === "" || password === "") {
      return { success: false, errorMessage: "Student ID and password are required." };
    }

    if (studentId !== password) {
      return { success: false, errorMessage: "Per system rules, your password must match your Student ID." };
    }

    // Fetch quiz from database
    const quiz = await fetchQuizByCode(orgCode);
    if (quiz === null) {
      return { success: false, errorMessage: "Quiz room " + orgCode + " not found." };
    }

    // Check if student is allowed (if an allowed list exists)
    if (Array.isArray(quiz.allowedStudents) && quiz.allowedStudents.length > 0) {
      let isAllowed = false;
      for (let i = 0; i < quiz.allowedStudents.length; i = i + 1) {
        if (quiz.allowedStudents[i].studentId === studentId) {
          isAllowed = true;
          break;
        }
      }
      if (isAllowed === false) {
        return { success: false, errorMessage: "Student ID " + studentId + " is not authorized for this quiz." };
      }
    }

    // Check previous submissions to prevent duplicate attempts
    const submissions = quiz.submissions || [];
    for (let i = 0; i < submissions.length; i = i + 1) {
      const sub = submissions[i];
      if (sub.studentId === studentId) {
        if (sub.sessionPurged === true || sub.status === "purged") {
          return { success: false, errorMessage: "Assessment Completed & Session Expired. Re-entry blocked." };
        }
        if (sub.status === "submitted" || sub.status === "terminated_cheat") {
          return {
            success: true,
            isAlreadyCompleted: true,
            quiz: quiz,
            submission: sub
          };
        }
        // Resuming in-progress attempt
        saveStudentSession(orgCode, studentId, quiz);
        return {
          success: true,
          isResuming: true,
          quiz: quiz,
          submission: sub
        };
      }
    }

    // Check room status for new entries
    if (quiz.status === "ended") {
      return { success: false, errorMessage: "This quiz session has already ended." };
    }

    // Create a new submission record
    const newSubmission = {
      studentId: studentId,
      studentStartTimestamp: null,
      status: "in_progress",
      autoSubmitted: false,
      responses: {},
      timeSpentPerQuestion: {},
      tabViolations: 0,
      score: null,
      submittedAt: null,
      sessionPurged: false
    };

    if (!quiz.submissions) {
      quiz.submissions = [];
    }
    quiz.submissions.push(newSubmission);

    // Save updated quiz to database
    await saveQuizToDatabase(quiz);

    // Save student session in sessionStorage
    saveStudentSession(orgCode, studentId, quiz);

    return {
      success: true,
      isResuming: false,
      quiz: quiz,
      submission: newSubmission
    };
  } catch (error) {
    return { success: false, errorMessage: "Login error: " + error.message };
  }
}

// Saves student session to sessionStorage
function saveStudentSession(orgCode, studentId, quiz) {
  const sessionData = {
    orgCode: orgCode,
    studentId: studentId,
    quizTitle: quiz.quizTitle,
    loggedInAt: new Date().toISOString()
  };
  sessionStorage.setItem("quizpulse_student", JSON.stringify(sessionData));
}

// Returns the current student session from sessionStorage
function getLoggedInStudent() {
  const savedString = sessionStorage.getItem("quizpulse_student");
  if (savedString !== null && savedString !== "") {
    try {
      return JSON.parse(savedString);
    } catch (parseError) {
      return null;
    }
  }
  return null;
}

// Clears the student session
function studentLogout() {
  sessionStorage.removeItem("quizpulse_student");
  window.location.href = "index.html";
}


// ==========================================================================
// 4. DATABASE QUERIES (FIRESTORE + LOCALSTORAGE FALLBACK)
// ==========================================================================

// Fetches all quizzes from Firestore or localStorage
async function fetchAllQuizzes() {
  try {
    // If live Firestore is connected
    if (db !== null) {
      const snapshot = await db.collection("quizzes").get();
      const quizzesList = [];

      for (let i = 0; i < snapshot.docs.length; i = i + 1) {
        const docSnapshot = snapshot.docs[i];
        const quizData = docSnapshot.data();
        quizzesList.push(quizData);
      }

      return quizzesList;
    }

    // LocalStorage fallback
    const savedString = localStorage.getItem("quizpulse_quizzes");
    if (savedString !== null && savedString !== "") {
      const parsedData = JSON.parse(savedString);
      return parsedData;
    }

    return [];
  } catch (error) {
    console.log("Error fetching all quizzes: " + error.message);
    const backupString = localStorage.getItem("quizpulse_quizzes");
    if (backupString !== null && backupString !== "") {
      return JSON.parse(backupString);
    }
    return [];
  }
}

// Fetches a single quiz by its 6-digit room code
async function fetchQuizByCode(orgCode) {
  try {
    // If live Firestore is connected
    if (db !== null) {
      const docSnapshot = await db.collection("quizzes").doc(orgCode).get();
      if (docSnapshot.exists === true) {
        return docSnapshot.data();
      }
      return null;
    }

    // Local fallback
    const allQuizzes = await fetchAllQuizzes();
    for (let i = 0; i < allQuizzes.length; i = i + 1) {
      if (allQuizzes[i].orgId === orgCode) {
        return allQuizzes[i];
      }
    }

    return null;
  } catch (error) {
    console.log("Error fetching quiz " + orgCode + ": " + error.message);
    return null;
  }
}

// Fetches all quizzes owned by a specific teacher, sorted newest first
async function fetchTeacherQuizzes(teacherEmail) {
  try {
    const allQuizzes = await fetchAllQuizzes();
    const teacherQuizzes = [];

    for (let i = 0; i < allQuizzes.length; i = i + 1) {
      const q = allQuizzes[i];
      if (q.organizerEmail === teacherEmail || teacherEmail === "all") {
        teacherQuizzes.push(q);
      }
    }

    // Sort newest first by createdAt date
    teacherQuizzes.sort(function(a, b) {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return teacherQuizzes;
  } catch (error) {
    console.log("Error fetching teacher quizzes: " + error.message);
    return [];
  }
}

// Saves or updates a quiz in Firestore and localStorage
async function saveQuizToDatabase(quizObject) {
  try {
    // Save to localStorage
    const allQuizzes = await fetchAllQuizzes();
    let foundIndex = -1;

    for (let i = 0; i < allQuizzes.length; i = i + 1) {
      if (allQuizzes[i].orgId === quizObject.orgId) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex >= 0) {
      allQuizzes[foundIndex] = quizObject;
    } else {
      allQuizzes.push(quizObject);
    }

    localStorage.setItem("quizpulse_quizzes", JSON.stringify(allQuizzes));

    // If live Firestore is connected, save document
    if (db !== null) {
      await db.collection("quizzes").doc(quizObject.orgId).set(quizObject, { merge: true });
    }

    return true;
  } catch (error) {
    console.log("Error saving quiz: " + error.message);
    return false;
  }
}

// Updates a quiz's live status ("waiting", "active", "ended")
async function updateQuizStatus(orgCode, newStatus) {
  try {
    const quiz = await fetchQuizByCode(orgCode);
    if (quiz === null) {
      return false;
    }

    quiz.status = newStatus;
    if (newStatus === "active" && !quiz.quizStartTimestamp) {
      quiz.quizStartTimestamp = Date.now();
    }

    await saveQuizToDatabase(quiz);
    return true;
  } catch (error) {
    console.log("Error updating status: " + error.message);
    return false;
  }
}

// Updates a quiz's postQuizVisibility setting
async function updateQuizVisibility(orgCode, newVisibility) {
  try {
    const quiz = await fetchQuizByCode(orgCode);
    if (quiz === null) {
      return false;
    }

    quiz.postQuizVisibility = newVisibility;
    await saveQuizToDatabase(quiz);
    return true;
  } catch (error) {
    console.log("Error updating visibility: " + error.message);
    return false;
  }
}


// ==========================================================================
// 5. ANALYSIS OF RESULTS (SCORES, AVERAGES, SUMMARIES)
// ==========================================================================

// Calculates performance statistics for an entire quiz session
function calculateQuizOverviewStats(quiz) {
  const submissions = quiz.submissions || [];
  const questions = quiz.questions || [];

  let totalAttempts = submissions.length;
  let submittedCount = 0;
  let inProgressCount = 0;
  let terminatedCount = 0;

  let totalScoreSum = 0;
  let highestScore = 0;
  let lowestScore = 999999;
  let scoredSubmissionsCount = 0;

  // Track per-question correct counts
  const questionCorrectCounts = {};
  for (let q = 0; q < questions.length; q = q + 1) {
    questionCorrectCounts[questions[q].id] = 0;
  }

  for (let s = 0; s < submissions.length; s = s + 1) {
    const sub = submissions[s];

    if (sub.status === "submitted") {
      submittedCount = submittedCount + 1;
    } else if (sub.status === "terminated_cheat") {
      terminatedCount = terminatedCount + 1;
    } else {
      inProgressCount = inProgressCount + 1;
    }

    if (sub.score !== null && sub.score !== undefined) {
      const currentScore = sub.score;
      totalScoreSum = totalScoreSum + currentScore;
      scoredSubmissionsCount = scoredSubmissionsCount + 1;

      if (currentScore > highestScore) {
        highestScore = currentScore;
      }
      if (currentScore < lowestScore) {
        lowestScore = currentScore;
      }
    }

    // Check student responses for per-question accuracy
    const responses = sub.responses || {};
    const answerKey = quiz.answerKey || {};

    for (let q = 0; q < questions.length; q = q + 1) {
      const qId = questions[q].id;
      const studentChoice = responses[qId];
      const correctChoice = answerKey[qId];

      if (studentChoice !== undefined && correctChoice !== undefined) {
        if (Number(studentChoice) === Number(correctChoice)) {
          questionCorrectCounts[qId] = (questionCorrectCounts[qId] || 0) + 1;
        }
      }
    }
  }

  let averageScore = 0;
  if (scoredSubmissionsCount > 0) {
    averageScore = (totalScoreSum / scoredSubmissionsCount).toFixed(1);
  } else {
    lowestScore = 0;
  }

  // Calculate per-question percentages
  const questionStatsList = [];
  for (let q = 0; q < questions.length; q = q + 1) {
    const qObj = questions[q];
    const correctCount = questionCorrectCounts[qObj.id] || 0;
    let percentage = 0;
    if (scoredSubmissionsCount > 0) {
      percentage = Math.round((correctCount / scoredSubmissionsCount) * 100);
    }

    questionStatsList.push({
      id: qObj.id,
      questionText: qObj.questionText,
      topic: qObj.topic || "General",
      correctCount: correctCount,
      percentageCorrect: percentage
    });
  }

  return {
    totalAttempts: totalAttempts,
    submittedCount: submittedCount,
    inProgressCount: inProgressCount,
    terminatedCount: terminatedCount,
    scoredCount: scoredSubmissionsCount,
    averageScore: averageScore,
    highestScore: highestScore,
    lowestScore: lowestScore === 999999 ? 0 : lowestScore,
    questionStats: questionStatsList
  };
}

// Calculates detailed drill-down data for a single student attempt
function calculateStudentDrilldownData(quiz, studentId) {
  const submissions = quiz.submissions || [];
  let studentSubmission = null;

  for (let s = 0; s < submissions.length; s = s + 1) {
    if (submissions[s].studentId === studentId) {
      studentSubmission = submissions[s];
      break;
    }
  }

  if (studentSubmission === null) {
    return null;
  }

  const questions = quiz.questions || [];
  const responses = studentSubmission.responses || {};
  const timeSpent = studentSubmission.timeSpentPerQuestion || {};
  const answerKey = quiz.answerKey || {};

  const drilldownQuestions = [];

  for (let i = 0; i < questions.length; i = i + 1) {
    const q = questions[i];
    const studentChoiceIndex = responses[q.id];
    const correctChoiceIndex = answerKey[q.id];

    let isCorrect = false;
    if (studentChoiceIndex !== undefined && correctChoiceIndex !== undefined) {
      if (Number(studentChoiceIndex) === Number(correctChoiceIndex)) {
        isCorrect = true;
      }
    }

    let studentChoiceText = "Not Answered";
    if (studentChoiceIndex !== undefined && q.options[studentChoiceIndex] !== undefined) {
      studentChoiceText = q.options[studentChoiceIndex];
    }

    let correctChoiceText = "Not Available";
    if (correctChoiceIndex !== undefined && q.options[correctChoiceIndex] !== undefined) {
      correctChoiceText = q.options[correctChoiceIndex];
    }

    drilldownQuestions.push({
      number: i + 1,
      id: q.id,
      questionText: q.questionText,
      topic: q.topic || "General",
      studentChoiceIndex: studentChoiceIndex,
      studentChoiceText: studentChoiceText,
      correctChoiceIndex: correctChoiceIndex,
      correctChoiceText: correctChoiceText,
      isCorrect: isCorrect,
      timeSpentSeconds: timeSpent[q.id] || 0
    });
  }

  return {
    studentId: studentId,
    submission: studentSubmission,
    questions: drilldownQuestions
  };
}

