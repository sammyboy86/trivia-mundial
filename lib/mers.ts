export interface UserState {
  // Map of KC id to theta and n
  [kcId: string]: {
    theta: number;
    n: number;
  };
}

export interface QuestionData {
  id: string;
  associated_kc_id: string;
  question_type: string;
  elo_beta: number;
  question_text?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_option?: string;
  hint?: string;
  answer_explanation?: string;
}

export function guessingParam(questionType: string): number {
  if (questionType === "true_false") return 0.5;
  return 0.25; // default to multiple_choice
}

export function expectedProbability(beta: number, theta: number, c: number): number {
  return c + (1 - c) * (1 / (1 + Math.pow(10, (beta - theta) / 4)));
}

export function kFactor(n: number): number {
  return 1.2 / (1 + 0.15 * n);
}

export function getNextQuestion(userState: UserState, availableQuestions: QuestionData[]) {
  if (availableQuestions.length === 0) return null;

  // 1. Find KC with minimum n
  let minN = Infinity;
  let targetKCs: string[] = [];

  // Initialize unknown KCs in userState as having n=0 implicitly
  // Find all KCs from available questions.
  const allKCs = Array.from(new Set(availableQuestions.map(q => q.associated_kc_id).filter(Boolean)));
  
  if (allKCs.length === 0) {
     // fallback if no KCs are defined
     const q = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
     return { question: q, expected: 0.5, targetKc: "none" };
  }

  for (const kc of allKCs) {
    const n = userState[kc]?.n || 0;
    if (n < minN) {
      minN = n;
      targetKCs = [kc];
    } else if (n === minN) {
      targetKCs.push(kc);
    }
  }

  // Random tiebreaker for KC
  const targetKc = targetKCs[Math.floor(Math.random() * targetKCs.length)];

  // 2. Filter available questions for this KC
  let kcQuestions = availableQuestions.filter(q => q.associated_kc_id === targetKc);
  
  // Fallback if somehow there are no available questions for this KC
  if (kcQuestions.length === 0) {
     kcQuestions = availableQuestions;
  }

  // 3. Find question closest to 70% expected success rate
  let bestQuestion: QuestionData | null = null;
  let minDiff = Infinity;
  let bestExpected = 0;

  const currentTheta = userState[targetKc]?.theta || 0;

  for (const q of kcQuestions) {
    const c = guessingParam(q.question_type);
    const expected = expectedProbability(q.elo_beta, currentTheta, c);
    const diff = Math.abs(expected - 0.70);
    
    if (diff < minDiff) {
      minDiff = diff;
      bestQuestion = q;
      bestExpected = expected;
    }
  }

  return {
    question: bestQuestion,
    expected: bestExpected,
    targetKc
  };
}

export function processAnswer(userState: UserState, question: QuestionData, isCorrect: boolean) {
  const kc = question.associated_kc_id;
  if (!kc) {
    return { newState: userState, log: null };
  }

  const currentState = userState[kc] || { theta: 0, n: 0 };
  const c = guessingParam(question.question_type);
  const expected = expectedProbability(question.elo_beta, currentState.theta, c);
  const k = kFactor(currentState.n);
  
  const X = isCorrect ? 1 : 0;
  const newTheta = currentState.theta + k * (X - expected);
  
  const newState = {
    ...userState,
    [kc]: {
      theta: newTheta,
      n: currentState.n + 1
    }
  };

  const log = {
    kc,
    oldTheta: currentState.theta,
    newTheta,
    expected,
    actual: X,
    k,
    delta: k * (X - expected)
  };

  return { newState, log };
}
