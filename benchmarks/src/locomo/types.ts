export interface LoCoMoTurn {
  speaker: string;
  dia_id: string;
  text: string;
}

export interface LoCoMoSession {
  date_time: string;
  speaker_a: string;
  speaker_b: string;
  turns: LoCoMoTurn[];
}

export interface LoCoMoQuestion {
  question: string;
  answer: string;
  category:
    | 'single-hop'
    | 'multi-hop'
    | 'temporal'
    | 'open-domain'
    | 'adversarial';
  evidence: string[];
}

export interface LoCoMoConversation {
  conversation_id: string;
  sessions: LoCoMoSession[];
  questions: LoCoMoQuestion[];
}

const VALID_CATEGORIES = new Set([
  'single-hop',
  'multi-hop',
  'temporal',
  'open-domain',
  'adversarial',
]);

/**
 * Parse the raw LoCoMo locomo10.json dataset into typed conversations.
 *
 * The dataset is an array of objects, each with:
 * - conversation: object with session keys (session_1, session_2, …)
 *   - each session has session_N_date_time, speaker keys, and numbered turn keys
 * - qa: array of { question, answer, category, evidence }
 */
export function parseLoCoMoDataset(raw: unknown): LoCoMoConversation[] {
  if (!Array.isArray(raw)) {
    throw new Error('LoCoMo dataset must be an array');
  }
  if (raw.length === 0) {
    throw new Error('LoCoMo dataset must not be empty');
  }

  return raw.map((entry: unknown, idx: number) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Entry ${idx} is not an object`);
    }

    const obj = entry as Record<string, unknown>;
    const conversation = obj.conversation;
    const qa = obj.qa;

    if (!conversation || typeof conversation !== 'object') {
      throw new Error(`Entry ${idx}: missing or invalid 'conversation' field`);
    }
    if (!Array.isArray(qa)) {
      throw new Error(`Entry ${idx}: missing or invalid 'qa' field`);
    }

    const convObj = conversation as Record<string, unknown>;
    const sessions = parseConversationSessions(convObj, idx);
    const questions = parseQuestions(qa, idx);

    return {
      conversation_id: `conversation_${idx}`,
      sessions,
      questions,
    };
  });
}

function parseConversationSessions(
  convObj: Record<string, unknown>,
  entryIdx: number,
): LoCoMoSession[] {
  const sessions: LoCoMoSession[] = [];
  const sessionKeys = Object.keys(convObj)
    .filter((k) => /^session_\d+$/.test(k))
    .sort((a, b) => {
      const numA = Number.parseInt(a.split('_')[1], 10);
      const numB = Number.parseInt(b.split('_')[1], 10);
      return numA - numB;
    });

  for (const key of sessionKeys) {
    const sessionData = convObj[key];
    if (!sessionData || typeof sessionData !== 'object') continue;

    const sObj = sessionData as Record<string, unknown>;
    const sessionNum = key.split('_')[1];
    const dateTime = sObj[`session_${sessionNum}_date_time`];

    // Find speaker names from the turn data
    let speakerA = '';
    let speakerB = '';
    const turns: LoCoMoTurn[] = [];

    // Turns are numbered keys (1, 2, 3, …) within the session
    const turnKeys = Object.keys(sObj)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

    for (const turnKey of turnKeys) {
      const turnData = sObj[turnKey];
      if (!turnData || typeof turnData !== 'object') continue;

      const turn = turnData as Record<string, unknown>;
      const speaker =
        typeof turn.speaker === 'string' ? turn.speaker : 'unknown';
      const diaId =
        typeof turn.dia_id === 'string'
          ? turn.dia_id
          : `${key}_turn_${turnKey}`;
      const text = typeof turn.text === 'string' ? turn.text : '';

      if (!speakerA) speakerA = speaker;
      else if (speaker !== speakerA && !speakerB) speakerB = speaker;

      turns.push({ speaker, dia_id: diaId, text });
    }

    sessions.push({
      date_time: typeof dateTime === 'string' ? dateTime : '',
      speaker_a: speakerA,
      speaker_b: speakerB,
      turns,
    });
  }

  if (sessions.length === 0) {
    throw new Error(`Entry ${entryIdx}: no sessions found in conversation`);
  }

  return sessions;
}

function parseQuestions(qa: unknown[], entryIdx: number): LoCoMoQuestion[] {
  return qa.map((q: unknown, qIdx: number) => {
    if (!q || typeof q !== 'object') {
      throw new Error(`Entry ${entryIdx}, question ${qIdx}: not an object`);
    }

    const qObj = q as Record<string, unknown>;
    const question = qObj.question;
    const answer = qObj.answer;
    const category = qObj.category;
    const evidence = qObj.evidence;

    if (typeof question !== 'string' || !question) {
      throw new Error(
        `Entry ${entryIdx}, question ${qIdx}: missing 'question'`,
      );
    }
    if (typeof answer !== 'string') {
      throw new Error(`Entry ${entryIdx}, question ${qIdx}: missing 'answer'`);
    }

    const normalizedCategory =
      typeof category === 'string' ? category.toLowerCase() : '';
    if (!VALID_CATEGORIES.has(normalizedCategory)) {
      throw new Error(
        `Entry ${entryIdx}, question ${qIdx}: invalid category '${String(category)}'`,
      );
    }

    const evidenceArr = Array.isArray(evidence)
      ? evidence.filter((e): e is string => typeof e === 'string')
      : [];

    return {
      question,
      answer,
      category: normalizedCategory as LoCoMoQuestion['category'],
      evidence: evidenceArr,
    };
  });
}
