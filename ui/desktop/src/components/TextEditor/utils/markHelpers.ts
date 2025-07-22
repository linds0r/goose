/**
 * Mark-Based Position Tracking Utilities
 * 
 * This module provides helper functions for tracking text positions using ProseMirror marks
 * instead of relying on stored position ranges that can become stale as the document changes.
 * 
 * The core concept is that ProseMirror marks automatically move with the text they're attached to,
 * so we can use them as reliable position anchors for comments and suggestions.
 */

import type { Editor } from '@tiptap/react';
import type { Comment } from '../DocumentTypes';

/**
 * Finds the current position range of a comment mark in the document
 * @param editor - The TipTap editor instance
 * @param commentId - The ID of the comment to find
 * @returns The current position range or null if not found
 */
export function findCommentMarkRange(
  editor: Editor,
  commentId: string
): { from: number; to: number } | null {
  if (!editor || editor.isDestroyed) {
    console.warn('findCommentMarkRange: Editor is null or destroyed');
    return null;
  }

  let markRange: { from: number; to: number } | null = null;
  let minPos = Infinity;
  let maxPos = -1;

  try {
    editor.state.doc.descendants((node, pos) => {
      if (node.isText) {
        // Look for the comment highlight mark on this text node
        const commentMark = node.marks.find(
          (mark) => mark.type.name === 'commentHighlight' && mark.attrs.commentId === commentId
        );

        if (commentMark) {
          // Track the full range of the mark across all text nodes
          minPos = Math.min(minPos, pos);
          maxPos = Math.max(maxPos, pos + node.textContent.length);
        }
      }
      return true; // Continue iteration to find full range
    });

    // If we found any marks, return the complete range
    if (minPos !== Infinity && maxPos !== -1) {
      markRange = {
        from: minPos,
        to: maxPos,
      };
    }
  } catch (error) {
    console.error(`Error finding comment mark range for ${commentId}:`, error);
    return null;
  }

  return markRange;
}

/**
 * Ensures a comment mark is applied to the specified range
 * @param editor - The TipTap editor instance
 * @param commentId - The ID of the comment
 * @param from - Start position
 * @param to - End position
 * @returns Success status
 */
export function ensureCommentMarkApplied(
  editor: Editor,
  commentId: string,
  from: number,
  to: number
): boolean {
  if (!editor || editor.isDestroyed) {
    console.warn('ensureCommentMarkApplied: Editor is null or destroyed');
    return false;
  }

  try {
    // Check if mark already exists in the range
    const existingRange = findCommentMarkRange(editor, commentId);
    if (existingRange && existingRange.from === from && existingRange.to === to) {
      console.log(`Comment mark ${commentId} already exists at correct position`);
      return true;
    }

    // Apply the mark
    const transaction = editor.state.tr;
    transaction.addMark(
      from,
      to,
      editor.schema.marks.commentHighlight.create({
        commentId,
        class: 'comment-highlight',
      })
    );

    editor.view.dispatch(transaction);
    console.log(`Applied comment mark ${commentId} at ${from}-${to}`);
    return true;
  } catch (error) {
    console.error(`Error applying comment mark ${commentId}:`, error);
    return false;
  }
}

/**
 * Removes a comment mark from the document
 * @param editor - The TipTap editor instance
 * @param commentId - The ID of the comment to remove
 * @returns Success status
 */
export function removeCommentMark(editor: Editor, commentId: string): boolean {
  if (!editor || editor.isDestroyed) {
    console.warn('removeCommentMark: Editor is null or destroyed');
    return false;
  }

  try {
    const transaction = editor.state.tr;
    let markFound = false;

    editor.state.doc.descendants((node, pos) => {
      if (node.isText) {
        const commentMark = node.marks.find(
          (mark) => mark.type.name === 'commentHighlight' && mark.attrs.commentId === commentId
        );

        if (commentMark) {
          transaction.removeMark(
            pos,
            pos + node.textContent.length,
            commentMark
          );
          markFound = true;
        }
      }
      return true; // Continue iteration to remove all instances
    });

    if (markFound) {
      editor.view.dispatch(transaction);
      console.log(`Removed comment mark ${commentId}`);
      return true;
    } else {
      console.warn(`Comment mark ${commentId} not found for removal`);
      return false;
    }
  } catch (error) {
    console.error(`Error removing comment mark ${commentId}:`, error);
    return false;
  }
}

/**
 * Updates all comment ranges to match their current mark positions
 * @param editor - The TipTap editor instance
 * @param comments - Current comments object
 * @returns Updated comments object with synchronized ranges
 */
export function updateAllCommentRanges(
  editor: Editor,
  comments: Record<string, Comment>
): Record<string, Comment> {
  if (!editor || editor.isDestroyed) {
    console.warn('updateAllCommentRanges: Editor is null or destroyed');
    return comments;
  }

  const updatedComments = { ...comments };
  let hasChanges = false;

  Object.keys(updatedComments).forEach((commentId) => {
    const comment = updatedComments[commentId];
    if (!comment) return;

    const currentRange = findCommentMarkRange(editor, commentId);
    
    if (currentRange) {
      // Get the current text at this position to update selectedText
      const currentText = editor.state.doc.textBetween(currentRange.from, currentRange.to);
      
      // Update the stored range and text if they differ
      if (
        !comment.textRange ||
        comment.textRange.from !== currentRange.from ||
        comment.textRange.to !== currentRange.to ||
        comment.selectedText !== currentText
      ) {
        updatedComments[commentId] = {
          ...comment,
          textRange: currentRange,
          selectedText: currentText, // Update the text too as it might have changed
        };
        hasChanges = true;
        console.log(`Updated comment ${commentId}: range ${currentRange.from}-${currentRange.to}, text: "${currentText}"`);
      }
    } else if (comment.textRange) {
      // Mark not found but comment has a range - this indicates an orphaned comment
      console.warn(`Comment ${commentId} has no mark but has textRange - potential orphan`);
    }
  });

  return hasChanges ? updatedComments : comments;
}

/**
 * Validates comment marks and fixes inconsistencies
 * @param editor - The TipTap editor instance
 * @param comments - Current comments object
 * @returns Validation report with any issues found and fixed
 */
export function validateAndFixCommentMarks(
  editor: Editor,
  comments: Record<string, Comment>
): {
  orphanedMarks: string[];
  missingMarks: string[];
  fixedMarks: string[];
} {
  if (!editor || editor.isDestroyed) {
    console.warn('validateAndFixCommentMarks: Editor is null or destroyed');
    return { orphanedMarks: [], missingMarks: [], fixedMarks: [] };
  }

  const report = {
    orphanedMarks: [] as string[],
    missingMarks: [] as string[],
    fixedMarks: [] as string[],
  };

  try {
    // Find all comment marks in the document
    const marksInDocument = new Set<string>();
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        node.marks.forEach((mark) => {
          if (mark.type.name === 'commentHighlight' && mark.attrs.commentId) {
            marksInDocument.add(mark.attrs.commentId);
          }
        });
      }
      return true;
    });

    // Check for orphaned marks (marks without corresponding comments)
    marksInDocument.forEach((markCommentId) => {
      if (!comments[markCommentId]) {
        report.orphanedMarks.push(markCommentId);
        // Remove orphaned mark
        removeCommentMark(editor, markCommentId);
        console.log(`Removed orphaned mark: ${markCommentId}`);
      }
    });

    // Check for missing marks (comments without marks)
    Object.keys(comments).forEach((commentId) => {
      const comment = comments[commentId];
      if (comment.textRange && !marksInDocument.has(commentId)) {
        report.missingMarks.push(commentId);
        
        // Try to reapply the mark if we have a valid range
        if (
          comment.textRange.from >= 0 &&
          comment.textRange.to <= editor.state.doc.content.size &&
          comment.textRange.from <= comment.textRange.to
        ) {
          const success = ensureCommentMarkApplied(
            editor,
            commentId,
            comment.textRange.from,
            comment.textRange.to
          );
          if (success) {
            report.fixedMarks.push(commentId);
            console.log(`Fixed missing mark: ${commentId}`);
          }
        }
      }
    });
  } catch (error) {
    console.error('Error during mark validation:', error);
  }

  return report;
}

/**
 * Checks if a comment mark exists in the document
 * @param editor - The TipTap editor instance
 * @param commentId - The ID of the comment to check
 * @returns True if the mark exists, false otherwise
 */
export function commentMarkExists(editor: Editor, commentId: string): boolean {
  return findCommentMarkRange(editor, commentId) !== null;
}

/**
 * Gets all comment IDs that have marks in the document
 * @param editor - The TipTap editor instance
 * @returns Array of comment IDs with active marks
 */
export function getAllCommentMarksInDocument(editor: Editor): string[] {
  if (!editor || editor.isDestroyed) {
    return [];
  }

  const commentIds = new Set<string>();

  try {
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        node.marks.forEach((mark) => {
          if (mark.type.name === 'commentHighlight' && mark.attrs.commentId) {
            commentIds.add(mark.attrs.commentId);
          }
        });
      }
      return true;
    });
  } catch (error) {
    console.error('Error getting comment marks:', error);
  }

  return Array.from(commentIds);
}

/**
 * Debug utility to log all comment marks and their positions
 * @param editor - The TipTap editor instance
 */
export function debugLogCommentMarks(editor: Editor): void {
  if (!editor || editor.isDestroyed) {
    console.log('Debug: Editor is null or destroyed');
    return;
  }

  console.log('=== Comment Marks Debug ===');
  
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) {
      const commentMarks = node.marks.filter(
        (mark) => mark.type.name === 'commentHighlight'
      );
      
      if (commentMarks.length > 0) {
        commentMarks.forEach((mark) => {
          console.log(`Mark: ${mark.attrs.commentId} at ${pos}-${pos + node.textContent.length} text: "${node.textContent}"`);
        });
      }
    }
    return true;
  });
  
  console.log('=== End Debug ===');
}
