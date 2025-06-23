// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/TextEditorView.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorToolbar from './EditorToolbar';
import './TextEditor.css';
import { View, ViewOptions } from '../../App';
import CommentHighlightMark from './extensions/CommentHighlightMark';
import StrikethroughDiffMark from './extensions/StrikethroughDiffMark';
import BoldItalicAddMark from './extensions/BoldItalicAddMark';
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
          console.log('Attempting to parse this JSON string:', cleanedJsonString); // Added for debugging
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
    extensions: [StarterKit, CommentHighlightMark, StrikethroughDiffMark, BoldItalicAddMark],
    content: `<h2>Goose Text Editor</h2><p>Create documents with integrated AI using comment bubbles instead of a chatbot.</p><p><strong>Using the AI:</strong></p><p>To use the AI assistant, simply write your content in the document and add comments where you want AI help. When you add a comment, you can ask the AI to generate new content, revise existing text, or provide suggestions for that specific location. The AI will respond within the comment bubble, and you can choose whether to keep, modify, or delete both your original text and the AI's suggestions. You have full control over what stays in your document.</p><p><strong>Using AI for Revision:</strong></p><ol><li><strong>Select Text:</strong> Highlight text for AI revision.</li><li><strong>Add Comment:</strong> Attach your instruction (e.g., "Shorten," "Make persuasive").</li><li><strong>Process & Review:</strong><ul><li>Submit comments.</li><li>AI suggestions appear in the comment bubble.</li><li>Preview with "Show Inline": <s>original text</s>, <strong><em>new text</em></strong>.</li><li>Click "Apply" to accept.</li></ul></li></ol><p>Try it out the comment feature on this text, or start typing your own content!</p>`,
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
          inlineVisible: false, // Initialize inlineVisible
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
            // inlineVisible should not be reset here, only on creation or explicit toggle/accept
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
      if (comments[commentIdToRemove]?.inlineVisible) {
        const c = comments[commentIdToRemove];
        if (c && c.textRange && c.aiSuggestion) {
          let { from, to } = c.textRange;
          let liveFrom: number | null = null;
          let liveTo: number | null = null;
          editor.state.doc.descendants((node, pos) => {
            if (node.isText) {
              const mainMark = node.marks.find(
                (m) => m.type.name === 'commentHighlight' && m.attrs.commentId === commentIdToRemove
              );
              if (mainMark) {
                liveFrom = pos;
                liveTo = pos + node.nodeSize;
                return false;
              }
            }
            return true;
          });
          if (liveFrom !== null && liveTo !== null) {
            from = liveFrom;
            to = liveTo;
          }

          const suggestionStartPosition = to + 1;
          const suggestionEndPosition = suggestionStartPosition + c.aiSuggestion.length;
          editor
            .chain()
            .focus()
            .setTextSelection({ from: to, to: suggestionEndPosition })
            .deleteSelection()
            .setTextSelection({ from, to })
            .unsetMark('diffDel')
            .unsetMark('diffAdd')
            .run();
        }
      }

      setComments((prevComments) => {
        const updatedComments = { ...prevComments };
        delete updatedComments[commentIdToRemove];
        return updatedComments;
      });

      let markFound = false;
      let fromPos = 0;
      let toPos = 0;
      editor.state.doc.descendants((node, pos) => {
        if (markFound) return false;
        if (node.isText) {
          const commentMark = node.marks.find(
            (mark) =>
              mark.type.name === 'commentHighlight' && mark.attrs.commentId === commentIdToRemove
          );
          if (commentMark) {
            fromPos = pos;
            toPos = pos + node.nodeSize;
            markFound = true;
            return false;
          }
        }
        return true;
      });

      if (markFound) {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: fromPos, to: toPos })
          .unsetMark('commentHighlight')
          .run();
      } else {
        console.warn(
          `Could not find CommentHighlightMark for comment ${commentIdToRemove} to remove it.`
        );
      }

      editor.commands.setTextSelection(0);
      if (activeCommentId === commentIdToRemove) {
        setActiveCommentId(null);
        setCurrentInstructionInput('');
      }
    },
    [editor, comments, activeCommentId, setActiveCommentId, setComments, setCurrentInstructionInput]
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
      const instructionToLLM = `Please process the following batch request for a text editor.\nThe details of the request are in the JSON object below, marked with 'BATCH_JSON_START' and 'BATCH_JSON_END'.\nThe JSON object contains:\n1. 'editorSessionId': An ID for this editing session.\n2. 'fullDocumentWithDelineators': The complete HTML content of the document. Within this HTML, sections targeted for AI processing are marked by <span data-comment-id="COMMENT_ID_HERE" class="comment-highlight">...text...</span>. The 'COMMENT_ID_HERE' corresponds to a 'promptId' in the 'prompts' array (which is the comment.id from the editor).\n3. 'prompts': An array of objects, where each object has:\n   - 'promptId': The unique identifier for a marked section in the 'fullDocumentWithDelineators' (this is the comment.id from the editor, and it matches the 'COMMENT_ID_HERE' in the span's data-comment-id attribute).\n   - 'instruction': The specific user instruction for what to do with the 'originalText'.\n   - 'originalText': The text content of the span identified by 'promptId' (Note: The AI should find the text within the span in 'fullDocumentWithDelineators' using the data-comment-id attribute matching this promptId rather than solely relying on this 'originalText' field if context is important, as 'originalText' might be stale if the document was edited after the anchor was created but before this batch submission).\n\nYour task is to:\nFor each prompt in the 'prompts' array:\n  - Perform the requested 'instruction' on the text associated with its 'promptId' (found via the data-comment-id attribute in 'fullDocumentWithDelineators'), considering surrounding context.\n  - Generate a 'revisedText' with your suggested revision.\n  - **Important: Write the 'revisedText' as natural text with actual line breaks, quotes, and other characters as they should appear in the final document. Do not manually escape characters - the JSON parser will handle this automatically.**\n\nRespond with ONLY a single, valid JSON object (no other text, explanations, or markdown formatting before or after it) that follows this exact structure:\n{\n  "suggestions": [\n    {\n      "promptId": "PROMPT_ID_FROM_REQUEST",\n      "revisedText": "YOUR_SUGGESTED_REVISED_TEXT_HERE",\n      "status": "success",\n      "errorMessage": null\n    },\n    {\n      "promptId": "FAILED_PROMPT_ID",\n      "revisedText": null,\n      "status": "error",\n      "errorMessage": "Details about why processing failed for this item."\n    }\n  ]\n}\n\nBATCH_JSON_START\n${stringifiedPayload}\nBATCH_JSON_END\n`;
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
        instruction: c.instruction || '',
        originalText: c.selectedText,
      })),
    };
    const stringifiedPayload = JSON.stringify(batchRequestPayload);
    const instructionToLLM = `Please process the following batch request for a text editor.\nThe details of the request are in the JSON object below, marked with 'BATCH_JSON_START' and 'BATCH_JSON_END'.\nThe JSON object contains:\n1. 'editorSessionId': An ID for this editing session.\n2. 'fullDocumentWithDelineators': The complete HTML content of the document. Within this HTML, sections targeted for AI processing are marked by <span data-comment-id="COMMENT_ID_HERE" class="comment-highlight">...text...</span>. The 'COMMENT_ID_HERE' corresponds to a 'promptId' in the 'prompts' array (which is the comment.id from the editor).\n3. 'prompts': An array of objects, where each object has:\n   - 'promptId': The unique identifier for a marked section in the 'fullDocumentWithDelineators' (this is the comment.id from the editor, and it matches the 'COMMENT_ID_HERE' in the span's data-comment-id attribute).\n   - 'instruction': The specific user instruction for what to do with the 'originalText'.\n   - 'originalText': The text content of the span identified by 'promptId' (Note: The AI should find the text within the span in 'fullDocumentWithDelineators' using the data-comment-id attribute matching this promptId rather than solely relying on this 'originalText' field if context is important, as 'originalText' might be stale if the document was edited after the anchor was created but before this batch submission).\n\nYour task is to:\nFor each prompt in the 'prompts' array:\n  - Perform the requested 'instruction' on the text associated with its 'promptId' (found via the data-comment-id attribute in 'fullDocumentWithDelineators'), considering surrounding context.\n  - Generate a 'revisedText'.\n  - **Important: Write the 'revisedText' as natural text with actual line breaks, quotes, and other characters as they should appear in the final document. Do not manually escape characters - the JSON parser will handle this automatically.**\n\nRespond with ONLY a single, valid JSON object (no other text, explanations, or markdown formatting before or after it) that follows this exact structure:\n{\n  "suggestions": [\n    {\n      "promptId": "PROMPT_ID_FROM_REQUEST",\n      "revisedText": "YOUR_SUGGESTED_REVISED_TEXT_HERE",\n      "status": "success",\n      "errorMessage": null\n    },\n    {\n      "promptId": "FAILED_PROMPT_ID",\n      "revisedText": null,\n      "status": "error",\n      "errorMessage": "Details about why processing failed for this item."\n    }\n  ]\n}\n\nBATCH_JSON_START\n${stringifiedPayload}\nBATCH_JSON_END\n`;
    sendToAI({
      id: `editor-msg-${generateSimpleUUID()}`,
      role: 'user',
      created: Date.now(),
      content: [{ type: 'text', text: instructionToLLM }],
    });
  }, [editor, isAiLoading, comments, sendToAI, setComments]);

  const toggleInline = useCallback(
    (commentId: string): void => {
      const c = comments[commentId];
      if (!editor || !c || !c.aiSuggestion || !c.textRange) return;

      let currentFrom: number | null = null;
      let currentTo: number | null = null;

      editor.state.doc.descendants((node, pos) => {
        if (node.isText) {
          const mainMark = node.marks.find(
            (m) => m.type.name === 'commentHighlight' && m.attrs.commentId === commentId
          );
          if (mainMark) {
            currentFrom = pos;
            currentTo = pos + node.nodeSize;
            return false;
          }
        }
        return true;
      });

      if (currentFrom === null || currentTo === null) {
        console.warn(
          `toggleInline: Could not find live range for comment ${commentId}, falling back to stored range.`
        );
        currentFrom = c.textRange.from;
        currentTo = c.textRange.to;
        if (currentFrom === null || currentTo === null) {
          console.error('toggleInline: Stored range also null, cannot proceed.');
          return;
        }
      }

      if (!c.inlineVisible) {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: currentFrom, to: currentTo })
          .setMark('diffDel')
          .setTextSelection({ from: currentTo, to: currentTo })
          .insertContent([
            { type: 'text', text: ' ' },
            {
              type: 'text',
              text: c.aiSuggestion,
              marks: [{ type: 'diffAdd' }],
            },
          ])
          .run();
        setComments((prev) => ({
          ...prev,
          [commentId]: { ...prev[commentId], inlineVisible: true },
        }));
      } else {
        const suggestionStartPosition = currentTo + 1;
        const suggestionEndPosition = suggestionStartPosition + c.aiSuggestion.length;
        editor
          .chain()
          .focus()
          .setTextSelection({ from: currentTo, to: suggestionEndPosition })
          .deleteSelection()
          .setTextSelection({ from: currentFrom, to: currentTo })
          .unsetMark('diffDel')
          .unsetMark('diffAdd')
          .run();
        setComments((prev) => ({
          ...prev,
          [commentId]: { ...prev[commentId], inlineVisible: false },
        }));
      }
    },
    [editor, comments, setComments]
  );

  const handleAcceptSuggestion = useCallback(
    (commentIdToAccept: string) => {
      const commentToApply = comments[commentIdToAccept];
      if (
        !editor ||
        !commentToApply ||
        !commentToApply.aiSuggestion ||
        commentToApply.status !== 'suggestion_ready'
      ) {
        console.warn('Guard condition failed for accepting suggestion.');
        return;
      }

      let finalFrom = commentToApply.textRange.from;
      let finalTo = commentToApply.textRange.to;
      let liveFrom: number | null = null;
      let liveTo: number | null = null;

      editor.state.doc.descendants((node, pos) => {
        if (node.isText) {
          const mainMark = node.marks.find(
            (m) => m.type.name === 'commentHighlight' && m.attrs.commentId === commentIdToAccept
          );
          if (mainMark) {
            liveFrom = pos;
            liveTo = pos + node.nodeSize;
            return false;
          }
        }
        return true;
      });

      if (liveFrom !== null && liveTo !== null) {
        finalFrom = liveFrom;
        finalTo = liveTo;
      } else {
        console.warn(
          `handleAcceptSuggestion: Could not find live range for comment ${commentIdToAccept}, using stored range.`
        );
      }

      if (commentToApply.inlineVisible) {
        const suggestionStartPosition = finalTo;
        const suggestionEndPosition = finalTo + 1 + commentToApply.aiSuggestion.length;
        editor
          .chain()
          .focus()
          .setTextSelection({ from: suggestionStartPosition, to: suggestionEndPosition })
          .deleteSelection()
          .setTextSelection({ from: finalFrom, to: finalTo })
          .unsetMark('diffDel')
          .unsetMark('diffAdd')
          .run();
      }

      const suggestionText = commentToApply.aiSuggestion;
      if (
        finalFrom !== null &&
        finalTo !== null &&
        editor.state.doc.content.size > 0 &&
        finalFrom < editor.state.doc.content.size &&
        finalTo <= editor.state.doc.content.size
      ) {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: finalFrom, to: finalTo })
          .insertContent(suggestionText)
          .setTextSelection({ from: finalFrom, to: finalFrom + suggestionText.length })
          .unsetMark('commentHighlight')
          .run();
        setComments((prev) => ({
          ...prev,
          [commentIdToAccept]: {
            ...prev[commentIdToAccept],
            status: 'applied',
            aiSuggestion: undefined,
            instruction: prev[commentIdToAccept].instruction || '', // Add fallback to empty string
            inlineVisible: false,
            textRange: { from: finalFrom, to: finalFrom + suggestionText.length },
          },
        }));
      } else {
        console.warn(
          `handleAcceptSuggestion: Range for final replacement invalid for comment ${commentIdToAccept}`
        );
        setComments((prev) => ({
          ...prev,
          [commentIdToAccept]: {
            ...prev[commentIdToAccept],
            status: 'error',
            errorMessage: 'Failed to apply suggestion due to range issue.',
          },
        }));
      }
    },
    [editor, comments, setComments]
  );

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
                comment.id === activeCommentId ? currentInstructionInput : comment.instruction || ''
              }
              onInstructionChange={handleBubbleInstructionChange}
              onSaveInstruction={handleSaveInstructionFromBubble}
              onSendToAI={handleSendIndividualCommentToAI}
              onAcceptSuggestion={handleAcceptSuggestion}
              onToggleInline={toggleInline} // Pass the toggleInline callback
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
