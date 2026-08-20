/**
 * String Similarity Utilities
 *
 * Provides fuzzy matching algorithms for duplicate detection:
 * - Levenshtein distance for edit distance
 * - Jaccard similarity for set-based comparison
 * - Normalized similarity scores (0-1 range)
 */

/**
 * Calculates the Levenshtein distance between two strings.
 * The distance is the minimum number of single-character edits
 * (insertions, deletions, substitutions) required to change one string into the other.
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @param caseSensitive - Whether comparison is case-sensitive (default: false)
 * @returns The edit distance (non-negative integer)
 */
export function levenshteinDistance(
  str1: string,
  str2: string,
  caseSensitive: boolean = false
): number {
  const s1 = caseSensitive ? str1 : str1.toLowerCase();
  const s2 = caseSensitive ? str2 : str2.toLowerCase();

  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix: number[][] = [];

  // Initialize first row and column
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = matrix[0][j] ?? j;
  }

  // Fill the matrix
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[s1.length][s2.length];
}

/**
 * Calculates the normalized Levenshtein similarity score.
 * Returns a value between 0 (completely different) and 1 (identical).
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @param caseSensitive - Whether comparison is case-sensitive (default: false)
 * @returns Similarity score between 0 and 1
 */
export function levenshteinSimilarity(
  str1: string,
  str2: string,
  caseSensitive: boolean = false
): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const distance = levenshteinDistance(str1, str2, caseSensitive);
  const maxLength = Math.max(str1.length, str2.length);

  return 1 - distance / maxLength;
}

/**
 * Normalizes a string for comparison by:
 * - Converting to lowercase
 * - Removing extra whitespace
 * - Removing common business suffixes
 *
 * @param str - String to normalize
 * @returns Normalized string
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Remove apostrophes (straight + curly) so possessives/contractions
    // collapse before any tokenization ("joe's" -> "joes"). Done before the
    // general punctuation pass, which would otherwise split them into
    // separate tokens ("joe s") and deflate Jaccard similarity.
    .replace(/['’]/g, '')
    // Remove common business suffixes
    .replace(/\b(llc|inc|corp|corporation|ltd|limited|co|company)\b/gi, '')
    // Normalize street abbreviations
    .replace(/\b(street|st)\b/gi, 'st')
    .replace(/\b(avenue|ave)\b/gi, 'ave')
    .replace(/\b(boulevard|blvd)\b/gi, 'blvd')
    .replace(/\b(road|rd)\b/gi, 'rd')
    .replace(/\b(drive|dr)\b/gi, 'dr')
    // Remove punctuation and extra spaces
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates similarity between two strings using normalized comparison.
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Similarity score between 0 and 1
 */
export function normalizedSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);

  return levenshteinSimilarity(normalized1, normalized2);
}

/**
 * Calculates Jaccard similarity between two strings using word sets.
 * Returns the ratio of intersection to union of word sets.
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Jaccard similarity score between 0 and 1
 */
export function jaccardSimilarity(str1: string, str2: string): number {
  const words1 = new Set(normalizeString(str1).split(' ').filter((w) => w.length > 0));
  const words2 = new Set(normalizeString(str2).split(' ').filter((w) => w.length > 0));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter((word) => words2.has(word)).length;
  const union = words1.size + words2.size - intersection;

  return intersection / union;
}

/**
 * Combines multiple similarity metrics for a comprehensive score.
 * Uses weighted average of Levenshtein and Jaccard similarity.
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @param options - Configuration options
 * @param options.levenshteinWeight - Weight for Levenshtein similarity (default: 0.6)
 * @param options.jaccardWeight - Weight for Jaccard similarity (default: 0.4)
 * @returns Combined similarity score between 0 and 1
 */
export function combinedSimilarity(
  str1: string,
  str2: string,
  options: {
    levenshteinWeight?: number;
    jaccardWeight?: number;
  } = {}
): number {
  const { levenshteinWeight = 0.6, jaccardWeight = 0.4 } = options;

  const levSim = normalizedSimilarity(str1, str2);
  const jacSim = jaccardSimilarity(str1, str2);

  return levenshteinWeight * levSim + jaccardWeight * jacSim;
}
