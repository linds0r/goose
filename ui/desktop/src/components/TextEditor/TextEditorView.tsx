// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/TextEditorView.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Node as PMNode } from 'prosemirror-model';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from './extensions/TextStyle';
import { Underline } from './extensions/Underline';
import { TextAlign } from './extensions/TextAlign';
import { Highlight } from './extensions/Highlight';
import { Link } from './extensions/Link';
import EditorToolbar from './EditorToolbar';
import './TextEditor.css';
import { View, ViewOptions } from '../../App';
import CommentHighlightMark from './extensions/CommentHighlightMark';
import StrikethroughDiffMark from './extensions/StrikethroughDiffMark';
import BoldItalicAddMark from './extensions/BoldItalicAddMark';
import { GoogleDocsEnterBehavior } from './extensions/GoogleDocsEnterBehavior';
import { FontSize } from './extensions/FontSize';
import { FontFamily } from './extensions/FontFamily';
import { TextColor } from './extensions/TextColor';
import { Superscript } from './extensions/Superscript';
import { Subscript } from './extensions/Subscript';
import { ClearFormatting } from './extensions/ClearFormatting';
import { LineSpacing } from './extensions/LineSpacing';
import { TextTransform } from './extensions/TextTransform';
import { useMessageStream } from '../../hooks/useMessageStream';
import { getApiUrl } from '../../config';
import type { Message } from '../../types/message';
import { Comment, Reply, AIThreadRequest } from './DocumentTypes';
import CommentBubble from './CommentBubble';

// Walk the ProseMirror document and return real positions for the first occurrence of `searchText`.
const findTextRangeInPM = (
  pmDoc: PMNode,
  searchText: string
): { from: number; to: number } | null => {
  if (!searchText) return null;
  let found: { from: number; to: number } | null = null;

  pmDoc.descendants((node, pos) => {
    if (found) return false; // early-exit if already found
    if (!node.isText) return true;
    const text = node.text || '';
    const idx = text.indexOf(searchText);
    if (idx !== -1) {
      // `pos` is the starting position of the current text node within the document.
      // Text node positions are relative to the start of the document.
      found = { from: pos + idx, to: pos + idx + searchText.length };
      return false;
    }
    return true;
  });

  return found;
};

const generateSimpleUUID = () => `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

interface AIBatchTextRevisionRequest {
  editorSessionId: string;
  fullDocumentWithDelineators: string;
  prompts: Array<{
    promptId: string;
    instruction: string;
    originalText: string;
  }>;
  requestType?: 'collaboration' | 'batch_comments' | 'single_comment';
}

interface AISuggestionItem {
  promptId: string;
  originalText?: string; // For AI-initiated suggestions, this is the text AI identified
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

const AI_RESPONSE_FORMAT_INSTRUCTION = `
CRITICAL: Your entire response MUST be a single, valid JSON object and nothing else.
Do not include any greetings, apologies, conversational text, or any markdown code fences (such as three backticks followed by the word 'json') outside of this JSON object.
The JSON object MUST strictly follow this exact structure:
{
  "suggestions": [
    {
      "promptId": "PROMPT_ID_FROM_REQUEST_OR_NEW_AI_GENERATED_ID",
      "originalText": "TEXT_AI_IDENTIFIED_FOR_CHANGE (only if AI-initiated suggestion during collaboration)",
      "revisedText": "YOUR_SUGGESTED_REVISED_TEXT_HERE (or null if error)",
      "explanation": "BRIEF_EXPLANATION_OF_CHANGE (optional, especially for AI-initiated suggestions)",
      "status": "success", 
      "errorMessage": null
    },
    // ... more suggestions
  ]
}

Specific Instructions for 'requestType: "collaboration"':
- When you identify a specific piece of text in the document that needs revision (e.g., a typo, grammar fix, rephrasing for clarity):
  1. Generate a NEW, UNIQUE 'promptId' for this specific suggestion (e.g., "ai-collab-suggestion-<timestamp>-<random_string>"). Do NOT reuse the 'promptId' from the original collaboration request for these specific textual changes.
  2. You MUST include the 'originalText' field, containing the EXACT text snippet from the document that you are suggesting to change.
  3. Provide the 'revisedText' for that snippet.
  4. Optionally, provide an 'explanation' for your suggestion.
- Your response should be an array under the "suggestions" key, where each item is a specific, actionable suggestion formatted as described above.
- If no specific textual changes are found, you can return an empty "suggestions" array or a single suggestion object linked to the original collaboration 'promptId' with a status and an overall 'explanation' (e.g., "No specific revisions identified at this time.").

For other request types ('batch_comments', 'single_comment'):
- The 'promptId' in your suggestion MUST match a 'promptId' from the input 'prompts' array.
- The 'originalText' field is not expected from you in the response for these types, as the frontend already knows the original selected text.
- Perform the requested 'instruction' on the text associated with its 'promptId' (found via the data-comment-id attribute in 'fullDocumentWithDelineators'), considering surrounding context.
- Generate a 'revisedText' with your suggested revision.

General Formatting:
- **Important: Write the 'revisedText' as natural text with actual line breaks, quotes, and other characters as they should appear in the final document. Do not manually escape characters - the JSON parser will handle this automatically.**
`;

const constructAIInstruction = (payload: AIBatchTextRevisionRequest): string => {
  const stringifiedPayload = JSON.stringify(payload);
  const collaborationSpecificPreamble =
    payload.requestType === 'collaboration'
      ? `This is a 'collaboration' request. Please review the entire document. For EACH specific textual change you identify (e.g., grammar, spelling, clarity), follow the 'collaboration' output guidelines in the CRITICAL JSON structure section below: provide a NEW unique 'promptId', the EXACT 'originalText' you're targeting, and your 'revisedText'.`
      : `This is a '${payload.requestType}' request. For each prompt in the input, provide a suggestion linked to the original 'promptId'.`;

  return `Please process the following batch request for a text editor.
${collaborationSpecificPreamble}
The details of the request are in the JSON object below, marked with 'BATCH_JSON_START' and 'BATCH_JSON_END'.
The JSON object contains:
1. 'editorSessionId': An ID for this editing session.
2. 'fullDocumentWithDelineators': The complete HTML content of the document. For 'batch_comments' or 'single_comment', sections targeted for AI processing are marked by <span data-comment-id="COMMENT_ID_HERE" class="comment-highlight">...text...</span>. The 'COMMENT_ID_HERE' corresponds to a 'promptId' in the 'prompts' array. For 'collaboration', you should analyze the whole document content.
3. 'prompts': An array of objects.
   - For 'batch_comments'/'single_comment': Each object has 'promptId', 'instruction', 'originalText'.
   - For 'collaboration': This array will contain one initial prompt for the overall collaboration task. You should generate NEW promptIds for specific suggestions you make.
4. 'requestType': Indicates the nature of the request: '${payload.requestType}'.

Your task is to:
${AI_RESPONSE_FORMAT_INSTRUCTION}

BATCH_JSON_START
${stringifiedPayload}
BATCH_JSON_END
`;
};

// AI instruction helpers for thread conversations
const constructThreadAIInstruction = (
  request: AIThreadRequest
): { role: 'user'; content: string } => {
  const instruction = `
You are helping with a threaded conversation about a specific text section in a document.

CONTEXT:
- Original text: "${request.originalText}"
- Original instruction: "${request.originalInstruction}"
- Document context: "${request.documentContext}"

CONVERSATION HISTORY:
${request.threadHistory
  .map((reply) => `${reply.role === 'user' ? 'User' : 'AI'}: ${reply.text}`)
  .join('\n')}

NEW USER QUERY: "${request.userQuery}"

Please provide a helpful response that:
1. Addresses the user's specific question
2. Maintains context from the conversation history
3. References the original text and instruction when relevant
4. Provides actionable guidance

Respond in a conversational, helpful tone as if you're collaborating with the user.
`;

  return {
    role: 'user' as const,
    content: instruction,
  };
};

const TextEditorView: React.FC<TextEditorViewProps> = ({ setView }) => {
  const [comments, setComments] = useState<Record<string, Comment>>({});
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [currentInstructionInput, setCurrentInstructionInput] = useState<string>('');
  const [isInteractionPanelVisible, setIsInteractionPanelVisible] = useState<boolean>(false); // May deprecate if bubbles are full replacement
  const [isBubbleFocused, setIsBubbleFocused] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(350); // New state for sidebar width
  const [isResizing, setIsResizing] = useState<boolean>(false); // New state for resize mode

  const editorSessionIdRef = useRef<string>(`text-editor-session-${generateSimpleUUID()}`);

  // Handle sidebar resizing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      // Set min/max width constraints
      const minWidth = 250;
      const maxWidth = 800;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      setSidebarWidth(constrainedWidth);
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure paragraph behavior to match Google Docs
        paragraph: {
          HTMLAttributes: {
            class: 'google-docs-paragraph',
          },
        },
        // Configure heading behavior
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
          HTMLAttributes: {
            class: 'google-docs-heading',
          },
        },
        // Configure list behavior
        bulletList: {
          HTMLAttributes: {
            class: 'google-docs-bullet-list',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'google-docs-ordered-list',
          },
        },
        // Configure blockquote behavior
        blockquote: {
          HTMLAttributes: {
            class: 'google-docs-blockquote',
          },
        },
      }),
      TextStyle,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
        },
      }),
      CommentHighlightMark,
      StrikethroughDiffMark,
      BoldItalicAddMark,
      GoogleDocsEnterBehavior,
      FontSize,
      FontFamily,
      TextColor,
      Superscript,
      Subscript,
      ClearFormatting,
      LineSpacing,
      TextTransform,
    ],
    content: `<h2>Goose Text Editor</h2><p>Create documents with integrated AI using comment bubbles instead of a chatbot.</p><p><strong>Using the AI:</strong></p><p>To use the AI assistant, simply write your content in the document and add comments where you want AI help. When you add a comment, you can ask the AI to generate new content, revise existing text, or provide suggestions for that specific location. The AI will respond within the comment bubble, and you can choose whether to keep, modify, or delete both your original text and the AI's suggestions. You have full control over what stays in your document.</p><p><strong>Using AI for Revision:</strong></p><ol><li><strong>Select Text:</strong> Highlight text for AI revision.</li><li><strong>Add Comment:</strong> Attach your instruction (e.g., "Shorten," "Make persuasive").</li><li><strong>Process & Review:</strong><ul><li>Submit comments.</li><li>AI suggestions appear in the comment bubble.</li><li>Preview with "Show Inline": <s>original text</s>, <strong><em>new text</em></strong>.</li><li>Click "Apply" to accept.</li></ul></li></ol><p><strong>Test the bullet list:</strong></p><ul><li>First bullet point</li><li>Second bullet point</li><li>Third bullet point</li></ul><p>Try it out the comment feature on this text, or start typing your own content!</p>`,
    editorProps: {
      attributes: {
        class: 'google-docs-editor focus:outline-none',
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
            // handleSetActiveComment(commentIdFromDocument); // Defer to explicit bubble click
          }
        } else if (commentIdFromDocument && !comments[commentIdFromDocument]) {
          console.warn(
            `onSelectionUpdate: Orphaned commentHighlight mark: ${commentIdFromDocument}.`
          );
        }
      }
    },
  });

  const handleSetActiveComment = useCallback(
    (commentId: string | null) => {
      setActiveCommentId(commentId);
      if (commentId && comments[commentId]) {
        setCurrentInstructionInput(comments[commentId].instruction || '');
        setIsInteractionPanelVisible(false); // Assuming bubbles replace this
        setIsBubbleFocused(true);
      } else {
        setIsBubbleFocused(false);
      }
    },
    [comments] // Simplified dependencies
  );

  const handleAIBatchResponse = useCallback(
    (aiResponseObject: Message, _reason: string, currentEditorInstance?: Editor | null) => {
      // Get the response text content
      const rawTextContent =
        aiResponseObject?.content?.[0]?.type === 'text' ? aiResponseObject.content[0].text : '';

      // Check if this is a thread reply response - handle completely separately
      const metadata = aiResponseObject.metadata;
      const isThreadReply = metadata?.requestType === 'thread_reply';
      const isAskGoose = metadata?.requestType === 'ask_goose';

      // Also check if content looks like conversational text (not JSON) as backup detection
      const looksLikeJSON =
        rawTextContent.trim().startsWith('{') ||
        rawTextContent.trim().startsWith('[') ||
        rawTextContent.includes('```json');
      const isLikelyConversational =
        !looksLikeJSON &&
        rawTextContent.length > 50 &&
        !rawTextContent.includes('"suggestions"') &&
        !rawTextContent.includes('"promptId"');

      // Handle Ask Goose responses (conversational, not JSON)
      if (isAskGoose) {
        const commentId = metadata?.commentId;
        const askGooseResponse = rawTextContent;

        if (commentId && askGooseResponse) {
          setComments((prev) => {
            const updated = { ...prev };
            if (updated[commentId]) {
              updated[commentId] = {
                ...updated[commentId],
                status: 'suggestion_ready',
                aiSuggestion: askGooseResponse,
                explanation: 'Goose Response',
              };
            }
            return updated;
          });
        }
        return; // Exit early for Ask Goose responses
      }

      // If metadata is missing but content looks conversational, we need to find the commentId differently
      // This is a fallback for when metadata gets lost in the pipeline
      if (isThreadReply || (isLikelyConversational && !metadata)) {
        // Handle thread reply response - expect conversational text, not JSON
        let commentId = metadata?.commentId;

        // If we don't have commentId from metadata, we need to find it another way
        // Look for comments that have pending replies (indicating an active thread conversation)
        if (!commentId && isLikelyConversational) {
          const commentsWithPendingReplies = Object.values(comments).filter(
            (comment) =>
              comment.replies && comment.replies.some((reply) => reply.status === 'pending')
          );

          if (commentsWithPendingReplies.length === 1) {
            commentId = commentsWithPendingReplies[0].id;
          } else if (commentsWithPendingReplies.length > 1) {
            // If multiple pending, use the most recent one
            const mostRecent = commentsWithPendingReplies.reduce((latest, current) => {
              const currentActivity = current.lastActivity || new Date(0);
              const latestActivity = latest.lastActivity || new Date(0);
              return currentActivity > latestActivity ? current : latest;
            });
            commentId = mostRecent.id;
          } else {
            // Fallback: look for any comment with replies (maybe status got updated already)
            const commentsWithAnyReplies = Object.values(comments).filter(
              (comment) => comment.replies && comment.replies.length > 0
            );
            if (commentsWithAnyReplies.length > 0) {
              const mostRecent = commentsWithAnyReplies.reduce((latest, current) => {
                const currentActivity = current.lastActivity || new Date(0);
                const latestActivity = latest.lastActivity || new Date(0);
                return currentActivity > latestActivity ? current : latest;
              });
              commentId = mostRecent.id;
            } else {
              // Final fallback: if there's only one comment and we're getting a conversational response,
              // it's very likely meant for that comment
              const allComments = Object.values(comments);
              if (allComments.length === 1) {
                commentId = allComments[0].id;
              }
            }
          }
        }

        const aiReplyText = rawTextContent;

        if (commentId && aiReplyText) {
          const aiReply: Reply = {
            id: generateSimpleUUID(),
            role: 'assistant',
            text: aiReplyText,
            timestamp: new Date(),
          };

          setComments((prev) => {
            const updated = { ...prev };
            if (updated[commentId]) {
              updated[commentId] = {
                ...updated[commentId],
                replies: [
                  // Update user reply status to 'sent'
                  ...updated[commentId].replies.map((reply) =>
                    reply.status === 'pending' ? { ...reply, status: 'sent' as const } : reply
                  ),
                  // Add AI reply
                  aiReply,
                ],
                lastActivity: new Date(),
              };
            }
            return updated;
          });
        } else {
          // Even if we can't find the commentId, don't try to parse as JSON
          return;
        }
        return; // Exit early for thread replies - don't process as JSON
      }

      // Continue with existing batch response logic for non-thread requests
      let parsedResponse: AIBatchTextRevisionResponse | null = null;

      if (rawTextContent) {
        try {
          // First, try to find JSON in ```json fences
          const jsonRegex = new RegExp('```json\\s*([\\s\\S]*?)\\s*```');
          const match = rawTextContent.match(jsonRegex);
          let cleanedJsonString = rawTextContent;

          if (match && match[1]) {
            cleanedJsonString = match[1].trim();
          } else {
            // If no fences, look for JSON object in the text
            cleanedJsonString = rawTextContent.trim();
            
            // Check if it starts with explanatory text before JSON
            if (!cleanedJsonString.startsWith('{') && !cleanedJsonString.startsWith('[')) {
              // Try to find the first JSON object in the text
              const jsonStartIndex = cleanedJsonString.indexOf('{');
              if (jsonStartIndex !== -1) {
                // Extract from the first { to the end, then find the matching }
                const fromFirstBrace = cleanedJsonString.substring(jsonStartIndex);
                let braceCount = 0;
                let jsonEndIndex = -1;
                
                for (let i = 0; i < fromFirstBrace.length; i++) {
                  if (fromFirstBrace[i] === '{') {
                    braceCount++;
                  } else if (fromFirstBrace[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                      jsonEndIndex = i + 1;
                      break;
                    }
                  }
                }
                
                if (jsonEndIndex !== -1) {
                  cleanedJsonString = fromFirstBrace.substring(0, jsonEndIndex);
                }
              } else {
                console.warn(
                  'Response does not appear to be JSON and was not in ```json fences. Will attempt to parse as is.',
                  cleanedJsonString
                );
              }
            }
          }
          console.log('Attempting to parse this JSON string:', cleanedJsonString);
          parsedResponse = JSON.parse(cleanedJsonString);
        } catch (e) {
          console.error('Failed to parse AI response as JSON.', e, 'Raw text:', rawTextContent);
          setComments((prev) => {
            const updated = { ...prev };
            Object.keys(updated).forEach((commentId) => {
              if (updated[commentId].status === 'processing') {
                updated[commentId].status = 'error';
                updated[commentId].errorMessage =
                  `AI response JSON parsing failed. Raw: ${rawTextContent.substring(0, 150)}...`;
              }
            });
            return updated;
          });
          return;
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
                `AI response format error or no suggestions. Raw: ${rawTextContent.substring(0, 100)}...`;
            }
          });
          return updated;
        });
        return;
      }

      const activeEditor = currentEditorInstance || editor;

      parsedResponse.suggestions.forEach((suggestion) => {
        const { promptId, originalText, revisedText, explanation, status, errorMessage } =
          suggestion;

        setComments((prevComments) => {
          const updatedComments = { ...prevComments };

          if (updatedComments[promptId] && updatedComments[promptId].status === 'processing') {
            if (status === 'success') {
              updatedComments[promptId].status = 'suggestion_ready';
              updatedComments[promptId].aiSuggestion = revisedText || 'No revision suggested.';
              updatedComments[promptId].explanation = explanation; // Store explanation separately
              updatedComments[promptId].errorMessage = undefined;
            } else {
              updatedComments[promptId].status = 'error';
              updatedComments[promptId].errorMessage = errorMessage || 'AI processing failed.';
            }
          } else if (
            !updatedComments[promptId] &&
            originalText &&
            revisedText &&
            activeEditor &&
            !activeEditor.isDestroyed
          ) {
            const range = findTextRangeInPM(activeEditor.state.doc, originalText);
            const newComment: Comment = {
              id: promptId,
              textRange: range,
              selectedText: originalText,
              instruction: explanation || 'AI Suggested Revision',
              status: status === 'success' ? 'suggestion_ready' : 'error',
              aiSuggestion: revisedText,
              explanation: explanation, // Store explanation separately
              timestamp: new Date(),
              inlineVisible: false,
              needsMarkApplied: !!range,
              errorMessage:
                status === 'error' ? errorMessage || 'Error in AI suggestion' : undefined,
              replies: [], // Initialize empty replies array
              isThreadExpanded: false, // Initialize thread state
              lastActivity: new Date(), // Initialize activity tracking
            };
            updatedComments[promptId] = newComment;
            if (range) {
              console.log(
                `New AI collab suggestion '${promptId}' created for text: "${originalText}" at range ${range.from}-${range.to}`
              );
            } else {
              console.warn(
                `AI suggestion's originalText "${originalText}" not found for new promptId ${promptId}. Comment created without range.`
              );
            }
          } else if (
            updatedComments[promptId] &&
            updatedComments[promptId].status !== 'processing'
          ) {
            console.warn(
              `Received suggestion for comment ${promptId} which is not in 'processing' state. Current state: ${updatedComments[promptId].status}. Suggestion was: `,
              suggestion
            );
          } else if (!updatedComments[promptId]) {
            console.log(
              `AI Collaboration: Received new suggestion with promptId ${promptId} but it could not be processed as a new comment (e.g. missing originalText). Suggestion: `,
              suggestion
            );
          }
          return updatedComments;
        });
      });

      setTimeout(() => {
        setComments((prevComments) => {
          // No longer need to specifically delete the originalCollabPromptId as it wasn't added to comments state.
          // We just need to mark any genuinely unprocessed items (not part of AI's suggestions) as error.
          let updatedComments = { ...prevComments };
          let madeChanges = false;

          const stillProcessingIds = Object.keys(updatedComments).filter(
            (id) => updatedComments[id]?.status === 'processing'
          );

          if (stillProcessingIds.length > 0) {
            stillProcessingIds.forEach((commentId) => {
              // If this commentId was part of the current batch sent but didn't get a suggestion back
              if (!parsedResponse?.suggestions.find((s) => s.promptId === commentId)) {
                if (
                  updatedComments[commentId] &&
                  updatedComments[commentId].status === 'processing'
                ) {
                  updatedComments[commentId].status = 'error';
                  updatedComments[commentId].errorMessage =
                    "Item not present in AI's current suggestions list (no response for this promptId).";
                  madeChanges = true;
                }
              }
            });
          }
          return madeChanges ? updatedComments : prevComments;
        });
      }, 0);
    },
    [editor, setComments, comments] // ✅ Added comments dependency to fix stale state
  );

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
    onFinish: (message, reason) => handleAIBatchResponse(message, reason, editor),
  });

  // useEffect to apply marks for new AI-generated comments
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const commentsThatNeedMarks = Object.values(comments).filter(
      (c) => c.needsMarkApplied && c.textRange
    );

    if (commentsThatNeedMarks.length > 0) {
      const tr = editor.state.tr;
      let transactionModified = false;

      commentsThatNeedMarks.forEach((comment) => {
        if (comment.textRange) {
          try {
            let markAlreadyExists = false;
            editor.state.doc.nodesBetween(
              comment.textRange.from,
              comment.textRange.to,
              (node, pos, _parent, _index) => {
                if (
                  node.marks.some(
                    (mark) =>
                      mark.type.name === 'commentHighlight' && mark.attrs.commentId === comment.id
                  )
                ) {
                  if (
                    pos <= comment.textRange!.from &&
                    pos + node.nodeSize >= comment.textRange!.to
                  ) {
                    markAlreadyExists = true;
                    return false; // Stop iteration: mark already exists and covers the range
                  }
                }
                return true; // Continue iteration if mark not found or condition not met
              }
            );

            if (!markAlreadyExists) {
              tr.addMark(
                comment.textRange.from,
                comment.textRange.to,
                editor.schema.marks.commentHighlight.create({
                  commentId: comment.id,
                  class: 'comment-highlight',
                })
              );
              transactionModified = true;
              console.log(
                `Applied mark for AI comment ${comment.id} at ${comment.textRange.from}-${comment.textRange.to}`
              );
            } else {
              console.log(
                `Mark for AI comment ${comment.id} at ${comment.textRange.from}-${comment.textRange.to} considered already applied.`
              );
            }
          } catch (e) {
            console.error(`Error applying mark for comment ${comment.id}:`, e, comment.textRange);
          }
        }
      });

      if (transactionModified) {
        editor.view.dispatch(tr);
      }

      setComments((prevComments) => {
        const updated = { ...prevComments };
        let commentsWereUpdated = false;
        commentsThatNeedMarks.forEach((comment) => {
          if (updated[comment.id] && updated[comment.id].needsMarkApplied) {
            updated[comment.id] = { ...updated[comment.id], needsMarkApplied: false };
            commentsWereUpdated = true;
          }
        });
        return commentsWereUpdated ? updated : prevComments;
      });
    }
  }, [comments, editor, setComments]);

  const handleTriggerAICollaboration = useCallback(() => {
    if (!editor || isAiLoading) return;

    const fullDocumentContent = editor.getHTML();
    const collaborationPromptId = `collab-${generateSimpleUUID()}`; // Still useful for tracking the request itself if needed

    const collaborationPayload: AIBatchTextRevisionRequest = {
      editorSessionId: editorSessionIdRef.current,
      fullDocumentWithDelineators: fullDocumentContent,
      prompts: [
        {
          promptId: collaborationPromptId,
          instruction:
            "Please review the entire document. For EACH specific textual change (e.g., grammar, spelling, clarity), follow the 'collaboration' output guidelines: provide a NEW unique 'promptId', the EXACT 'originalText' you're targeting, and your 'revisedText'. Also include an 'explanation' for each change. If no changes, respond for this promptId with an explanation.",
          originalText: '', // No specific selected text for the main collab task
        },
      ],
      requestType: 'collaboration',
    };

    // REMOVED setComments call that created the initial collaboration comment bubble
    // console.log(`Triggering AI Collaboration with master promptId: ${collaborationPromptId}`);

    const instructionToLLM = constructAIInstruction(collaborationPayload);
    sendToAI({
      id: `editor-collab-${generateSimpleUUID()}`,
      role: 'user',
      created: Date.now(),
      content: [{ type: 'text', text: instructionToLLM }],
      metadata: {
        requestType: 'collaboration',
        originalCollaborationPromptId: collaborationPromptId, // Keep for context in handleAIBatchResponse if ever needed
      },
    });
  }, [editor, isAiLoading, sendToAI]); // setComments and constructAIInstruction are stable

  // NEW: Ask Goose functionality
  const handleAskGoose = useCallback(() => {
    if (!editor || isAiLoading) return;

    const { selection } = editor.state;
    const hasSelection = !selection.empty;
    
    let prompt: string;
    let commentId: string;
    
    if (hasSelection) {
      // Selected text mode: Use selection as prompt, document as context
      const selectedText = editor.state.doc.textBetween(selection.from, selection.to);
      const documentText = editor.getText();
      
      prompt = `Context: Here is the full document for reference:

${documentText}

---

Question about the above document: ${selectedText}`;
      
      commentId = `ask-goose-selection-${generateSimpleUUID()}`;
      
      // Create a comment bubble for the selected text
      setComments((prev) => ({
        ...prev,
        [commentId]: {
          id: commentId,
          textRange: { from: selection.from, to: selection.to },
          selectedText: selectedText,
          instruction: 'Ask Goose: ' + selectedText,
          status: 'processing',
          timestamp: new Date(),
          inlineVisible: false,
          replies: [],
          isThreadExpanded: false,
          lastActivity: new Date(),
        },
      }));
      
      // Apply highlight to the selected text
      editor.chain().focus().setCommentHighlight({ commentId }).run();
      
    } else {
      // No selection mode: Use entire document as prompt
      const documentText = editor.getText();
      
      prompt = documentText;
      commentId = `ask-goose-document-${generateSimpleUUID()}`;
      
      // Create a general comment bubble for the document
      setComments((prev) => ({
        ...prev,
        [commentId]: {
          id: commentId,
          textRange: null, // No specific text range for document-wide question
          selectedText: 'Entire Document',
          instruction: 'Ask Goose about this document',
          status: 'processing',
          timestamp: new Date(),
          inlineVisible: false,
          replies: [],
          isThreadExpanded: false,
          lastActivity: new Date(),
        },
      }));
    }

    // Use the structured instruction format like other AI requests
    const instructionToLLM = `Please respond to the following question or request about a document. Provide a helpful, conversational response - do not format as JSON.

Request: ${prompt}

Please provide a natural, conversational response that directly addresses the user's question or request.`;

    sendToAI({
      id: `ask-goose-${generateSimpleUUID()}`,
      role: 'user',
      created: Date.now(),
      content: [{ type: 'text', text: instructionToLLM }],
      metadata: {
        requestType: 'ask_goose',
        commentId: commentId,
        hasSelection: hasSelection,
      },
    });
    
  }, [editor, isAiLoading, sendToAI, setComments]);

  // AI thread processing - moved before handleSendReply to fix initialization order
  const processThreadReply = useCallback(
    async (commentId: string, userQuery: string) => {
      const comment = comments[commentId];
      if (!comment) return;

      try {
        // Helper function to get document context around the comment
        const getDocumentContext = (textRange: { from: number; to: number } | null): string => {
          if (!textRange || !editor) return '';
          const doc = editor.state.doc;
          const contextStart = Math.max(0, textRange.from - 100);
          const contextEnd = Math.min(doc.content.size, textRange.to + 100);
          return doc.textBetween(contextStart, contextEnd);
        };

        // Prepare thread context for AI
        const threadRequest: AIThreadRequest = {
          commentId,
          originalText: comment.selectedText,
          originalInstruction: comment.instruction,
          threadHistory: comment.replies,
          userQuery,
          documentContext: getDocumentContext(comment.textRange),
        };

        // Send to AI using existing useMessageStream hook
        const aiMessage = constructThreadAIInstruction(threadRequest);

        sendToAI({
          id: `editor-thread-${generateSimpleUUID()}`,
          role: 'user',
          created: Date.now(),
          content: [{ type: 'text', text: aiMessage.content }],
          metadata: {
            requestType: 'thread_reply',
            commentId: commentId,
          },
        });
      } catch (error) {
        console.error('Error processing thread reply:', error);
        // Update user reply status to error
        setComments((prev) => {
          const updated = { ...prev };
          if (updated[commentId]) {
            updated[commentId] = {
              ...updated[commentId],
              replies: updated[commentId].replies.map((reply) =>
                reply.status === 'pending' ? { ...reply, status: 'error' as const } : reply
              ),
            };
          }
          return updated;
        });
      }
    },
    [comments, sendToAI, editor]
  );

  // NEW: Thread management functions
  const handleSendReply = useCallback(
    async (commentId: string, replyText: string) => {
      if (!replyText.trim()) return;

      // Add user reply to thread immediately
      const userReply: Reply = {
        id: generateSimpleUUID(),
        role: 'user',
        text: replyText.trim(),
        timestamp: new Date(),
        status: 'pending',
      };

      setComments((prev) => {
        const updated = { ...prev };
        if (updated[commentId]) {
          updated[commentId] = {
            ...updated[commentId],
            replies: [...(updated[commentId].replies || []), userReply],
            lastActivity: new Date(),
            isThreadExpanded: true, // Auto-expand when new reply added
          };
        }
        return updated;
      });

      // Send to AI for response
      await processThreadReply(commentId, replyText);
    },
    [processThreadReply]
  );

  const handleToggleThread = useCallback((commentId: string) => {
    setComments((prev) => {
      const updated = { ...prev };
      if (updated[commentId]) {
        updated[commentId] = {
          ...updated[commentId],
          isThreadExpanded: !updated[commentId].isThreadExpanded,
        };
      }
      return updated;
    });
  }, []);

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
          inlineVisible: false,
          replies: [], // Initialize empty replies array
          isThreadExpanded: false, // Initialize thread state
          lastActivity: new Date(), // Initialize activity tracking
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
            status: existingComment.status === 'applied' ? 'applied' : 'pending',
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
      if (comments[commentIdToRemove]?.inlineVisible && comments[commentIdToRemove]?.textRange) {
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
                liveTo = pos + node.textContent.length;
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
            .run();
        }
      }

      setComments((prevComments) => {
        const updatedComments = { ...prevComments };
        delete updatedComments[commentIdToRemove];
        return updatedComments;
      });

      const tr = editor.state.tr;
      let markFoundAndRemoved = false;
      editor.state.doc.descendants((node, pos) => {
        if (markFoundAndRemoved) return false;
        node.marks.forEach((mark) => {
          if (mark.type.name === 'commentHighlight' && mark.attrs.commentId === commentIdToRemove) {
            tr.removeMark(
              pos,
              pos + node.textContent.length,
              editor.schema.marks.commentHighlight.create({ commentId: commentIdToRemove })
            );
            markFoundAndRemoved = true;
          }
        });
        return !markFoundAndRemoved;
      });

      if (markFoundAndRemoved) {
        editor.view.dispatch(tr);
      } else {
        console.warn(
          `Could not find CommentHighlightMark for comment ${commentIdToRemove} to remove it upon close.`
        );
      }

      editor.commands.focus();

      if (activeCommentId === commentIdToRemove) {
        setActiveCommentId(null);
        setCurrentInstructionInput('');
      }
    },
    [editor, comments, activeCommentId] // Removed setters from deps as they are stable if only setting state from other state
  );

  const handleSendIndividualCommentToAI = useCallback<(commentId: string) => void>(
    (commentId: string): void => {
      if (!editor || isAiLoading || !comments[commentId] || !comments[commentId].textRange) {
        console.warn('Cannot send to AI, editor/comment invalid or textRange missing', commentId);
        return;
      }
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
        requestType: 'single_comment',
      };

      const instructionToLLM = constructAIInstruction(batchRequestPayload);
      sendToAI({
        id: `editor-msg-${generateSimpleUUID()}`,
        role: 'user',
        created: Date.now(),
        content: [{ type: 'text', text: instructionToLLM }],
      });
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

  const handleTriggerAIBatchProcessing = useCallback(() => {
    if (!editor || isAiLoading) return;
    const commentsToProcessArray = Object.values(comments).filter(
      (c) => c.status === 'pending' && c.instruction && c.instruction.trim() !== '' && c.textRange
    );
    if (commentsToProcessArray.length === 0) return;

    setComments((prev) => {
      const updatedComments = { ...prev };
      commentsToProcessArray.forEach((c) => {
        if (updatedComments[c.id]) {
          updatedComments[c.id].status = 'processing';
        }
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
      requestType: 'batch_comments',
    };

    const instructionToLLM = constructAIInstruction(batchRequestPayload);
    sendToAI({
      id: `editor-batch-${generateSimpleUUID()}`,
      role: 'user',
      created: Date.now(),
      content: [{ type: 'text', text: instructionToLLM }],
    });
  }, [editor, isAiLoading, comments, sendToAI, setComments]);

  const toggleInline = useCallback(
    (commentId: string): void => {
      const c = comments[commentId];
      if (!editor || !c || !c.aiSuggestion || !c.textRange) {
        console.warn('Toggle inline guard failed: ', { editor, c });
        return;
      }

      let currentFrom: number | null = null;
      let currentTo: number | null = null;

      editor.state.doc.descendants((node, pos) => {
        if (currentFrom !== null) return false;
        if (node.isText) {
          const mainMark = node.marks.find(
            (m) => m.type.name === 'commentHighlight' && m.attrs.commentId === commentId
          );
          if (mainMark) {
            currentFrom = pos;
            currentTo = pos + node.textContent.length;
            return false;
          }
        }
        return true;
      });

      const finalFrom = currentFrom !== null ? currentFrom : c.textRange.from;
      const finalTo = currentTo !== null ? currentTo : c.textRange.to;

      if (finalFrom === null || finalTo === null) {
        console.error(
          'toggleInline: Critical error - textRange.from or .to is null for comment:',
          commentId,
          c.textRange
        );
        return;
      }

      if (!c.inlineVisible) {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: finalFrom, to: finalTo })
          .setMark('diffDel')
          .setTextSelection({ from: finalTo, to: finalTo })
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
        const suggestionStartPosition = finalTo + 1;
        const suggestionEndPosition = suggestionStartPosition + c.aiSuggestion.length;
        editor
          .chain()
          .focus()
          .setTextSelection({ from: finalTo, to: suggestionEndPosition })
          .deleteSelection()
          .setTextSelection({ from: finalFrom, to: finalTo })
          .unsetMark('diffDel')
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
        commentToApply.status !== 'suggestion_ready' ||
        commentToApply.textRange === null
      ) {
        console.warn(
          'Guard condition failed for accepting suggestion, or textRange is null.',
          commentToApply
        );
        if (commentToApply && commentToApply.textRange === null) {
          setComments((prev) => ({
            ...prev,
            [commentIdToAccept]: {
              ...prev[commentIdToAccept],
              status: 'applied',
              aiSuggestion: undefined,
              inlineVisible: false,
            },
          }));
        }
        return;
      }

      let finalFrom = commentToApply.textRange!.from;
      let finalTo = commentToApply.textRange!.to;

      let liveFrom: number | null = null;
      let liveTo: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (liveFrom !== null) return false;
        if (node.isText) {
          const mainMark = node.marks.find(
            (m) => m.type.name === 'commentHighlight' && m.attrs.commentId === commentIdToAccept
          );
          if (mainMark) {
            liveFrom = pos;
            liveTo = pos + node.textContent.length;
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
          `handleAcceptSuggestion: Could not find live range for comment ${commentIdToAccept}, using stored range. This might lead to incorrect replacement if text was edited around the comment.`
        );
      }

      const suggestionText = commentToApply.aiSuggestion;

      if (commentToApply.inlineVisible) {
        const suggestionStartPosition = finalTo + 1;
        const suggestionEndPosition = suggestionStartPosition + suggestionText.length;
        editor
          .chain()
          .focus()
          .setTextSelection({ from: finalTo, to: suggestionEndPosition })
          .deleteSelection()
          .setTextSelection({ from: finalFrom, to: finalTo })
          .unsetMark('diffDel')
          .run();
      }

      if (
        finalFrom !== null &&
        finalTo !== null &&
        finalFrom <= editor.state.doc.content.size &&
        finalTo <= editor.state.doc.content.size &&
        finalFrom <= finalTo
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
            instruction: prev[commentIdToAccept].instruction || '',
            inlineVisible: false,
            textRange: { from: finalFrom, to: finalFrom + suggestionText.length },
            selectedText: suggestionText,
          },
        }));
      } else {
        console.warn(
          `handleAcceptSuggestion: Range for final replacement invalid for comment ${commentIdToAccept}. From: ${finalFrom}, To: ${finalTo}, DocSize: ${editor.state.doc.content.size}`
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

  useEffect(() => {
    if (aiError) {
      console.error('useMessageStream Error reported:', aiError);
      let errorMessageText = aiError instanceof Error ? aiError.message : String(aiError);
      setComments((prev) => {
        const updatedComments = { ...prev };
        Object.keys(updatedComments).forEach((commentId) => {
          if (updatedComments[commentId].status === 'processing') {
            updatedComments[commentId].status = 'error';
            updatedComments[commentId].errorMessage = errorMessageText;
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

  const getToolbar = () => {
    if (!editor) return null;
    return (
      <EditorToolbar
        editor={editor}
        setView={setView}
        comments={comments}
        onApplyCommentHighlight={handleApplyCommentHighlight}
        onTriggerAICollaboration={handleTriggerAICollaboration}
        onSendAllToAI={handleTriggerAIBatchProcessing}
        onAskGoose={handleAskGoose}
        isAiLoading={isAiLoading}
      />
    );
  };

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

        {/* Resize Handle */}
        <div
          className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''}`}
          onMouseDown={handleMouseDown}
          title="Drag to resize comment sidebar"
        />

        <div
          className="comments-sidebar"
          style={{
            width: `${sidebarWidth}px`,
            borderLeft: '1px solid #e0e0e0',
            padding: '20px',
            overflowY: 'auto',
            backgroundColor: '#fafafa',
            position: 'relative',
            flexShrink: 0,
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          }}
        >
          <h4
            style={{
              marginTop: '0',
              marginBottom: '20px',
              borderBottom: '1px solid #e8eaed',
              paddingBottom: '12px',
              fontSize: '16px',
              fontWeight: 500,
              color: '#3c4043',
              letterSpacing: '0.25px',
            }}
          >
            Comments
          </h4>
          {Object.keys(comments).length === 0 && (
            <div
              style={{
                color: '#9aa0a6',
                fontSize: '14px',
                textAlign: 'center',
                padding: '40px 20px',
                fontStyle: 'italic',
              }}
            >
              No comments yet. Select text and add a comment to get AI assistance.
            </div>
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
              onToggleInline={toggleInline}
              onSetActive={handleSetActiveComment}
              onBubbleTextareaBlur={handleBubbleTextareaBlur}
              isGloballyLoadingAI={isAiLoading}
              onCloseComment={handleCloseComment}
              onSendReply={handleSendReply}
              onToggleThread={handleToggleThread}
            />
          ))}
        </div>
      </div>
      {/* Old interaction panel logic can be removed if bubbles are the sole method */}
      {/* {shouldShowOldInstructionArea && ( ... )} */}
    </div>
  );
};

export default TextEditorView;
