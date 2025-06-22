// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/TextEditorView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorToolbar from './EditorToolbar';
import './TextEditor.css';
import { View, ViewOptions } from '../../App';
import CommentHighlightMark from './extensions/CommentHighlightMark';
import { useMessageStream } from '../../hooks/useMessageStream';
import { getApiUrl } from '../../config';
import type { Message } from '../../types/message'; // Using type import for Message
import { Comment } from './DocumentTypes';

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

// Interface for details passed from toolbar when a comment highlight is applied
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
  const [comments, setComments] = useState<Record<string, Comment>>({});
  // const [commentThreads, setCommentThreads] = useState<Record<string, CommentThread>>({}); // To be used in Step 3 (Comment Bubbles)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [currentInstructionInput, setCurrentInstructionInput] = useState<string>('');
  const [isInteractionPanelVisible, setIsInteractionPanelVisible] = useState<boolean>(false);

  const editorSessionIdRef = useRef<string>(`text-editor-session-${generateSimpleUUID()}`);

  const handleApplyCommentHighlight = (selectionDetails: SelectionDetails) => {
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
    setIsInteractionPanelVisible(true);
    // Consider if focusing the editor or a specific input is desired here
    console.log(
      'Comment highlight applied via callback and comment object created:',
      commentId,
      selectionDetails
    );
  };

  const handleAIBatchResponse = (aiResponseObject: Message, reason: string) => {
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
        // Use RegExp constructor for the regex to avoid issues with slashes in literals
        // and ensure it's treated as a string that can handle newlines if they were ever in the regex pattern itself.
        const jsonRegex = new RegExp('```json\\s*([\\s\\S]*?)\\s*```');
        const match = rawTextContent.match(jsonRegex);

        let cleanedJsonString = rawTextContent;
        if (match && match[1]) {
          cleanedJsonString = match[1].trim();
          console.log('Extracted JSON from Markdown fences:', cleanedJsonString);
        } else {
          cleanedJsonString = rawTextContent.trim();
          if (
            !(
              (cleanedJsonString.startsWith('{') && cleanedJsonString.endsWith('}')) ||
              (cleanedJsonString.startsWith('[') && cleanedJsonString.endsWith(']'))
            )
          ) {
            // Ensure this console.warn is a single line
            console.warn(
              'Response does not appear to be JSON and was not in ```json fences. Parsing as is.'
            );
          }
        }

        parsedResponse = JSON.parse(cleanedJsonString);
      } catch (e) {
        // Ensure this console.error's first string argument is a single, continuous line
        console.error(
          'Failed to parse AI response text as JSON. Expected direct JSON output from LLM or JSON within ```json fences.',
          e,
          'Original Raw response text:',
          rawTextContent
        );
      }
    } else {
      console.error(
        'AI response content is not in the expected format (single text item containing JSON string).'
      );
    }

    if (!parsedResponse || !Array.isArray(parsedResponse.suggestions)) {
      console.error(
        'Parsed AI response is invalid or no suggestions array found. Parsed object:',
        parsedResponse
      );
      setComments((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((commentId) => {
          if (updated[commentId].status === 'processing') {
            updated[commentId].status = 'error';
            updated[commentId].errorMessage =
              `AI response format error (raw text: "${rawTextContent.substring(0, 100)}...") or parse failure.`;
          }
        });
        return updated;
      });
      return;
    }

    setComments((prev) => {
      const updatedComments = { ...prev };
      parsedResponse!.suggestions.forEach((suggestion) => {
        // API still uses promptId, which corresponds to our comment.id
        if (
          updatedComments[suggestion.promptId] &&
          updatedComments[suggestion.promptId].status === 'processing'
        ) {
          if (suggestion.status === 'success') {
            updatedComments[suggestion.promptId].status = 'suggestion_ready'; // Changed from 'suggestion_available'
            updatedComments[suggestion.promptId].aiSuggestion =
              suggestion.revisedText || 'No revision suggested.';
            updatedComments[suggestion.promptId].errorMessage = undefined;
          } else {
            updatedComments[suggestion.promptId].status = 'error';
            updatedComments[suggestion.promptId].errorMessage =
              suggestion.errorMessage || 'AI processing failed for this item.';
            updatedComments[suggestion.promptId].aiSuggestion = undefined;
          }
        } else if (
          updatedComments[suggestion.promptId] &&
          updatedComments[suggestion.promptId].status !== 'processing'
        ) {
          console.warn(
            `Received suggestion for comment.id (as promptId) ${suggestion.promptId} which was not in 'processing' state. Current status: ${updatedComments[suggestion.promptId].status}`
          );
        } else if (!updatedComments[suggestion.promptId]) {
          console.warn(
            `Received suggestion for unknown comment.id (as promptId) ${suggestion.promptId}.`
          );
        }
      });
      Object.keys(updatedComments).forEach((commentId) => {
        // Renamed promptId to commentId for clarity
        if (
          updatedComments[commentId].status === 'processing' &&
          !parsedResponse!.suggestions.find((s) => s.promptId === commentId) // s.promptId is the comment.id
        ) {
          updatedComments[commentId].status = 'error';
          updatedComments[commentId].errorMessage =
            'AI response received, but this specific item was not included in the suggestions.';
        }
      });
      return updatedComments;
    });
  };

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

  useEffect(() => {
    if (aiError) {
      console.error('useMessageStream Error reported:', aiError);
      let errorMessage = 'useMessageStream error';
      if (typeof aiError === 'string') {
        errorMessage = aiError;
      } else if (aiError instanceof Error) {
        errorMessage = aiError.message;
      }

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

  const editor = useEditor({
    extensions: [StarterKit, CommentHighlightMark],
    content: `<h2>Hi there,</h2><p>this is a <em>basic</em> example of <strong>tiptap</strong>.</p><p>Select some text and click the speech bubble with a plus to add an AI prompt. Then type your instruction in the panel below and save it. You can add multiple prompts. Finally, click "Send to AI" in the toolbar.</p>`,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl m-5 focus:outline-none',
      },
    },
    onSelectionUpdate: ({ editor: currentEditor }: { editor: Editor }) => {
      const { selection } = currentEditor.state;
      const isActiveHighlight = currentEditor.isActive('commentHighlight');

      if (isActiveHighlight && !selection.empty) {
        const attrs = currentEditor.getAttributes('commentHighlight');
        const currentCommentId = attrs.commentId as string;

        if (currentCommentId && comments[currentCommentId]) {
          // An existing comment highlight is selected, load its data for the panel
          setActiveCommentId(currentCommentId);
          setCurrentInstructionInput(comments[currentCommentId].instruction || '');
          setIsInteractionPanelVisible(true);
        } else if (currentCommentId && !comments[currentCommentId]) {
          // A highlight mark exists but its comment data is missing in state.
          // This might indicate an orphaned mark or a state inconsistency.
          console.warn(
            `Orphaned commentHighlight mark detected with ID: ${currentCommentId}. Clearing active state.`
          );
          setActiveCommentId(null);
          setIsInteractionPanelVisible(false); // Hide panel if inconsistent state detected
        }
        // If currentCommentId is null/undefined from attrs, do nothing (should not happen if isActiveHighlight is true)
      } else {
        // If no highlight is active, or selection is empty, consider if panel should be hidden.
        // For now, only explicit actions (like cancel button) will hide the panel.
        // setActiveCommentId(null); // Optionally clear active ID if nothing is highlighted
        // setIsInteractionPanelVisible(false); // Optionally hide panel
      }
    },
  });

  const handleSaveInstruction = () => {
    if (!activeCommentId || !editor) return;
    setComments((prev) => {
      const existingComment = prev[activeCommentId];
      if (!existingComment) {
        console.error(
          `Attempted to save instruction for non-existent commentId: ${activeCommentId}`
        );
        return prev; // Or handle error appropriately
      }
      return {
        ...prev,
        [activeCommentId]: {
          ...existingComment,
          instruction: currentInstructionInput,
          status: 'pending', // Instruction is saved, comment remains pending for processing
          timestamp: new Date(), // Update timestamp on modification
        },
      };
    });
    console.log(
      'Instruction saved for commentId:',
      activeCommentId,
      'Instruction:',
      currentInstructionInput
    );
  };

  const handleCancelInteraction = () => {
    setIsInteractionPanelVisible(false);
    setActiveCommentId(null);
    setCurrentInstructionInput('');
    if (editor) editor.chain().focus().run();
  };

  const handleAcceptSuggestion = (commentIdToAccept: string) => {
    if (!editor || !commentIdToAccept) return;

    const commentToApply = comments[commentIdToAccept];
    if (
      !commentToApply ||
      !commentToApply.aiSuggestion ||
      commentToApply.status !== 'suggestion_ready'
    ) {
      console.warn(
        'No suggestion available or comment not in correct state for comment.id:',
        commentIdToAccept
      );
      return;
    }

    const suggestionText = commentToApply.aiSuggestion;
    let markFoundAndReplaced = false;
    let fromPos: number | null = null;
    let toPos: number | null = null;

    // The existing AIPromptAnchorMark uses `promptId` in its attributes.
    // For now, we assume commentIdToAccept is the value stored in mark.attrs.promptId.
    // This will be updated when AIPromptAnchorMark is replaced by CommentHighlightMark.
    editor.state.doc.descendants((node, pos) => {
      if (markFoundAndReplaced) return false;

      if (node.isText) {
        const marks = node.marks.filter(
          (mark) =>
            mark.type.name === 'commentHighlight' && mark.attrs.commentId === commentIdToAccept
        );

        if (marks.length > 0) {
          fromPos = pos;
          toPos = pos + node.nodeSize;
          markFoundAndReplaced = true;
          return false;
        }
      }
      return true;
    });

    if (markFoundAndReplaced && fromPos !== null && toPos !== null) {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: fromPos, to: toPos })
        .insertContent(suggestionText)
        .run();

      setComments((prev) => {
        const updatedComment = {
          ...prev[commentIdToAccept],
          status: 'applied' as const,
          aiSuggestion: undefined,
          // errorMessage can remain or be cleared, depending on desired logic for reapplying after error.
        };
        return {
          ...prev,
          [commentIdToAccept]: updatedComment,
        };
      });
      console.log('Suggestion applied for comment.id:', commentIdToAccept);
    } else {
      console.warn(
        'Could not find the CommentHighlightMark in the document for comment.id:',
        commentIdToAccept
      );
      /* ---- TEMPORARILY COMMENTED OUT FOR DEBUGGING TS2367 ----
      if (commentToApply.status !== 'applied') { 
        setComments((prev) => ({
          ...prev,
          [commentIdToAccept]: {
            ...prev[commentIdToAccept],
            status: 'error',
            errorMessage: 'Failed to find text in editor to apply suggestion. Text might have been altered or deleted.',
          },
        }));
      }
      */ // ---- END OF TEMPORARY COMMENT ----
    }
  };

  useEffect(() => {
    if (activeCommentId && comments[activeCommentId] && isInteractionPanelVisible) {
      setCurrentInstructionInput(comments[activeCommentId].instruction || '');
    } else if (!isInteractionPanelVisible) {
      setActiveCommentId(null); // Clear active comment when panel is hidden
      setCurrentInstructionInput('');
    }
  }, [activeCommentId, comments, isInteractionPanelVisible]);

  // useEffect for logging comments state when it changes
  useEffect(() => {
    console.log('Comments state updated:', JSON.stringify(comments, null, 2));
  }, [comments]);

  const handleTriggerAIBatchProcessing = () => {
    if (!editor || isAiLoading) return;

    // Filter comments that are pending and have an instruction
    const commentsToProcessArray = Object.values(comments).filter(
      (c) => c.status === 'pending' && c.instruction && c.instruction.trim() !== ''
    );

    if (commentsToProcessArray.length === 0) {
      console.log('No comments with instructions ready to send to AI.');
      return;
    }

    // Set status to 'processing' for these comments
    setComments((prev) => {
      const updatedComments = { ...prev };
      commentsToProcessArray.forEach((comment) => {
        if (updatedComments[comment.id]) {
          updatedComments[comment.id].status = 'processing';
        }
      });
      return updatedComments;
    });

    const fullDocumentContent = editor.getHTML();
    const batchRequestPayload: AIBatchTextRevisionRequest = {
      editorSessionId: editorSessionIdRef.current,
      fullDocumentWithDelineators: fullDocumentContent,
      prompts: commentsToProcessArray.map((comment) => ({
        promptId: comment.id, // API expects promptId, we use our comment.id
        instruction: comment.instruction,
        originalText: comment.selectedText, // Use selectedText from Comment interface
      })),
    };

    const stringifiedPayload = JSON.stringify(batchRequestPayload);
    // The instructionToLLM string remains largely the same as it describes the API contract.
    // Just ensure it aligns with the fact that promptId from the API maps to our comment.id.
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
    // ... more suggestion objects ...
    // If processing for a specific promptId fails, return it with status: "error" and an errorMessage.
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
      'Attempting to send structured prompt with stringified payload to AI:',
      instructionToLLM
    );
    sendToAI({
      id: `editor-msg-${generateSimpleUUID()}`,
      role: 'user',
      created: Date.now(),
      content: [{ type: 'text', text: instructionToLLM }],
    });
  };

  const getToolbar = () => {
    if (!editor) return null;
    return (
      <EditorToolbar
        editor={editor}
        setView={setView}
        comments={comments}
        onApplyCommentHighlight={handleApplyCommentHighlight} // Added new prop
        onSendAllToAI={handleTriggerAIBatchProcessing}
        isAiLoading={isAiLoading}
      />
    );
  };

  // Determine if the instruction input area should be shown
  let shouldShowInstructionArea = false;
  if (activeCommentId && comments[activeCommentId]) {
    const status = comments[activeCommentId].status;
    shouldShowInstructionArea =
      status === 'pending' ||
      status === 'processing' || // Textarea will be disabled via its own prop if processing
      status === 'error';
  }

  return (
    <div className="text-editor-container" style={{ paddingTop: '38px' }}>
      {getToolbar()}
      <EditorContent editor={editor} className="editor-content-area" />
      {isInteractionPanelVisible && activeCommentId && comments[activeCommentId] && (
        <div
          className="ai-prompt-input-area"
          style={{
            padding: '15px',
            borderTop: '1px solid #ddd',
            background: '#f9f9f9',
            marginTop: '10px',
            position: 'relative',
            zIndex: 20,
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
            AI Interaction for: <code>{activeCommentId}</code>
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
            Original Text: <strong>"{comments[activeCommentId]?.selectedText}"</strong>
          </div>
          {/* Only show instruction input based on refined logic */}
          {shouldShowInstructionArea && (
            <>
              <textarea
                value={currentInstructionInput}
                onChange={(e) => setCurrentInstructionInput(e.target.value)}
                placeholder="Enter your instruction for the AI..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  margin: '10px 0',
                  boxSizing: 'border-box',
                }}
                disabled={isAiLoading && comments[activeCommentId]?.status === 'processing'}
                aria-label="AI Instruction Input"
              />
              <button
                onClick={handleSaveInstruction}
                style={{
                  padding: '8px 12px',
                  marginRight: '10px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                disabled={
                  !currentInstructionInput.trim() ||
                  (isAiLoading && comments[activeCommentId]?.status === 'processing')
                }
              >
                Save Instruction
              </button>
            </>
          )}
          {comments[activeCommentId]?.status === 'processing' && (
            <span style={{ fontStyle: 'italic' }}>Processing with AI...</span>
          )}

          {comments[activeCommentId]?.status === 'suggestion_ready' &&
            comments[activeCommentId]?.aiSuggestion && (
              <div style={{ marginTop: '15px', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
                <h5>AI Suggestion:</h5>
                <div
                  style={{
                    background: '#e6f7ff',
                    padding: '10px',
                    border: '1px solid #91d5ff',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '150px',
                    overflowY: 'auto',
                  }}
                >
                  {comments[activeCommentId]?.aiSuggestion}
                </div>
                <button
                  onClick={() => handleAcceptSuggestion(activeCommentId!)}
                  style={{
                    padding: '8px 12px',
                    marginRight: '10px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  disabled={isAiLoading || comments[activeCommentId!]?.status === 'processing'}
                >
                  Accept Suggestion
                </button>
              </div>
            )}
          {comments[activeCommentId]?.status === 'applied' && (
            <div style={{ marginTop: '15px', color: 'green', fontWeight: 'bold' }}>
              Suggestion applied!
            </div>
          )}
          {comments[activeCommentId]?.status === 'error' && (
            <div style={{ marginTop: '15px', color: 'red' }}>
              Error: {comments[activeCommentId]?.errorMessage || 'An unknown error occurred.'}
            </div>
          )}
          <p style={{ fontSize: '0.8em', color: '#777', marginTop: '10px', marginBottom: '0' }}>
            Status: {comments[activeCommentId]?.status}
          </p>
        </div>
      )}
    </div>
  );
};

export default TextEditorView;
