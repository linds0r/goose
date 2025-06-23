// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/TextEditorView.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorToolbar from './EditorToolbar';
import './TextEditor.css';
import { View, ViewOptions } from '../../App';
import CommentHighlightMark from './extensions/CommentHighlightMark';
import { useMessageStream } from '../../hooks/useMessageStream';
import { getApiUrl } from '../../config';
import type { Message } from '../../types/message';
import { Comment } from './DocumentTypes';
import CommentBubble from './CommentBubble';

const generateSimpleUUID = () => `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

interface AIBatchTextRevisionRequest {
  editorSessionId: string;
  fullDocumentWithDelineators: string;
  prompts: Array<{
    promptId: string;
    instruction: string;
    originalText: string;
  }>;
}

interface AISuggestionItem {
  promptId: string;
  revisedText?: string;
  explanation?: string;
  status: 'success' | 'error';
  errorMessage?: string;
}
interface AIBatchTextRevisionResponse {
  suggestions: Array<AISuggestionItem>;
}

interface SelectionDetails {
  from: number;
  to: number;
  selectedText: string;
  commentId: string;
}

interface TextEditorViewProps {
  setView: (view: View, viewOptions?: ViewOptions) => void;
}

const TextEditorView: React.FC<TextEditorViewProps> = ({ setView }) => {
  // 1. STATE HOOKS (useState)
  const [comments, setComments] = useState<Record<string, Comment>>({});
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [currentInstructionInput, setCurrentInstructionInput] = useState<string>('');
  const [isInteractionPanelVisible, setIsInteractionPanelVisible] = useState<boolean>(false);
  const [isBubbleFocused, setIsBubbleFocused] = useState<boolean>(false);

  // 2. REF HOOKS (useRef)
  const editorSessionIdRef = useRef<string>(`text-editor-session-${generateSimpleUUID()}`);

  // 3. EARLY CALLBACKS
  const handleSetActiveComment = useCallback(
    (commentId: string | null) => {
      setActiveCommentId(commentId);
      if (commentId && comments[commentId]) {
        setCurrentInstructionInput(comments[commentId].instruction || '');
        setIsInteractionPanelVisible(false);
        setIsBubbleFocused(true);
      } else {
        setIsBubbleFocused(false);
      }
    },
    [
      comments,
      setActiveCommentId,
      setCurrentInstructionInput,
      setIsInteractionPanelVisible,
      setIsBubbleFocused,
    ]
  );

  const handleAIBatchResponse = useCallback(
    (aiResponseObject: Message, reason: string) => {
      console.log('AI Batch Response Received by onFinish:', aiResponseObject, 'Reason:', reason);
      let parsedResponse: AIBatchTextRevisionResponse | null = null;
      let rawTextContent = '';

      if (
        aiResponseObject &&
        aiResponseObject.content &&
        aiResponseObject.content[0] &&
        aiResponseObject.content[0].type === 'text' &&
        typeof aiResponseObject.content[0].text === 'string'
      ) {
        rawTextContent = aiResponseObject.content[0].text;
        try {
          const jsonRegex = new RegExp('```json\\s*([\\s\\S]*?)\\s*```');
          const match = rawTextContent.match(jsonRegex);
          let cleanedJsonString = rawTextContent;
          if (match && match[1]) {
            cleanedJsonString = match[1].trim();
          } else {
            cleanedJsonString = rawTextContent.trim();
            if (
              !(
                (cleanedJsonString.startsWith('{') && cleanedJsonString.endsWith('}')) ||
                (cleanedJsonString.startsWith('[') && cleanedJsonString.endsWith(']'))
              )
            ) {
              console.warn(
                'Response does not appear to be JSON and was not in ```json fences. Parsing as is.'
              );
            }
          }
          parsedResponse = JSON.parse(cleanedJsonString);
        } catch (e) {
          console.error('Failed to parse AI response as JSON.', e, 'Raw text:', rawTextContent);
        }
      }

      if (!parsedResponse || !Array.isArray(parsedResponse.suggestions)) {
        console.error(
          'Parsed AI response invalid or no suggestions array.',
          parsedResponse,
          'Raw content:',
          rawTextContent
        );
        setComments((prev) => {
          const updated = { ...prev };
          Object.keys(updated).forEach((commentId) => {
            if (updated[commentId].status === 'processing') {
              updated[commentId].status = 'error';
              updated[commentId].errorMessage =
                `AI response format error or parse failure. Raw: ${rawTextContent.substring(0, 100)}...`;
            }
          });
          return updated;
        });
        return;
      }

      setComments((prev) => {
        const updatedComments = { ...prev };
        parsedResponse!.suggestions.forEach((suggestion) => {
          if (
            updatedComments[suggestion.promptId] &&
            updatedComments[suggestion.promptId].status === 'processing'
          ) {
            if (suggestion.status === 'success') {
              updatedComments[suggestion.promptId].status = 'suggestion_ready';
              updatedComments[suggestion.promptId].aiSuggestion =
                suggestion.revisedText || 'No revision suggested.';
              updatedComments[suggestion.promptId].errorMessage = undefined;
            } else {
              updatedComments[suggestion.promptId].status = 'error';
              updatedComments[suggestion.promptId].errorMessage =
                suggestion.errorMessage || 'AI processing failed.';
            }
          }
        });
        Object.keys(updatedComments).forEach((commentId) => {
          if (
            updatedComments[commentId].status === 'processing' &&
            !parsedResponse!.suggestions.find((s) => s.promptId === commentId)
          ) {
            updatedComments[commentId].status = 'error';
            updatedComments[commentId].errorMessage = 'Item not in AI suggestions.';
          }
        });
        return updatedComments;
      });
    },
    [setComments]
  );

  // 4. EDITOR HOOK (useEditor)
  const editor = useEditor({
    extensions: [StarterKit, CommentHighlightMark],
    content: `<h2>Hi there,</h2><p>this is a <em>basic</em> example of <strong>tiptap</strong>.</p><p>Select text, click the comment bubble icon. Type instructions in the sidebar bubble, save, then send to AI.</p>`,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl m-5 focus:outline-none',
      },
    },
    onSelectionUpdate: ({ editor: currentEditor }: { editor: Editor }) => {
      const { selection } = currentEditor.state;
      const isActiveHighlightInDocument = currentEditor.isActive('commentHighlightMark');
      if (isActiveHighlightInDocument && !selection.empty) {
        const attrs = currentEditor.getAttributes('commentHighlightMark');
        const commentIdFromDocument = attrs.commentId as string;
        if (commentIdFromDocument && comments[commentIdFromDocument]) {
          if (activeCommentId !== commentIdFromDocument) {
            handleSetActiveComment(commentIdFromDocument);
          }
        } else if (commentIdFromDocument && !comments[commentIdFromDocument]) {
          console.warn(
            `onSelectionUpdate: Orphaned commentHighlight mark: ${commentIdFromDocument}.`
          );
        }
      } else {
        if (activeCommentId && currentEditor && currentEditor.isFocused && !isBubbleFocused) {
          // console.log('Editor focused, no highlight, bubble not focused. Consider clearing active bubble.');
        }
      }
    },
  });

  // 5. CUSTOM HOOKS (useMessageStream)
  const {
    append: sendToAI,
    isLoading: isAiLoading,
    error: aiError,
  } = useMessageStream({
    api: getApiUrl('reply'),
    body: {
      session_id: editorSessionIdRef.current,
      session_working_dir: (window.appConfig.get('GOOSE_WORKING_DIR') as string) || './',
    },
    onFinish: handleAIBatchResponse,
  });

  // 6. CALLBACK HOOKS (useCallback)
  const handleApplyCommentHighlight = useCallback(
    (selectionDetails: SelectionDetails) => {
      const { from, to, selectedText, commentId } = selectionDetails;
      if (!editor) return;
      setComments((prev) => ({
        ...prev,
        [commentId]: {
          id: commentId,
          textRange: { from, to },
          selectedText: selectedText,
          instruction: '',
          status: 'pending',
          timestamp: new Date(),
        },
      }));
      setActiveCommentId(commentId);
      setCurrentInstructionInput('');
      setIsInteractionPanelVisible(false);
    },
    [
      editor,
      setComments,
      setActiveCommentId,
      setCurrentInstructionInput,
      setIsInteractionPanelVisible,
    ]
  );

  const handleBubbleInstructionChange = useCallback(
    (newInstruction: string) => {
      setCurrentInstructionInput(newInstruction);
    },
    [setCurrentInstructionInput]
  );

  const handleSaveInstruction = useCallback(
    (commentIdToSave: string, instructionToSave: string): void => {
      if (!commentIdToSave || !editor) return;
      setComments((prev) => {
        const existingComment = prev[commentIdToSave];
        if (!existingComment || existingComment.instruction === instructionToSave) return prev;
        return {
          ...prev,
          [commentIdToSave]: {
            ...existingComment,
            instruction: instructionToSave,
            status: 'pending',
            timestamp: new Date(),
          },
        };
      });
    },
    [editor, setComments]
  );

  const handleBubbleTextareaBlur = useCallback(() => {
    if (
      activeCommentId &&
      comments[activeCommentId] &&
      currentInstructionInput !== comments[activeCommentId].instruction
    ) {
      handleSaveInstruction(activeCommentId, currentInstructionInput);
    }
    setIsBubbleFocused(false);
  }, [
    activeCommentId,
    comments,
    currentInstructionInput,
    handleSaveInstruction,
    setIsBubbleFocused,
  ]);

  const handleCloseComment = useCallback(
    (commentIdToRemove: string) => {
      if (!editor) return;

      console.log('handleCloseComment called for:', commentIdToRemove);

      // 1. Remove comment from state
      setComments((prevComments) => {
        const updatedComments = { ...prevComments };
        delete updatedComments[commentIdToRemove];
        return updatedComments;
      });

      // 2. Find and remove the CommentHighlightMark from editor
      let markFound = false;
      let fromPos = 0;
      let toPos = 0;

      // Search through the document to find the mark with matching commentId
      editor.state.doc.descendants((node, pos) => {
        if (markFound) return false; // Stop searching once found

        if (node.isText) {
          const commentMark = node.marks.find(
            (mark) =>
              mark.type.name === 'commentHighlight' && mark.attrs.commentId === commentIdToRemove
          );

          if (commentMark) {
            fromPos = pos;
            toPos = pos + node.nodeSize;
            markFound = true;
            console.log(
              `Found mark for comment ${commentIdToRemove} at range: ${fromPos}-${toPos}`
            );
            return false; // Stop iteration
          }
        }

        return true; // Continue iteration for non-matching nodes
      });

      // Remove the mark if found
      if (markFound) {
        try {
          editor
            .chain()
            .focus()
            .setTextSelection({ from: fromPos, to: toPos })
            .unsetMark('commentHighlight') // Use correct mark name
            .run();
          console.log(`Successfully removed highlight for comment ${commentIdToRemove}`);
        } catch (error) {
          console.error('Error removing comment highlight:', error);
        }
      } else {
        console.warn(`Could not find CommentHighlightMark for comment ${commentIdToRemove}`);
      }

      // 3. Clear editor selection and focus
      editor.commands.setTextSelection(0);

      // 4. Clear active comment state if this was the active comment
      if (activeCommentId === commentIdToRemove) {
        setActiveCommentId(null);
        setCurrentInstructionInput('');
      }
    },
    [editor, activeCommentId, setActiveCommentId, setComments, setCurrentInstructionInput]
  );

  const handleSendIndividualCommentToAI = useCallback<(commentId: string) => void>(
    (commentId: string): void => {
      if (!editor || isAiLoading || !comments[commentId]) return;

      let instructionForAI = comments[commentId].instruction;
      if (
        activeCommentId === commentId &&
        comments[commentId].instruction !== currentInstructionInput
      ) {
        handleSaveInstruction(commentId, currentInstructionInput);
        instructionForAI = currentInstructionInput;
      }

      const commentToSend = comments[commentId];
      if (
        !(commentToSend.status === 'pending' && instructionForAI && instructionForAI.trim() !== '')
      ) {
        console.warn(
          'Comment not ready or no instruction for AI:',
          commentId,
          commentToSend.status
        );
        return;
      }

      setComments((prev) => ({
        ...prev,
        [commentId]: { ...prev[commentId], status: 'processing' },
      }));
      const fullDocumentContent = editor.getHTML();
      const batchRequestPayload: AIBatchTextRevisionRequest = {
        editorSessionId: editorSessionIdRef.current,
        fullDocumentWithDelineators: fullDocumentContent,
        prompts: [
          {
            promptId: commentToSend.id,
            instruction: instructionForAI,
            originalText: commentToSend.selectedText,
          },
        ],
      };
      const stringifiedPayload = JSON.stringify(batchRequestPayload);
      console.log('Stringified Payload (Individual Send):', stringifiedPayload);
      const instructionToLLM = `Please process the following batch request for a text editor.
The details of the request are in the JSON object below, marked with 'BATCH_JSON_START' and 'BATCH_JSON_END'.
The JSON object contains:
1. 'editorSessionId': An ID for this editing session.
2. 'fullDocumentWithDelineators': The complete HTML content of the document. Within this HTML, sections targeted for AI processing are marked by <span data-comment-id="COMMENT_ID_HERE" class="comment-highlight">...text...</span>. The 'COMMENT_ID_HERE' corresponds to a 'promptId' in the 'prompts' array (which is the comment.id from the editor).
3. 'prompts': An array of objects, where each object has:
   - 'promptId': The unique identifier for a marked section in the 'fullDocumentWithDelineators' (this is the comment.id from the editor, and it matches the 'COMMENT_ID_HERE' in the span's data-comment-id attribute).
   - 'instruction': The specific user instruction for what to do with the 'originalText'.
   - 'originalText': The text content of the span identified by 'promptId' (Note: The AI should find the text within the span in 'fullDocumentWithDelineators' using the data-comment-id attribute matching this promptId rather than solely relying on this 'originalText' field if context is important, as 'originalText' might be stale if the document was edited after the anchor was created but before this batch submission).

Your task is to:
For each prompt in the 'prompts' array:
  - Perform the requested 'instruction' on the text associated with its 'promptId' (found via the data-comment-id attribute in 'fullDocumentWithDelineators'), considering surrounding context.
  - Generate a 'revisedText'.

Respond with ONLY a single, valid JSON object (no other text, explanations, or markdown formatting before or after it) that follows this exact structure:
{
  "suggestions": [
    {
      "promptId": "PROMPT_ID_FROM_REQUEST",
      "revisedText": "YOUR_SUGGESTED_REVISED_TEXT_HERE",
      "status": "success",
      "errorMessage": null
    },
    {
      "promptId": "FAILED_PROMPT_ID",
      "revisedText": null,
      "status": "error",
      "errorMessage": "Details about why processing failed for this item."
    }
  ]
}

BATCH_JSON_START
${stringifiedPayload}
BATCH_JSON_END
`;
      console.log(
        'Instruction to LLM (Individual Send - final check at runtime):',
        instructionToLLM
      );
      sendToAI({
        id: `editor-msg-${generateSimpleUUID()}`,
        role: 'user',
        created: Date.now(),
        content: [{ type: 'text', text: instructionToLLM }],
      });
      return;
    },
    [
      editor,
      comments,
      activeCommentId,
      currentInstructionInput,
      handleSaveInstruction,
      isAiLoading,
      sendToAI,
      setComments,
    ]
  );

  const handleSaveInstructionFromBubble = useCallback(
    (commentId: string) => {
      if (activeCommentId === commentId) {
        handleSaveInstruction(commentId, currentInstructionInput);
      }
    },
    [activeCommentId, currentInstructionInput, handleSaveInstruction]
  );

  const handleCancelInteraction = useCallback(() => {
    setIsInteractionPanelVisible(false);
    setActiveCommentId(null);
    setCurrentInstructionInput('');
    if (editor) editor.chain().focus().run();
  }, [editor, setIsInteractionPanelVisible, setActiveCommentId, setCurrentInstructionInput]);

  const handleAcceptSuggestion = useCallback(
    (commentIdToAccept: string) => {
      console.log('handleAcceptSuggestion called with ID:', commentIdToAccept);
      if (!editor || !commentIdToAccept) {
        console.warn('Editor or commentIdToAccept is missing.');
        return;
      }

      console.log(
        'Comment to apply (pre-check):',
        JSON.stringify(comments[commentIdToAccept], null, 2)
      );
      const commentToApply = comments[commentIdToAccept];

      if (
        !commentToApply ||
        !commentToApply.aiSuggestion ||
        commentToApply.status !== 'suggestion_ready'
      ) {
        console.warn(
          'Guard condition failed for accepting suggestion. Comment status:',
          comments[commentIdToAccept]?.status,
          'Suggestion:',
          comments[commentIdToAccept]?.aiSuggestion
        );
        return;
      }
      console.log('Comment to apply (post-check):', JSON.stringify(commentToApply, null, 2));

      const suggestionText = commentToApply.aiSuggestion;
      let fromPos: number | null = null;
      let toPos: number | null = null;

      if (commentToApply.textRange) {
        fromPos = commentToApply.textRange.from;
        toPos = commentToApply.textRange.to;
      }
      console.log(
        `Calculated positions: from=${fromPos}, to=${toPos}. Suggestion text: "${suggestionText}"`
      );

      if (
        fromPos !== null &&
        toPos !== null &&
        editor.state.doc.content.size > 0 &&
        fromPos < editor.state.doc.content.size &&
        toPos <= editor.state.doc.content.size
      ) {
        console.log('Attempting to execute Tiptap chain steps individually...'); // MODIFIED LOG
        try {
          let selectionSuccess = false;
          let contentSuccess = false;

          if (editor.can().setTextSelection({ from: fromPos, to: toPos })) {
            selectionSuccess = editor
              .chain()
              .focus()
              .setTextSelection({ from: fromPos, to: toPos })
              .run();
            console.log('setTextSelection run. Success:', selectionSuccess);
          } else {
            console.warn('Cannot setTextSelection for the given range.', {
              from: fromPos,
              to: toPos,
            });
          }

          if (selectionSuccess) {
            // Ensure a fresh chain for insertContent if setTextSelection was run
            if (editor.can().insertContent(suggestionText)) {
              contentSuccess = editor.chain().insertContent(suggestionText).run();
              console.log('insertContent run. Success:', contentSuccess);
            } else {
              console.warn('Cannot insertContent with the current selection/suggestion.', {
                suggestionText,
              });
            }
          } else {
            console.warn('setTextSelection failed, not attempting insertContent.');
          }

          if (contentSuccess) {
            console.log('All critical Tiptap chain steps reported success.');
            // For now, we are not unsetting the mark in this debug step.
            // It will remain on the newly inserted text if insertContent was successful.
            setComments((prev) => {
              console.log("Updating comment status to 'applied' for ID:", commentIdToAccept);
              return {
                ...prev,
                [commentIdToAccept]: {
                  ...prev[commentIdToAccept],
                  status: 'applied',
                  aiSuggestion: undefined,
                },
              };
            });
          } else {
            console.warn(
              'One or more Tiptap steps failed or did not report success. Content not inserted or status not updated.'
            );
            setComments((prev) => ({
              ...prev,
              [commentIdToAccept]: {
                ...prev[commentIdToAccept],
                status: 'error',
                errorMessage: 'Tiptap step failed during suggestion acceptance.',
              },
            }));
          }
        } catch (tiptapError) {
          console.error(
            'Error during Tiptap chain execution steps in handleAcceptSuggestion:',
            tiptapError
          );
          setComments((prev) => ({
            ...prev,
            [commentIdToAccept]: {
              ...prev[commentIdToAccept],
              status: 'error',
              errorMessage: 'Tiptap error during suggestion acceptance (caught): ' + tiptapError,
            },
          }));
        }
      } else {
        console.warn(
          'Could not apply suggestion. Mark not found or range invalid for comment:',
          commentIdToAccept,
          `Details: fromPos=${fromPos}, toPos=${toPos}, docSize=${editor.state.doc.content.size}`
        );
        setComments((prev) => ({
          ...prev,
          [commentIdToAccept]: {
            ...prev[commentIdToAccept],
            status: 'error',
            errorMessage: 'Failed to find text in editor to apply suggestion.',
          },
        }));
      }
    },
    [editor, comments, setComments]
  );

  const handleTriggerAIBatchProcessing = useCallback(() => {
    if (!editor || isAiLoading) return;
    const commentsToProcessArray = Object.values(comments).filter(
      (c) => c.status === 'pending' && c.instruction && c.instruction.trim() !== ''
    );
    if (commentsToProcessArray.length === 0) return;

    setComments((prev) => {
      const updatedComments = { ...prev };
      commentsToProcessArray.forEach((c) => {
        updatedComments[c.id].status = 'processing';
      });
      return updatedComments;
    });
    const fullDocumentContent = editor.getHTML();
    const batchRequestPayload: AIBatchTextRevisionRequest = {
      editorSessionId: editorSessionIdRef.current,
      fullDocumentWithDelineators: fullDocumentContent,
      prompts: commentsToProcessArray.map((c) => ({
        promptId: c.id,
        instruction: c.instruction,
        originalText: c.selectedText,
      })),
    };
    const stringifiedPayload = JSON.stringify(batchRequestPayload);
    console.log('Stringified Payload (Batch Send):', stringifiedPayload);
    const instructionToLLM = `Please process the following batch request for a text editor.
The details of the request are in the JSON object below, marked with 'BATCH_JSON_START' and 'BATCH_JSON_END'.
The JSON object contains:
1. 'editorSessionId': An ID for this editing session.
2. 'fullDocumentWithDelineators': The complete HTML content of the document. Within this HTML, sections targeted for AI processing are marked by <span data-comment-id="COMMENT_ID_HERE" class="comment-highlight">...text...</span>. The 'COMMENT_ID_HERE' corresponds to a 'promptId' in the 'prompts' array (which is the comment.id from the editor).
3. 'prompts': An array of objects, where each object has:
   - 'promptId': The unique identifier for a marked section in the 'fullDocumentWithDelineators' (this is the comment.id from the editor, and it matches the 'COMMENT_ID_HERE' in the span's data-comment-id attribute).
   - 'instruction': The specific user instruction for what to do with the 'originalText'.
   - 'originalText': The text content of the span identified by 'promptId' (Note: The AI should find the text within the span in 'fullDocumentWithDelineators' using the data-comment-id attribute matching this promptId rather than solely relying on this 'originalText' field if context is important, as 'originalText' might be stale if the document was edited after the anchor was created but before this batch submission).

Your task is to:
For each prompt in the 'prompts' array:
  - Perform the requested 'instruction' on the text associated with its 'promptId' (found via the data-comment-id attribute in 'fullDocumentWithDelineators'), considering surrounding context.
  - Generate a 'revisedText'.

Respond with ONLY a single, valid JSON object (no other text, explanations, or markdown formatting before or after it) that follows this exact structure:
{
  "suggestions": [
    {
      "promptId": "PROMPT_ID_FROM_REQUEST",
      "revisedText": "YOUR_SUGGESTED_REVISED_TEXT_HERE",
      "status": "success",
      "errorMessage": null
    },
    {
      "promptId": "FAILED_PROMPT_ID",
      "revisedText": null,
      "status": "error",
      "errorMessage": "Details about why processing failed for this item."
    }
  ]
}

BATCH_JSON_START
${stringifiedPayload}
BATCH_JSON_END
`;
    console.log('Instruction to LLM (Batch Send - final check at runtime):', instructionToLLM);
    sendToAI({
      id: `editor-msg-${generateSimpleUUID()}`,
      role: 'user',
      created: Date.now(),
      content: [{ type: 'text', text: instructionToLLM }],
    });
  }, [editor, isAiLoading, comments, sendToAI, setComments]);

  // 7. EFFECT HOOKS
  useEffect(() => {
    if (aiError) {
      console.error('useMessageStream Error reported:', aiError);
      let errorMessage = aiError instanceof Error ? aiError.message : String(aiError);
      setComments((prev) => {
        const updatedComments = { ...prev };
        Object.keys(updatedComments).forEach((commentId) => {
          if (updatedComments[commentId].status === 'processing') {
            updatedComments[commentId].status = 'error';
            updatedComments[commentId].errorMessage = errorMessage;
          }
        });
        return updatedComments;
      });
    }
  }, [aiError, setComments]);

  useEffect(() => {
    if (activeCommentId && comments[activeCommentId] && isInteractionPanelVisible) {
      setCurrentInstructionInput(comments[activeCommentId].instruction || '');
    } else if (!isInteractionPanelVisible && !activeCommentId && !isBubbleFocused) {
      setCurrentInstructionInput('');
    }
  }, [
    activeCommentId,
    comments,
    isInteractionPanelVisible,
    isBubbleFocused,
    setCurrentInstructionInput,
  ]);

  useEffect(() => {
    // console.log('Comments state updated:', comments);
  }, [comments]);

  // 8. HELPER FUNCTIONS RETURNING JSX
  const getToolbar = () => {
    if (!editor) return null;
    return (
      <EditorToolbar
        editor={editor}
        setView={setView}
        comments={comments}
        onApplyCommentHighlight={handleApplyCommentHighlight}
        onSendAllToAI={handleTriggerAIBatchProcessing}
        isAiLoading={isAiLoading}
      />
    );
  };

  let shouldShowOldInstructionArea = false;
  if (isInteractionPanelVisible && activeCommentId && comments[activeCommentId]) {
    const status = comments[activeCommentId].status;
    shouldShowOldInstructionArea =
      status === 'pending' || status === 'processing' || status === 'error';
  }

  return (
    <div
      className="text-editor-container"
      style={{
        paddingTop: '38px',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 38px)',
      }}
    >
      {getToolbar()}
      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        <div style={{ flexGrow: 1, overflowY: 'auto', position: 'relative' }}>
          <EditorContent editor={editor} className="editor-content-area" />
        </div>
        <div
          className="comments-sidebar"
          style={{
            width: '350px',
            borderLeft: '1px solid #ddd',
            padding: '15px',
            overflowY: 'auto',
            backgroundColor: '#f8f9fa',
            position: 'relative',
          }}
        >
          <h4
            style={{
              marginTop: '0',
              marginBottom: '15px',
              borderBottom: '1px solid #eee',
              paddingBottom: '10px',
            }}
          >
            Comments
          </h4>
          {Object.keys(comments).length === 0 && (
            <p style={{ color: '#6c757d', fontSize: '0.9em' }}>No comments yet.</p>
          )}
          {Object.values(comments).map((comment) => (
            <CommentBubble
              key={comment.id}
              comment={comment}
              isActive={comment.id === activeCommentId}
              currentInstructionForActive={
                comment.id === activeCommentId ? currentInstructionInput : comment.instruction
              }
              onInstructionChange={handleBubbleInstructionChange}
              onSaveInstruction={handleSaveInstructionFromBubble}
              onSendToAI={handleSendIndividualCommentToAI}
              onAcceptSuggestion={handleAcceptSuggestion}
              onSetActive={handleSetActiveComment}
              onBubbleTextareaBlur={handleBubbleTextareaBlur}
              isGloballyLoadingAI={isAiLoading}
              onCloseComment={handleCloseComment}
            />
          ))}
        </div>
      </div>
      {shouldShowOldInstructionArea && (
        <div
          className="ai-prompt-input-area"
          style={{
            padding: '15px',
            borderTop: '1px solid #ddd',
            background: '#f9f9f9',
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: '350px',
            zIndex: 20,
            maxHeight: '40%',
            overflowY: 'auto',
          }}
        >
          <button
            onClick={handleCancelInteraction}
            style={{
              position: 'absolute',
              top: '5px',
              right: '5px',
              background: 'transparent',
              border: 'none',
              fontSize: '1.2em',
              cursor: 'pointer',
              padding: '5px',
            }}
          >
            &times;
          </button>
          <h4>
            AI Interaction for: <code>{activeCommentId?.substring(0, 6)}</code>
          </h4>
          <div
            style={{
              fontSize: '0.9em',
              color: '#555',
              maxHeight: '60px',
              overflowY: 'auto',
              background: '#efefef',
              padding: '5px',
              border: '1px solid #e0e0e0',
              borderRadius: '3px',
              marginBottom: '10px',
            }}
          >
            Original: <strong>"{comments[activeCommentId!]?.selectedText}"</strong>
          </div>
          <textarea
            value={currentInstructionInput}
            onChange={(e) => setCurrentInstructionInput(e.target.value)}
            placeholder="Enter AI instruction..."
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              margin: '10px 0',
              boxSizing: 'border-box',
            }}
            disabled={isAiLoading && comments[activeCommentId!]?.status === 'processing'}
          />
          <button
            onClick={() =>
              activeCommentId && handleSaveInstruction(activeCommentId, currentInstructionInput)
            }
            style={{
              padding: '8px 12px',
              marginRight: '10px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
            }}
            disabled={
              !currentInstructionInput.trim() ||
              (isAiLoading && comments[activeCommentId!]?.status === 'processing')
            }
          >
            Save Instruction
          </button>
        </div>
      )}
    </div>
  );
};

export default TextEditorView;
