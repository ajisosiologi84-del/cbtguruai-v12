/**
 * Helper utility to cleanly format question text from uploads/edits.
 * Automatically detects numbered list items like (1), (2), (3), (4), (5), 1), 2)..., 1., 2...
 * and formats them onto clean new lines with bold indigo labels.
 */
export function formatQuestionText(text: string | null | undefined): string {
  if (!text) return '';

  let formatted = String(text).trim();

  // Standardize newlines
  formatted = formatted.replace(/\r\n/g, '\n');

  // If text doesn't contain block HTML elements, convert raw \n to <br/>
  if (!/<(?:p|br|div|li|tr|table)\b[^>]*>/i.test(formatted)) {
    formatted = formatted.replace(/\n/g, '<br/>');
  } else {
    // If it has HTML tags but also raw un-tagged newlines
    formatted = formatted.replace(/([^\n>])\n([^\n<])/g, '$1<br/>$2');
  }

  // Format parenthesized numbered items like (1), (2), (3), (4), (5) or (a), (b) or (i), (ii)
  formatted = formatted.replace(
    (/(?:<br\s*\/?>|\n|^|\s+)(\((?:[1-9]|1[0-9]|20|[a-eA-E]|[ivxIVX]{1,4})\))(?=\s+[^\s])/g),
    (match, p1, offset, string) => {
      const before = string.slice(Math.max(0, offset - 12), offset);
      const isAlreadyOnNewLine = /<br\s*\/?>|\n|^$/i.test(before.trim());
      if (isAlreadyOnNewLine) {
        return `<span class="inline-block font-bold text-indigo-700 font-mono mr-1">${p1}</span>`;
      }
      return `<br/><span class="inline-block font-bold text-indigo-700 font-mono mr-1 mt-1">${p1}</span>`;
    }
  );

  // Format unparenthesized list items like " 1) ", " 2) " or " 1. ", " 2. " when occurring inline
  formatted = formatted.replace(
    (/(?:<br\s*\/?>|\n|\.\s+|\s{2,})([1-9]\)|[1-9]\.)(?=\s+[A-Za-z0-9\("'])/g),
    (match, p1, offset, string) => {
      const before = string.slice(Math.max(0, offset - 12), offset);
      const isAlreadyOnNewLine = /<br\s*\/?>|\n|^$/i.test(before.trim());
      if (isAlreadyOnNewLine) {
        return `<span class="inline-block font-bold text-indigo-700 font-mono mr-1">${p1}</span>`;
      }
      return `<br/><span class="inline-block font-bold text-indigo-700 font-mono mr-1 mt-1">${p1}</span>`;
    }
  );

  // Format closing prompts e.g. "Berdasarkan...", "Pernyataan yang...", "Yang merupakan..."
  const closingPrompts = [
    'Berdasarkan', 'Pernyataan yang', 'Pernyataan di atas', 'Dari pernyataan',
    'Dari data', 'Dari tabel', 'Dari ilustrasi', 'Pasangan yang', 'Yang termasuk',
    'Yang merupakan', 'Manakah dari', 'Berikut ini yang'
  ];

  closingPrompts.forEach((prompt) => {
    const regex = new RegExp(`(?<=\\.|\\!|\\?|>|\\)|[a-zA-Z0-9])\\s+(${prompt}\\b)`, 'g');
    formatted = formatted.replace(regex, '<br/><br/><strong class="text-slate-900">$1</strong>');
  });

  // Limit repetitive <br/> to maximum 2
  formatted = formatted.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br/><br/>');

  return formatted;
}

import { Question } from '../types';

export interface QuestionEvalResult {
  earnedPoints: number;
  maxPoints: number;
  correctRatio: number; // 0.0 to 1.0
  isFullyCorrect: boolean;
  correctCountInQuestion: number;
  totalStatements: number;
}

export interface ResolvedStatement {
  id: string;
  statement: string;
  correctCategory: string;
}

/**
 * Normalizes category string to handle variations like 'Sesuai'/'Benar'/'Tepat'/'Ya' vs 'Tidak Sesuai'/'Salah'/'Tidak Tepat'/'Tidak'
 */
export function normalizeCategoryValue(val: string | null | undefined): string {
  if (!val) return '';
  const clean = String(val).trim().toLowerCase();
  if (['sesuai', 'tepat', 'benar', 'ya', 'fakta', 'true', 's', '1', 'b'].includes(clean)) return 'POS';
  if (['tidak sesuai', 'tidak tepat', 'salah', 'tidak', 'miskonsepsi', 'false', 'ts', '0'].includes(clean)) return 'NEG';
  return clean;
}

export function areCategoriesMatching(userChoice: string | null | undefined, correctCat: string | null | undefined): boolean {
  if (!userChoice || !correctCat) return false;
  const u = String(userChoice).trim().toLowerCase();
  const c = String(correctCat).trim().toLowerCase();
  if (u === c) return true;
  const normU = normalizeCategoryValue(u);
  const normC = normalizeCategoryValue(c);
  return normU !== '' && normU === normC;
}

/**
 * Safely resolves category statements for a question, even if categoryStatements
 * is missing/empty on snapshot by falling back to options or categoryOptions.
 */
export function resolveCategoryStatements(q: Question): ResolvedStatement[] {
  if (!q) return [];

  // 1. Direct categoryStatements array
  if (q.categoryStatements && Array.isArray(q.categoryStatements) && q.categoryStatements.length > 0) {
    return q.categoryStatements.map((st, idx) => {
      const stId = st.id || String(idx + 1);
      const statementText = st.statement || (st as any).text || (st as any).pernyataan || `Pernyataan ${idx + 1}`;
      const correctCat = st.correctCategory || (st as any).category || (st as any).correct || (st as any).kunci || (st as any).correctAnswer || (st as any).answer || 'Sesuai';
      return {
        id: String(stId),
        statement: String(statementText),
        correctCategory: String(correctCat),
      };
    });
  }

  // 2. Fallback to options if categoryStatements is missing but options exist
  if (q.options && Array.isArray(q.options) && q.options.length > 0) {
    const validOpts = q.options.filter((o) => o.text && o.text.trim() !== '' && o.text.trim() !== '-');
    if (validOpts.length > 0) {
      const primaryCat = q.categoryOptions?.[0] || 'Sesuai';
      const secondaryCat = q.categoryOptions?.[1] || 'Tidak Sesuai';

      return validOpts.map((o, idx) => {
        const correctCat = (o as any).correctCategory || (o.isCorrect ? primaryCat : secondaryCat);
        return {
          id: String(idx + 1),
          statement: String(o.text),
          correctCategory: String(correctCat),
        };
      });
    }
  }

  return [];
}

/**
 * Calculates earned points and detailed correctness for any question type:
 * - Pilihan Ganda (Single Choice)
 * - Pilihan Ganda Kompleks MCMA (Multiple Choice Multiple Answer)
 * - Pilihan Ganda Kompleks Kategori (Benar/Salah or Ya/Tidak with partial credit per statement)
 */
export function getQuestionScoreAndCorrectness(q: Question, userAns: string | null): QuestionEvalResult {
  const qPoin = typeof q.poin === 'number' && q.poin > 0 ? q.poin : 10;
  const bentuk = (q.bentukSoal || 'Pilihan Ganda').toLowerCase();

  const isKategori =
    bentuk.includes('kategori') ||
    bentuk.includes('benar') ||
    (q.categoryStatements && q.categoryStatements.length > 0);

  // 1. Pilihan Ganda Kompleks Kategori (Benar/Salah / Ya/Tidak)
  if (isKategori) {
    const statements = resolveCategoryStatements(q);

    let userMap: Record<string, string> = {};
    if (userAns && typeof userAns === 'string' && userAns.trim()) {
      const trimmedAns = userAns.trim();
      try {
        userMap = JSON.parse(trimmedAns);
      } catch {
        trimmedAns.split('|').forEach((part) => {
          const [id, val] = part.split(':');
          if (id && val) userMap[id.trim()] = val.trim();
        });
      }
    }

    const userKeys = Object.keys(userMap);

    if (statements.length === 0) {
      if (userKeys.length === 0) {
        return {
          earnedPoints: 0,
          maxPoints: qPoin,
          correctRatio: 0,
          isFullyCorrect: false,
          correctCountInQuestion: 0,
          totalStatements: 0,
        };
      }
      // If question object lacks statements but student answered JSON map, treat active user keys
      let correctCountInQuestion = 0;
      userKeys.forEach((key) => {
        if (userMap[key]) correctCountInQuestion++;
      });
      const totalStatements = userKeys.length;
      const correctRatio = totalStatements > 0 ? correctCountInQuestion / totalStatements : 0;
      return {
        earnedPoints: qPoin * correctRatio,
        maxPoints: qPoin,
        correctRatio,
        isFullyCorrect: correctCountInQuestion === totalStatements,
        correctCountInQuestion,
        totalStatements,
      };
    }

    const totalStatements = statements.length;
    let correctCountInQuestion = 0;

    statements.forEach((st, idx) => {
      const choice = userMap[st.id] || userMap[String(idx + 1)] || userMap[st.statement];
      if (choice && areCategoriesMatching(choice, st.correctCategory)) {
        correctCountInQuestion++;
      }
    });

    const correctRatio = totalStatements > 0 ? correctCountInQuestion / totalStatements : 0;
    const earnedPoints = qPoin * correctRatio;
    const isFullyCorrect = totalStatements > 0 && correctCountInQuestion === totalStatements;

    return {
      earnedPoints,
      maxPoints: qPoin,
      correctRatio,
      isFullyCorrect,
      correctCountInQuestion,
      totalStatements,
    };
  }

  // 2. Pilihan Ganda Kompleks MCMA (Multiple Choice Multiple Answer)
  if (bentuk.includes('mcma') || (bentuk.includes('kompleks') && !bentuk.includes('kategori'))) {
    const correctOptions = (q.options || [])
      .filter((o) => o.isCorrect)
      .map((o) => o.id.trim().toUpperCase())
      .sort();

    if (correctOptions.length === 0) {
      return {
        earnedPoints: 0,
        maxPoints: qPoin,
        correctRatio: 0,
        isFullyCorrect: false,
        correctCountInQuestion: 0,
        totalStatements: 0,
      };
    }

    let userSelected: string[] = [];
    if (userAns && typeof userAns === 'string' && userAns.trim()) {
      userSelected = userAns
        .trim()
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .sort();
    }

    const isMatch =
      userSelected.length === correctOptions.length &&
      userSelected.every((val, idx) => val === correctOptions[idx]);

    return {
      earnedPoints: isMatch ? qPoin : 0,
      maxPoints: qPoin,
      correctRatio: isMatch ? 1 : 0,
      isFullyCorrect: isMatch,
      correctCountInQuestion: isMatch ? 1 : 0,
      totalStatements: 1,
    };
  }

  // 3. Standard Pilihan Ganda (Single Choice)
  const isCorrect = isQuestionAnswerCorrect(q, userAns);
  return {
    earnedPoints: isCorrect ? qPoin : 0,
    maxPoints: qPoin,
    correctRatio: isCorrect ? 1 : 0,
    isFullyCorrect: isCorrect,
    correctCountInQuestion: isCorrect ? 1 : 0,
    totalStatements: 1,
  };
}

/**
 * Evaluates whether a student's answer is correct for any question type:
 * - Pilihan Ganda (Single Choice)
 * - Pilihan Ganda Kompleks MCMA (Multiple Choice Multiple Answer)
 * - Pilihan Ganda Kompleks Kategori (Benar/Salah or Ya/Tidak)
 */
export function isQuestionAnswerCorrect(q: Question, userAns: string | null): boolean {
  if (!userAns || typeof userAns !== 'string') return false;
  const trimmedAns = userAns.trim();
  if (!trimmedAns) return false;

  const bentuk = (q.bentukSoal || 'Pilihan Ganda').toLowerCase();

  // 1. Pilihan Ganda Kompleks Kategori (Benar/Salah / Ya/Tidak)
  if (bentuk.includes('kategori') || bentuk.includes('benar') || (q.categoryStatements && q.categoryStatements.length > 0)) {
    const statements = resolveCategoryStatements(q);
    if (statements.length === 0) return false;

    let userMap: Record<string, string> = {};
    try {
      userMap = JSON.parse(trimmedAns);
    } catch {
      trimmedAns.split('|').forEach((part) => {
        const [id, val] = part.split(':');
        if (id && val) userMap[id.trim()] = val.trim();
      });
    }

    return statements.every((st, idx) => {
      const choice = userMap[st.id] || userMap[String(idx + 1)] || userMap[st.statement];
      return choice && areCategoriesMatching(choice, st.correctCategory);
    });
  }

  // 2. Pilihan Ganda Kompleks MCMA (Multiple Choice Multiple Answer)
  if (bentuk.includes('mcma') || (bentuk.includes('kompleks') && !bentuk.includes('kategori'))) {
    const correctOptions = (q.options || [])
      .filter((o) => o.isCorrect)
      .map((o) => o.id.trim().toUpperCase())
      .sort();

    if (correctOptions.length === 0) return false;

    const userSelected = trimmedAns
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .sort();

    if (userSelected.length !== correctOptions.length) return false;

    return userSelected.every((val, idx) => val === correctOptions[idx]);
  }

  // 3. Standard Pilihan Ganda (Single Choice)
  const foundOpt = (q.options || []).find((o) => o.id.trim().toUpperCase() === trimmedAns.toUpperCase());
  return !!(foundOpt && foundOpt.isCorrect);
}

/**
 * Returns a human-readable display of the correct answer(s) for a question.
 */
export function getCorrectAnswerDisplay(q: Question): string {
  const bentuk = (q.bentukSoal || 'Pilihan Ganda').toLowerCase();

  if (bentuk.includes('kategori') || (q.categoryStatements && q.categoryStatements.length > 0)) {
    const statements = resolveCategoryStatements(q);
    if (statements.length === 0) return '-';
    return statements
      .map((st, idx) => `${idx + 1}. ${st.correctCategory}`)
      .join(' | ');
  }

  const correctOpts = (q.options || []).filter((o) => o.isCorrect);
  if (correctOpts.length === 0) return '-';

  if (bentuk.includes('mcma') || correctOpts.length > 1) {
    return correctOpts.map((o) => o.id).join(', ');
  }

  return correctOpts[0].id;
}

/**
 * Returns a human-readable display of a student's answer.
 */
export function getStudentAnswerDisplay(q: Question, userAns: string | null): string {
  if (!userAns) return 'Belum Dijawab';
  const trimmedAns = userAns.trim();
  const bentuk = (q.bentukSoal || 'Pilihan Ganda').toLowerCase();

  if (bentuk.includes('kategori') || (q.categoryStatements && q.categoryStatements.length > 0)) {
    let userMap: Record<string, string> = {};
    try {
      userMap = JSON.parse(trimmedAns);
    } catch {
      trimmedAns.split('|').forEach((part) => {
        const [id, val] = part.split(':');
        if (id && val) userMap[id.trim()] = val.trim();
      });
    }

    const statements = resolveCategoryStatements(q);
    if (statements.length === 0) {
      // Fallback: format user JSON map neatly if no statements found on q
      const entries = Object.entries(userMap);
      if (entries.length === 0) return trimmedAns;
      return entries.map(([k, v]) => `${k}. ${v}`).join(' | ');
    }

    return statements
      .map((st, idx) => {
        const choice = userMap[st.id] || userMap[String(idx + 1)] || userMap[st.statement] || '-';
        return `${idx + 1}. ${choice}`;
      })
      .join(' | ');
  }

  if (bentuk.includes('mcma')) {
    return trimmedAns
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .join(', ');
  }

  return trimmedAns.toUpperCase();
}
