// ==========================================================================
// QuizPulse — app.js
// Backend logic for the quiz itself:
// - loading and showing questions
// - timer management (Timer 2: attempt duration)
// - checking answers and calculating scores
// - saving quiz drafts and final submissions to the database
//
// VARIABLES USED FROM firebase.js:
// - db   : The Cloud Firestore database instance (or null in local mode)
// - auth : The Firebase Authentication instance (or null in local mode)
// ==========================================================================


// ==========================================================================
// 1. QUIZ RUNTIME STATE
// ==========================================================================

var currentActiveQuiz = null;
var currentActiveStudentId = null;
var currentActiveOrgCode = null;

var studentAnswersMap = {};
var studentQuestionTimeMap = {};
var activeQuestionIndex = 0;

var quizCountdownIntervalId = null;
var quizStartEpochMs = null;
var totalAttemptDurationSeconds = 0;

var studentCheatViolations = 0;
var isCurrentQuizSubmitted = false;


// ==========================================================================
// 2. FORMATTING HELPERS
// ==========================================================================

// Formats seconds into MM:SS display string
function formatTimerDisplay(totalSeconds) {
  if (totalSeconds < 0) {
    totalSeconds = 0;
  }

  const roundedSeconds = Math.floor(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  let minutesString = String(minutes);
  if (minutes < 10) {
    minutesString = "0" + String(minutes);
  }

  let secondsString = String(seconds);
  if (seconds < 10) {
    secondsString = "0" + String(seconds);
  }

  return minutesString + ":" + secondsString;
}


// ==========================================================================
// 3. QUESTION RENDERING AND SELECTION
// ==========================================================================

// Renders the list of quiz questions into the container
function renderQuizQuestions(questionsList, containerElement, counterElement) {
  if (containerElement === null) {
    return;
  }

  containerElement.innerHTML = "";

  for (let i = 0; i < questionsList.length; i = i + 1) {
    const question = questionsList[i];
    const questionNumber = i + 1;

    // Create question card
    const cardElement = document.createElement("div");
    cardElement.className = "question-card";
    cardElement.setAttribute("data-question-id", question.id);

    // Card header
    const headerElement = document.createElement("div");
    headerElement.className = "question-header";

    const badgeElement = document.createElement("span");
    badgeElement.className = "question-badge";
    let formattedNumber = String(questionNumber);
    if (questionNumber < 10) {
      formattedNumber = "0" + String(questionNumber);
    }
    badgeElement.textContent = "Q" + formattedNumber;
    headerElement.appendChild(badgeElement);

    const topicElement = document.createElement("span");
    topicElement.className = "question-topic";
    topicElement.textContent = question.topic || "General";
    headerElement.appendChild(topicElement);

    cardElement.appendChild(headerElement);

    // Question prompt text
    const textElement = document.createElement("p");
    textElement.className = "question-text";
    textElement.textContent = question.questionText;
    cardElement.appendChild(textElement);

    // Options list
    const optionsContainer = document.createElement("div");
    optionsContainer.className = "options-list";

    for (let optIndex = 0; optIndex < question.options.length; optIndex = optIndex + 1) {
      const optionLabel = document.createElement("label");
      optionLabel.className = "option-label";

      const radioInput = document.createElement("input");
      radioInput.type = "radio";
      radioInput.name = "question_" + question.id;
      radioInput.value = String(optIndex);

      // Check if student previously selected this option
      if (studentAnswersMap[question.id] === optIndex) {
        radioInput.checked = true;
        optionLabel.classList.add("option-selected");
      }

      // Handle option click
      radioInput.addEventListener("change", function() {
        const allOptionLabels = optionsContainer.querySelectorAll(".option-label");
        for (let l = 0; l < allOptionLabels.length; l = l + 1) {
          allOptionLabels[l].classList.remove("option-selected");
        }

        optionLabel.classList.add("option-selected");
        studentAnswersMap[question.id] = Number(radioInput.value);
        activeQuestionIndex = i;

        updateAnsweredCounter(questionsList.length, counterElement);

        // Auto-save draft answer to database & sessionStorage
        saveStudentDraft(currentActiveOrgCode, currentActiveStudentId, studentAnswersMap, studentQuestionTimeMap);
      });

      const optionLetter = String.fromCharCode(65 + optIndex);
      const optionTextSpan = document.createElement("span");
      optionTextSpan.textContent = optionLetter + ". " + question.options[optIndex];

      optionLabel.appendChild(radioInput);
      optionLabel.appendChild(optionTextSpan);
      optionsContainer.appendChild(optionLabel);
    }

    cardElement.appendChild(optionsContainer);
    containerElement.appendChild(cardElement);
  }

  updateAnsweredCounter(questionsList.length, counterElement);
}

// Updates the "X of Y Answered" indicator badge
function updateAnsweredCounter(totalQuestions, counterElement) {
  if (counterElement === null) {
    return;
  }

  let answeredCount = 0;
  for (const questionKey in studentAnswersMap) {
    if (studentAnswersMap[questionKey] !== undefined) {
      answeredCount = answeredCount + 1;
    }
  }

  counterElement.textContent = answeredCount + " of " + totalQuestions + " Answered";
}


// ==========================================================================
// 4. THE TIMER (TIMER 2: ATTEMPT DURATION COUNTDOWN)
// ==========================================================================

// Starts the countdown timer for the student's attempt
function startQuizAttemptTimer(durationSeconds, timerDisplayElement, onTimerExpiredCallback, onOrganizerEndedCallback) {
  if (quizCountdownIntervalId !== null) {
    clearInterval(quizCountdownIntervalId);
  }

  totalAttemptDurationSeconds = durationSeconds;
  quizStartEpochMs = Date.now();

  quizCountdownIntervalId = setInterval(async function() {
    if (isCurrentQuizSubmitted === true) {
      clearInterval(quizCountdownIntervalId);
      return;
    }

    const elapsedSeconds = (Date.now() - quizStartEpochMs) / 1000;
    const remainingSeconds = totalAttemptDurationSeconds - elapsedSeconds;

    if (timerDisplayElement !== null) {
      timerDisplayElement.textContent = formatTimerDisplay(remainingSeconds);

      if (remainingSeconds <= 60) {
        timerDisplayElement.classList.add("timer-urgent");
      } else {
        timerDisplayElement.classList.remove("timer-urgent");
      }
    }

    // Track time spent on the active question
    if (currentActiveQuiz && currentActiveQuiz.questions && currentActiveQuiz.questions[activeQuestionIndex]) {
      const activeQId = currentActiveQuiz.questions[activeQuestionIndex].id;
      studentQuestionTimeMap[activeQId] = (studentQuestionTimeMap[activeQId] || 0) + 1;
    }

    // Check if the organizer ended the quiz in the dashboard (every 3 seconds)
    if (Math.floor(elapsedSeconds) % 3 === 0) {
      const liveQuizData = await fetchQuizByCode(currentActiveOrgCode);
      if (liveQuizData !== null && liveQuizData.status === "ended" && isCurrentQuizSubmitted === false) {
        clearInterval(quizCountdownIntervalId);
        if (onOrganizerEndedCallback !== undefined && typeof onOrganizerEndedCallback === "function") {
          onOrganizerEndedCallback();
        }
        return;
      }
    }

    // Time expired
    if (remainingSeconds <= 0) {
      clearInterval(quizCountdownIntervalId);
      if (onTimerExpiredCallback !== undefined && typeof onTimerExpiredCallback === "function") {
        onTimerExpiredCallback();
      }
    }
  }, 1000);
}


// ==========================================================================
// 5. ANTI-CHEAT SYSTEM
// ==========================================================================

// Arms anti-cheat monitoring listeners (terminates on single violation)
function armQuizAntiCheat(onViolationTerminateCallback) {
  function handleViolationEvent(violationType) {
    if (isCurrentQuizSubmitted === true) {
      return;
    }

    studentCheatViolations = studentCheatViolations + 1;

    // Save violation in database
    recordStudentViolation(currentActiveOrgCode, currentActiveStudentId);

    showToast("Integrity violation detected! Assessment terminated immediately.", true);
    if (onViolationTerminateCallback !== undefined && typeof onViolationTerminateCallback === "function") {
      onViolationTerminateCallback(violationType);
    }
  }

  // 1. Tab switches (visibility change)
  document.addEventListener("visibilitychange", function() {
    if (document.hidden === true) {
      handleViolationEvent("tab_switch");
    }
  });

  // 2. Window focus loss (blur)
  window.addEventListener("blur", function() {
    handleViolationEvent("window_blur");
  });

  // 3. Exit fullscreen
  document.addEventListener("fullscreenchange", function() {
    if (!document.fullscreenElement) {
      handleViolationEvent("fullscreen_exit");
    }
  });

  // 4. Right-click context menu
  document.addEventListener("contextmenu", function(event) {
    event.preventDefault();
    handleViolationEvent("context_menu");
  });

  // 5. Copy / Paste prevention
  document.addEventListener("copy", function(event) {
    event.preventDefault();
    handleViolationEvent("copy_attempt");
  });

  document.addEventListener("paste", function(event) {
    event.preventDefault();
    handleViolationEvent("paste_attempt");
  });
}


// ==========================================================================
// 6. CHECKING ANSWERS & CALCULATING SCORES
// ==========================================================================

// Compares student responses with the quiz answer key and returns score
function calculateStudentScore(questionsList, responsesMap, answerKeyMap) {
  let correctTotal = 0;

  for (let i = 0; i < questionsList.length; i = i + 1) {
    const questionId = questionsList[i].id;
    const studentChoice = responsesMap[questionId];
    const correctChoice = answerKeyMap[questionId];

    if (studentChoice !== undefined && correctChoice !== undefined) {
      if (Number(studentChoice) === Number(correctChoice)) {
        correctTotal = correctTotal + 1;
      }
    }
  }

  return correctTotal;
}


// ==========================================================================
// 7. DATABASE OPERATIONS (DRAFTS, VIOLATIONS, FINAL SUBMISSION, PURGE)
// ==========================================================================

// Saves current student answers as an in-progress draft
async function saveStudentDraft(orgCode, studentId, responsesMap, timeSpentMap) {
  try {
    // Cache draft in sessionStorage for refresh recovery
    sessionStorage.setItem("draft_responses_" + orgCode, JSON.stringify(responsesMap));
    sessionStorage.setItem("draft_time_" + orgCode, JSON.stringify(timeSpentMap));

    // Update in database
    const quiz = await fetchQuizByCode(orgCode);
    if (quiz === null) {
      return false;
    }

    const submissions = quiz.submissions || [];
    for (let s = 0; s < submissions.length; s = s + 1) {
      if (submissions[s].studentId === studentId) {
        submissions[s].responses = responsesMap;
        submissions[s].timeSpentPerQuestion = timeSpentMap;
        await saveQuizToDatabase(quiz);
        return true;
      }
    }

    return false;
  } catch (error) {
    // Silent draft error (non-fatal)
    return false;
  }
}

// Records an anti-cheat violation in the database
async function recordStudentViolation(orgCode, studentId) {
  try {
    const quiz = await fetchQuizByCode(orgCode);
    if (quiz === null) {
      return 0;
    }

    const submissions = quiz.submissions || [];
    for (let s = 0; s < submissions.length; s = s + 1) {
      if (submissions[s].studentId === studentId) {
        submissions[s].tabViolations = (submissions[s].tabViolations || 0) + 1;
        await saveQuizToDatabase(quiz);
        return submissions[s].tabViolations;
      }
    }

    return 0;
  } catch (error) {
    return 0;
  }
}

// Seals the quiz, calculates score, and writes final submission
async function saveFinalQuizSubmission(orgCode, studentId, responsesMap, timeSpentMap, isAutoSubmitted, terminationReason) {
  try {
    isCurrentQuizSubmitted = true;
    if (quizCountdownIntervalId !== null) {
      clearInterval(quizCountdownIntervalId);
    }

    const quiz = await fetchQuizByCode(orgCode);
    if (quiz === null) {
      return null;
    }

    const submissions = quiz.submissions || [];
    let targetSubmission = null;

    for (let s = 0; s < submissions.length; s = s + 1) {
      if (submissions[s].studentId === studentId) {
        targetSubmission = submissions[s];
        break;
      }
    }

    if (targetSubmission === null) {
      return null;
    }

    // Set submission status
    if (terminationReason && terminationReason !== "timer_expired" && terminationReason !== "manual") {
      targetSubmission.status = "terminated_cheat";
    } else {
      targetSubmission.status = "submitted";
    }

    targetSubmission.autoSubmitted = isAutoSubmitted;
    targetSubmission.submittedAt = new Date().toISOString();
    targetSubmission.terminationReason = terminationReason || null;
    targetSubmission.responses = responsesMap;
    targetSubmission.timeSpentPerQuestion = timeSpentMap;

    // Grade submission against answer key
    const finalScore = calculateStudentScore(quiz.questions, responsesMap, quiz.answerKey || {});
    targetSubmission.score = finalScore;

    // Write to database
    await saveQuizToDatabase(quiz);

    return {
      quiz: quiz,
      submission: targetSubmission
    };
  } catch (error) {
    showToast("Error saving final submission: " + error.message, true);
    return null;
  }
}

// Permanently purges student session on exit to prevent re-taking
async function purgeStudentSession(orgCode, studentId) {
  try {
    const quiz = await fetchQuizByCode(orgCode);
    if (quiz !== null) {
      const submissions = quiz.submissions || [];
      for (let s = 0; s < submissions.length; s = s + 1) {
        if (submissions[s].studentId === studentId) {
          submissions[s].sessionPurged = true;
          await saveQuizToDatabase(quiz);
          break;
        }
      }
    }

    sessionStorage.clear();
    showToast("Session purged. Assessment completed.", false);
    return true;
  } catch (error) {
    sessionStorage.clear();
    return true;
  }
}


// ==========================================================================
// 8. RENDERING RESULTS VIEW BASED ON POST-QUIZ VISIBILITY
// ==========================================================================

// Renders the results view strictly according to postQuizVisibility
function renderStudentResultsView(quiz, submission, containerElement) {
  if (containerElement === null) {
    return;
  }

  containerElement.innerHTML = "";

  const visibility = quiz.postQuizVisibility || "marks_only";
  const totalQuestions = quiz.questions.length;
  let studentScore = 0;
  if (submission.score !== null && submission.score !== undefined) {
    studentScore = submission.score;
  }
  const percentageScore = Math.round((studentScore / totalQuestions) * 100);

  // Card 1: Score Banner (Always shown for marks_only, marks_and_answers, and full_analysis)
  const scoreCard = document.createElement("div");
  scoreCard.className = "result-card";

  const scoreHeader = document.createElement("h3");
  scoreHeader.className = "result-card-title";
  scoreHeader.textContent = "Your Official Score";
  scoreCard.appendChild(scoreHeader);

  const scoreValue = document.createElement("div");
  scoreValue.className = "result-score-large";
  scoreValue.textContent = studentScore + " / " + totalQuestions + " (" + percentageScore + "%)";
  scoreCard.appendChild(scoreValue);

  const statusNote = document.createElement("p");
  statusNote.className = "hint-text";
  statusNote.textContent = "Status: " + submission.status + " · Submitted at: " + formatDateSimple(submission.submittedAt);
  scoreCard.appendChild(statusNote);

  containerElement.appendChild(scoreCard);

  // If marks_only: STOP HERE! Nothing else inserted into DOM
  if (visibility === "marks_only") {
    const privacyNotice = document.createElement("div");
    privacyNotice.className = "callout-box";
    privacyNotice.textContent = "Notice: The organizer has configured this quiz to display marks only. Answer review is not permitted.";
    containerElement.appendChild(privacyNotice);
    return;
  }

  // Card 2: Question & Answer Breakdown (For marks_and_answers and full_analysis)
  const breakdownCard = document.createElement("div");
  breakdownCard.className = "result-card";

  const breakdownHeader = document.createElement("h3");
  breakdownHeader.className = "result-card-title";
  breakdownHeader.textContent = "Question & Answer Breakdown";
  breakdownCard.appendChild(breakdownHeader);

  const answerKey = quiz.answerKey || {};
  const responses = submission.responses || {};

  for (let i = 0; i < quiz.questions.length; i = i + 1) {
    const q = quiz.questions[i];
    const studentChoice = responses[q.id];
    const correctChoice = answerKey[q.id];

    let isCorrect = false;
    if (studentChoice !== undefined && correctChoice !== undefined) {
      if (Number(studentChoice) === Number(correctChoice)) {
        isCorrect = true;
      }
    }

    const qRow = document.createElement("div");
    qRow.className = "result-question-row";

    const qNum = document.createElement("div");
    qNum.className = "result-q-badge";
    qNum.textContent = "Q" + (i + 1);
    qRow.appendChild(qNum);

    const qDetails = document.createElement("div");
    qDetails.className = "result-q-details";

    const qText = document.createElement("p");
    qText.className = "result-q-text";
    qText.textContent = q.questionText;
    qDetails.appendChild(qText);

    let studentChoiceText = "Not answered";
    if (studentChoice !== undefined && q.options[studentChoice] !== undefined) {
      studentChoiceText = String.fromCharCode(65 + studentChoice) + ". " + q.options[studentChoice];
    }

    let correctChoiceText = "Not available";
    if (correctChoice !== undefined && q.options[correctChoice] !== undefined) {
      correctChoiceText = String.fromCharCode(65 + correctChoice) + ". " + q.options[correctChoice];
    }

    const answerComparison = document.createElement("p");
    answerComparison.className = "result-q-answers";

    if (isCorrect === true) {
      answerComparison.innerHTML = "<span class='text-ok'>✓ Correct: " + studentChoiceText + "</span>";
    } else {
      answerComparison.innerHTML = "<span class='text-danger'>✗ Marked: " + studentChoiceText + "</span> · <span class='text-ok'>Correct: " + correctChoiceText + "</span>";
    }

    qDetails.appendChild(answerComparison);
    qRow.appendChild(qDetails);
    breakdownCard.appendChild(qRow);
  }

  containerElement.appendChild(breakdownCard);

  // If full_analysis: Add topic accuracy and time analysis
  if (visibility === "full_analysis") {
    const analysisCard = document.createElement("div");
    analysisCard.className = "result-card";

    const analysisHeader = document.createElement("h3");
    analysisHeader.className = "result-card-title";
    analysisHeader.textContent = "Topic Mastery & Time Breakdown";
    analysisCard.appendChild(analysisHeader);

    // Topic accuracy calculation
    const topicTotals = {};
    const topicCorrect = {};

    for (let i = 0; i < quiz.questions.length; i = i + 1) {
      const q = quiz.questions[i];
      const topicName = q.topic || "General";
      topicTotals[topicName] = (topicTotals[topicName] || 0) + 1;

      const studentChoice = responses[q.id];
      const correctChoice = answerKey[q.id];
      if (studentChoice !== undefined && correctChoice !== undefined && Number(studentChoice) === Number(correctChoice)) {
        topicCorrect[topicName] = (topicCorrect[topicName] || 0) + 1;
      }
    }

    for (const tName in topicTotals) {
      const totalInTopic = topicTotals[tName];
      const correctInTopic = topicCorrect[tName] || 0;
      const topicPercent = Math.round((correctInTopic / totalInTopic) * 100);

      const topicRow = document.createElement("div");
      topicRow.className = "stat-row";
      topicRow.innerHTML = "<span>" + tName + " (" + correctInTopic + "/" + totalInTopic + ")</span><strong>" + topicPercent + "%</strong>";
      analysisCard.appendChild(topicRow);
    }

    containerElement.appendChild(analysisCard);
  }
}

