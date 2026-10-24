/**
 * Keyword screen run on every chat message before the AI sees it. It is
 * deliberately broad: a false positive only shows hotline numbers, while a
 * miss could leave someone in danger without them.
 */
const HIGH_RISK_PATTERNS: RegExp[] = [
  // English
  /\bsuicid(e|al)\b/i,
  /\bkill(ing)?\s+my\s*self\b/i,
  /\bend(ing)?\s+(my|it)\s+(life|all)\b/i,
  /\btak(e|ing)\s+my\s+(own\s+)?life\b/i,
  /\b(want|wanted|wanting)\s+to\s+die\b/i,
  /\bwanna\s+die\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\b(don'?t|do\s+not)\s+want\s+to\s+(live|be\s+alive|wake\s+up)\b/i,
  /\bself[\s-]?harm(ing)?\b/i,
  /\b(hurt|cut|harm)(ing)?\s+my\s*self\b/i,
  /\boverdos(e|ing)\b/i,
  /\bcan'?t\s+go\s+on\b/i,
  // Romanised Bangla
  /\batmo\s*hott?a\b/i,
  /\bmore\s+jete\s+chai\b/i,
  /\bmorte\s+chai\b/i,
  /\bbachte\s+chai\s+na\b/i,
  // Bangla script
  /আত্মহত্যা/,
  /মরে\s*যেতে\s*চাই/,
  /মরতে\s*চাই/,
  /বাঁচতে\s*চাই\s*না/,
  /নিজেকে\s*শেষ/,
];

export function detectCrisis(text: string): { flagged: boolean; matched?: string } {
  for (const pattern of HIGH_RISK_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { flagged: true, matched: match[0] };
  }
  return { flagged: false };
}
