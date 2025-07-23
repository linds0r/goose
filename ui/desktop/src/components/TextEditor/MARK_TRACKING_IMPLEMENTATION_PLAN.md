# Mark-Based Position Tracking Implementation Plan

## Overview
This plan details the implementation of Solution 2: Mark-Based Position Tracking to fix the text range offset bug in the Goose Text Editor. This solution leverages ProseMirror's built-in mark system to automatically track position changes as the document is edited.

## Goals
1. **Eliminate text range offset bugs** when accepting AI suggestions
2. **Maintain backwards compatibility** with existing comment data
3. **Improve reliability** of position tracking across all editing operations
4. **Simplify codebase** by removing duplicate position tracking logic

## Implementation Phases

### Phase 1: Infrastructure Setup (Day 1)
**Objective**: Create helper functions and utilities for mark-based tracking

#### Tasks:
1. ✅ **Create `markHelpers.ts`** utility file with core functions:
   - `findCommentMarkRange()`: Get current position of a comment mark
   - `ensureCommentMarkApplied()`: Apply mark if missing
   - `removeCommentMark()`: Clean up marks
   - `updateAllCommentRanges()`: Sync stored ranges with mark positions
   - `validateAndFixCommentMarks()`: Repair inconsistencies

2. **Add mark persistence hook** in `TextEditorView.tsx`:
   ```typescript
   // Add after editor initialization
   useEffect(() => {
     if (!editor || editor.isDestroyed) return;
     
     // Validate marks on mount and after significant changes
     const report = validateAndFixCommentMarks(editor, comments);
     if (report.orphanedMarks.length > 0 || report.missingMarks.length > 0) {
       console.log('Mark validation report:', report);
     }
   }, [editor, comments]);
   ```

3. **Update Comment interface** (optional, for clarity):
   ```typescript
   export interface Comment {
     id: string;
     textRange: { from: number; to: number } | null; // Fallback/initial position
     markApplied?: boolean; // Track if mark is applied
     // ... rest of interface
   }
   ```

### Phase 2: Refactor Core Functions (Day 1-2)
**Objective**: Update all position-dependent functions to use mark-based tracking

#### Tasks:

1. **Refactor `handleAcceptSuggestion`**:
   ```typescript
   const handleAcceptSuggestion = useCallback((commentIdToAccept: string) => {
     const commentToApply = comments[commentIdToAccept];
     if (!editor || !commentToApply || !commentToApply.aiSuggestion) return;
     
     // Use mark-based position finding
     const currentRange = findCommentMarkRange(editor, commentIdToAccept);
     if (!currentRange) {
       console.error(`No mark found for comment ${commentIdToAccept}`);
       return;
     }
     
     const { from: finalFrom, to: finalTo } = currentRange;
     const suggestionText = commentToApply.aiSuggestion;
     
     // Apply the suggestion
     editor
       .chain()
       .focus()
       .setTextSelection({ from: finalFrom, to: finalTo })
       .insertContent(suggestionText)
       .run();
     
     // Update comment state
     setComments((prev) => ({
       ...prev,
       [commentIdToAccept]: {
         ...prev[commentIdToAccept],
         status: 'applied',
         aiSuggestion: undefined,
         textRange: { from: finalFrom, to: finalFrom + suggestionText.length },
         selectedText: suggestionText,
       },
     }));
   }, [editor, comments]);
   ```

2. **Refactor `toggleInline`**:
   ```typescript
   const toggleInline = useCallback((commentId: string) => {
     const c = comments[commentId];
     if (!editor || !c || !c.aiSuggestion) return;
     
     // Always use current mark position
     const currentRange = findCommentMarkRange(editor, commentId);
     if (!currentRange) {
       console.error(`No mark found for comment ${commentId}`);
       return;
     }
     
     const { from: finalFrom, to: finalTo } = currentRange;
     // ... rest of implementation using finalFrom/finalTo
   }, [editor, comments]);
   ```

3. **Update `handleApplyCommentHighlight`**:
   ```typescript
   const handleApplyCommentHighlight = useCallback((selectionDetails: SelectionDetails) => {
     const { from, to, selectedText, commentId } = selectionDetails;
     if (!editor) return;
     
     // Apply mark immediately
     editor.chain()
       .focus()
       .setTextSelection({ from, to })
       .setCommentHighlight({ commentId })
       .run();
     
     setComments((prev) => ({
       ...prev,
       [commentId]: {
         id: commentId,
         textRange: { from, to }, // Store initial position as fallback
         selectedText: selectedText,
         instruction: '',
         status: 'pending',
         timestamp: new Date(),
         markApplied: true, // Track that mark is applied
         // ... rest of comment properties
       },
     }));
   }, [editor]);
   ```

4. **Update `handleCloseComment`** to use mark helpers:
   ```typescript
   const handleCloseComment = useCallback((commentIdToRemove: string) => {
     if (!editor) return;
     
     // Remove any inline diff display first
     if (comments[commentIdToRemove]?.inlineVisible) {
       // ... existing inline removal logic
     }
     
     // Use helper to remove mark
     removeCommentMark(editor, commentIdToRemove);
     
     // Remove from state
     setComments((prevComments) => {
       const updatedComments = { ...prevComments };
       delete updatedComments[commentIdToRemove];
       return updatedComments;
     });
     
     // ... rest of cleanup
   }, [editor, comments]);
   ```

### Phase 3: AI Response Integration (Day 2)
**Objective**: Ensure AI-generated comments properly use mark-based tracking

#### Tasks:

1. **Update `handleAIBatchResponse`** to apply marks immediately:
   ```typescript
   // In the section where new AI comments are created
   if (!updatedComments[promptId] && originalText && revisedText && activeEditor) {
     const range = findTextRangeInPM(activeEditor.state.doc, originalText);
     if (range) {
       // Apply mark immediately
       activeEditor.chain()
         .focus()
         .setTextSelection({ from: range.from, to: range.to })
         .setCommentHighlight({ commentId: promptId })
         .run();
       
       const newComment: Comment = {
         id: promptId,
         textRange: range,
         selectedText: originalText,
         instruction: explanation || 'AI Suggested Revision',
         status: 'suggestion_ready',
         aiSuggestion: revisedText,
         markApplied: true,
         // ... rest of properties
       };
       updatedComments[promptId] = newComment;
     }
   }
   ```

2. **Remove the separate mark application `useEffect`**:
   - Delete or simplify the `useEffect` that applies marks after comments are created
   - Marks should now be applied immediately when comments are created

### Phase 4: Position Synchronization (Day 2-3)
**Objective**: Ensure positions stay synchronized across all operations

#### Tasks:

1. **Add position sync after major operations**:
   ```typescript
   // Create a sync function
   const syncCommentPositions = useCallback(() => {
     if (!editor || editor.isDestroyed) return;
     
     setComments((prev) => {
       const updated = updateAllCommentRanges(editor, prev);
       return updated;
     });
   }, [editor]);
   
   // Call after operations that might affect positions
   // For example, after accepting a suggestion:
   const handleAcceptSuggestion = useCallback((commentId: string) => {
     // ... existing logic
     
     // Sync all comment positions after the change
     setTimeout(() => {
       syncCommentPositions();
     }, 0);
   }, [/* deps */]);
   ```

2. **Add transaction observer** (optional, for complex cases):
   ```typescript
   useEffect(() => {
     if (!editor) return;
     
     const updateHandler = () => {
       // Debounce position updates
       clearTimeout(positionUpdateTimeout.current);
       positionUpdateTimeout.current = setTimeout(() => {
         syncCommentPositions();
       }, 100);
     };
     
     editor.on('update', updateHandler);
     return () => editor.off('update', updateHandler);
   }, [editor, syncCommentPositions]);
   ```

### Phase 5: Testing & Validation (Day 3-4)
**Objective**: Comprehensive testing of the new implementation

#### Test Scenarios:

1. **Basic Functionality Tests**:
   - [ ] Create comment with AI Assist
   - [ ] Accept AI suggestion
   - [ ] Verify other comments maintain correct positions
   - [ ] Toggle inline diff display
   - [ ] Close/delete comments

2. **Edge Case Tests**:
   - [ ] Accept suggestion that shortens text significantly
   - [ ] Accept suggestion that lengthens text significantly
   - [ ] Multiple overlapping suggestions
   - [ ] Suggestions at document boundaries
   - [ ] Undo/redo operations

3. **Stress Tests**:
   - [ ] Create 20+ comments throughout document
   - [ ] Accept suggestions in random order
   - [ ] Verify all positions remain accurate
   - [ ] Test with AI Refine (many simultaneous comments)

4. **Manual Test Script**:
   ```markdown
   ## Text Range Bug Test Script
   
   1. Start with sample text:
      "The quick brown fox jumps over the lazy dog. This is a test sentence with a typo: recieve"
   
   2. Select "recieve" → AI Assist → "Fix spelling"
   3. Select "quick brown fox" → AI Assist → "Make more descriptive"
   4. Accept the spelling fix (changes to "receive")
   5. Try to accept the "quick brown fox" suggestion
   6. ✅ PASS: Suggestion should apply correctly to "quick brown fox"
   7. ❌ FAIL: Suggestion applies to wrong text or fails
   ```

### Phase 6: Migration & Cleanup (Day 4)
**Objective**: Clean up old code and ensure smooth migration

#### Tasks:

1. **Remove redundant position tracking code**:
   - Remove manual `textRange` updates where marks handle it
   - Simplify position finding logic
   - Remove `needsMarkApplied` flag (marks applied immediately)

2. **Add migration for existing documents**:
   ```typescript
   // On component mount
   useEffect(() => {
     if (!editor || !comments) return;
     
     // Migrate existing comments to ensure marks are applied
     Object.entries(comments).forEach(([commentId, comment]) => {
       if (comment.textRange && !commentMarkExists(editor, commentId)) {
         ensureCommentMarkApplied(
           editor,
           commentId,
           comment.textRange.from,
           comment.textRange.to
         );
       }
     });
   }, [editor]); // Run once on mount
   ```

3. **Update documentation**:
   - Add comments explaining mark-based tracking
   - Document the helper functions
   - Update any developer notes

## Rollback Plan

If issues arise during implementation:

1. **Quick Rollback**: Keep the old position tracking code commented out initially
2. **Feature Flag**: Add a `useMarkBasedTracking` flag to toggle between old and new
3. **Gradual Migration**: Implement for new comments first, migrate existing later

## Success Metrics

1. **Bug Resolution**: Text range offset bug no longer occurs
2. **Performance**: No noticeable performance degradation
3. **Reliability**: Position tracking works across all editing operations
4. **Code Quality**: Reduced complexity and improved maintainability

## Timeline

- **Day 1**: Infrastructure setup + start core refactoring
- **Day 2**: Complete refactoring + AI integration
- **Day 3**: Position sync + testing
- **Day 4**: Final testing + migration + cleanup
- **Day 5**: Buffer for issues + documentation

## Risk Mitigation

1. **Risk**: Marks might be lost during certain operations
   - **Mitigation**: Validation functions + immediate reapplication
   
2. **Risk**: Performance impact with many comments
   - **Mitigation**: Debounced position syncing + efficient mark finding
   
3. **Risk**: Backwards compatibility issues
   - **Mitigation**: Keep textRange as fallback + migration logic

## Next Steps

1. Review and approve this plan
2. Create a feature branch: `fix/text-range-mark-tracking`
3. Implement Phase 1 infrastructure
4. Proceed through phases with regular testing
5. Code review and QA before merging
