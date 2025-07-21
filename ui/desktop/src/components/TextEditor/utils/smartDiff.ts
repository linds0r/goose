/**
 * Smart diff utility for generating granular text changes
 * Provides word-level and character-level diffing with readability optimization
 */

export interface DiffSegment {
  type: 'unchanged' | 'deleted' | 'added';
  text: string;
}

export interface DiffResult {
  segments: DiffSegment[];
  changeComplexity: number; // 0-1, where 1 is completely different
  shouldUseGranular: boolean; // whether to use granular diff or full replacement
}

/**
 * Simple word tokenizer that preserves punctuation context
 */
function tokenizeWords(text: string): string[] {
  // Split on whitespace but keep punctuation attached to words
  return text.trim().split(/\s+/).filter(token => token.length > 0);
}

/**
 * Generate word-level diff using dynamic programming
 */
function generateWordDiff(originalWords: string[], suggestedWords: string[]): DiffSegment[] {
  const m = originalWords.length;
  const n = suggestedWords.length;
  
  // Create DP table for LCS (Longest Common Subsequence)
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (originalWords[i - 1] === suggestedWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to build diff
  const segments: DiffSegment[] = [];
  let i = m, j = n;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && originalWords[i - 1] === suggestedWords[j - 1]) {
      // Words match - add as unchanged
      segments.unshift({
        type: 'unchanged',
        text: originalWords[i - 1]
      });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
      // Word deleted from original
      segments.unshift({
        type: 'deleted',
        text: originalWords[i - 1]
      });
      i--;
    } else {
      // Word added in suggestion
      segments.unshift({
        type: 'added',
        text: suggestedWords[j - 1]
      });
      j--;
    }
  }
  
  return segments;
}

/**
 * Merge consecutive segments of the same type and add spaces
 */
function mergeAndFormatSegments(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return [];
  
  const merged: DiffSegment[] = [];
  let current = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    
    if (segment.type === current.type) {
      // Merge consecutive segments of same type
      current.text += ' ' + segment.text;
    } else {
      // Push current and start new one
      merged.push(current);
      current = { ...segment };
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Calculate complexity score based on the diff segments
 */
function calculateComplexity(segments: DiffSegment[], originalLength: number): number {
  if (originalLength === 0) return 1;
  
  let changedWords = 0;
  let totalWords = 0;
  
  segments.forEach(segment => {
    const wordCount = segment.text.split(/\s+/).length;
    totalWords += wordCount;
    
    if (segment.type !== 'unchanged') {
      changedWords += wordCount;
    }
  });
  
  return changedWords / Math.max(totalWords, originalLength);
}

/**
 * Main function to generate smart diff
 */
export function generateSmartDiff(originalText: string, suggestedText: string): DiffResult {
  // Handle edge cases
  if (!originalText && !suggestedText) {
    return {
      segments: [],
      changeComplexity: 0,
      shouldUseGranular: true
    };
  }
  
  if (!originalText) {
    return {
      segments: [{ type: 'added', text: suggestedText }],
      changeComplexity: 1,
      shouldUseGranular: true
    };
  }
  
  if (!suggestedText) {
    return {
      segments: [{ type: 'deleted', text: originalText }],
      changeComplexity: 1,
      shouldUseGranular: true
    };
  }
  
  // Tokenize into words
  const originalWords = tokenizeWords(originalText);
  const suggestedWords = tokenizeWords(suggestedText);
  
  // Generate word-level diff
  const rawSegments = generateWordDiff(originalWords, suggestedWords);
  const segments = mergeAndFormatSegments(rawSegments);
  
  // Calculate complexity
  const complexity = calculateComplexity(segments, originalWords.length);
  
  // Determine if we should use granular diff
  // Use granular if:
  // 1. Complexity is reasonable (< 70% change)
  // 2. Not too many small segments (readability)
  // 3. Changes are meaningful (not just whitespace/punctuation)
  
  const hasSubstantialUnchanged = segments.some(s => 
    s.type === 'unchanged' && s.text.split(/\s+/).length >= 2
  );
  
  const tooManySegments = segments.length > 8;
  const tooComplex = complexity > 0.7;
  
  const shouldUseGranular = !tooComplex && !tooManySegments && hasSubstantialUnchanged;
  
  return {
    segments,
    changeComplexity: complexity,
    shouldUseGranular
  };
}

/**
 * Helper function to convert diff segments to TipTap editor content
 */
export function segmentsToEditorContent(segments: DiffSegment[]): any[] {
  const content: any[] = [];
  
  segments.forEach((segment, index) => {
    if (index > 0) {
      // Add space between segments
      content.push({ type: 'text', text: ' ' });
    }
    
    switch (segment.type) {
      case 'unchanged':
        content.push({ type: 'text', text: segment.text });
        break;
      case 'deleted':
        content.push({
          type: 'text',
          text: segment.text,
          marks: [{ type: 'diffDel' }]
        });
        break;
      case 'added':
        content.push({
          type: 'text',
          text: segment.text,
          marks: [{ type: 'diffAdd' }]
        });
        break;
    }
  });
  
  return content;
}
