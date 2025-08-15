// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/TextEditorView.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Node as PMNode } from 'prosemirror-model';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import EditorToolbar from './EditorToolbar';
import ContextMenu from './ContextMenu';
import './TextEditor.css';
import { View, ViewOptions } from '../../App';
import CommentHighlightMark from './extensions/CommentHighlightMark';
import StrikethroughDiffMark from './extensions/StrikethroughDiffMark';
import BoldItalicAddMark from './extensions/BoldItalicAddMark';
import { GoogleDocsEnterBehavior } from './extensions/GoogleDocsEnterBehavior';
import { FontSize } from './extensions/FontSize';
import { FontFamily } from './extensions/FontFamily';
import { TextColor } from './extensions/TextColor';
import { ClearFormatting } from './extensions/ClearFormatting';
import { LineSpacing } from './extensions/LineSpacing';
import { TextTransform } from './extensions/TextTransform';
import { useMessageStream } from '../../hooks/useMessageStream';
import { getApiUrl } from '../../config';
import type { Message } from '../../types/message';
import { Comment, Reply, AIThreadRequest } from './DocumentTypes';
import CommentBubble from './CommentBubble';
import { generateSmartDiff, segmentsToEditorContent } from './utils/smartDiff';
import {
  findCommentMarkRange,
  ensureCommentMarkApplied,
  removeCommentMark,
  updateAllCommentRanges,
  validateAndFixCommentMarks,
} from './utils/markHelpers';

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
- The 'originalText' field is not expected from you in the response for these types, as the frontend already knows the original selected text. Perform the requested 'instruction' on the text associated with its 'promptId' (found via the data-comment-id attribute in 'fullDocumentWithDelineators'), considering surrounding context. Generate a 'revisedText' with your suggested revision.

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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    hasSelection: boolean;
  }>({ x: 0, y: 0, visible: false, hasSelection: false });

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
      Superscript,
      Subscript,
    ],
    content: `<h1>Welcome to Goose Text Editor</h1>
<p>A powerful document editor with integrated AI assistance. Get help with writing, editing, and improving your content using two main AI features:</p>

<h2>🤖 AI Assist</h2>
<p><strong>Get targeted help with specific text or sections</strong></p>
<ul>
<li><strong>Select text</strong> you want help with (or place cursor anywhere)</li>
<li><strong>Click "AI Assist"</strong> in the toolbar or right-click → AI Assist</li>
<li><strong>Add your instruction</strong> in the comment bubble (e.g., "Write a PRD that does X," "Simplify this paragraph," "Tell me how to improve this document")</li>
<li><strong>Click the save button</strong> to batch multiple comments</li>
<li><strong>Click the send button</strong> to get AI suggestions</li>
<li><strong>Preview changes</strong> with "Show Inline" to see original vs. suggested text</li>
<li><strong>Apply or reject</strong> suggestions as needed</li>
</ul>

<h2>✨ AI Refine</h2>
<p><strong>Get comprehensive feedback on your entire document</strong></p>
<ul>
<li><strong>Click "AI Refine"</strong> in the toolbar or right-click → AI Refine</li>
<li><strong>AI analyzes your whole document</strong> for grammar, clarity, structure, and flow</li>
<li><strong>Multiple suggestions appear</strong> as comment bubbles throughout your document</li>
<li><strong>Review each suggestion</strong> individually and choose what to keep</li>
<li><strong>Get explanations</strong> for why changes were suggested</li>
</ul>

<h2>💬 Comment Conversations</h2>
<p>Have back-and-forth conversations with AI about specific suggestions:</p>
<ul>
<li><strong>Click on any comment bubble</strong> to expand the conversation</li>
<li><strong>Ask follow-up questions</strong> like "Can you make it shorter?" or "What about a different approach?"</li>
<li><strong>Get clarifications</strong> on why certain changes were suggested</li>
</ul>

<h2>🎯 Quick Tips</h2>
<ul>
<li><strong>Right-click anywhere</strong> for context menu with AI options</li>
<li><strong>Save multiple comments</strong> and then "Send to AI"</li>
<li><strong>Drag the sidebar</strong> to resize the comments panel</li>
<li><strong>All changes are optional</strong> - you have full control over your document</li>
</ul>

<p><strong>Try selecting this text and clicking "AI Assist" to see how it works, or click "AI Refine" to get feedback on this entire welcome message!</strong></p>`,
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

  // Mark persistence hook - validate marks on mount and after significant changes
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    
    // Validate marks on mount and after significant changes
    const report = validateAndFixCommentMarks(editor, comments);
    if (report.orphanedMarks.length > 0 || report.missingMarks.length > 0) {
      console.log('Mark validation report:', report);
    }
  }, [editor, comments]);

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
      // Debug: Log the entire response object to understand its structure
      console.log('handleAIBatchResponse - Full response object:', aiResponseObject);
      console.log('handleAIBatchResponse - Response content:', aiResponseObject?.content);
      
      // Get the response text content - concatenate all text chunks from streaming
      const rawTextContent = aiResponseObject?.content
        ?.filter(chunk => chunk.type === 'text')
        ?.map(chunk => chunk.text)
        ?.join('') || '';

      // Check if this is a thread reply response - handle completely separately
      const metadata = aiResponseObject.metadata;
      const isThreadReply = metadata?.requestType === 'thread_reply';

      console.log('handleAIBatchResponse - metadata:', metadata);
      console.log('handleAIBatchResponse - rawTextContent:', rawTextContent);

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
            // If no fences, the response should be pure JSON
            cleanedJsonString = rawTextContent.trim();
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
            if (range) {
              // Apply mark immediately
              ensureCommentMarkApplied(
                activeEditor,
                promptId,
                range.from,
                range.to
              );
              
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
                markApplied: true,
                errorMessage:
                  status === 'error' ? errorMessage || 'Error in AI suggestion' : undefined,
                replies: [], // Initialize empty replies array
                isThreadExpanded: false, // Initialize thread state
                lastActivity: new Date(), // Initialize activity tracking
              };
              updatedComments[promptId] = newComment;
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

  // Position synchronization hook - sync all comment positions after major operations
  const syncCommentPositions = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    
    setComments((prev) => {
      const updated = updateAllCommentRanges(editor, prev);
      return updated;
    });
  }, [editor]);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const hasSelection = !editor?.state.selection.empty;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true,
      hasSelection,
    });
  }, [editor]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  // Context menu action handlers
  const handleContextAIRefine = useCallback(() => {
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
            "Please review the entire document and provide comprehensive feedback. For EACH specific textual change (e.g., grammar, spelling, clarity, word choice), follow the 'collaboration' output guidelines: provide a NEW unique 'promptId', the EXACT 'originalText' you're targeting, and your 'revisedText'. Also include an 'explanation' for each change. Additionally, provide suggestions for document structure, effectiveness, flow, and overall improvements. If no changes are needed, respond for this promptId with an explanation.",
          originalText: '', // No specific selected text for the main refine task
        },
      ],
      requestType: 'collaboration',
    };

    const instructionToLLM = constructAIInstruction(collaborationPayload);
    sendToAI({
      id: `editor-refine-${generateSimpleUUID()}`,
      role: 'user',
      created: Date.now(),
      content: [{ type: 'text', text: instructionToLLM }],
      metadata: {
        requestType: 'collaboration',
        originalCollaborationPromptId: collaborationPromptId, // Keep for context in handleAIBatchResponse if ever needed
      },
    });
  }, [editor, isAiLoading, sendToAI]);

  const handleApplyCommentHighlight = useCallback(
    (selectionDetails: SelectionDetails) => {
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
          inlineVisible: false,
          markApplied: true, // Track that mark is applied
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

  const handleContextAIAssist = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const hasSelection = !editor.state.selection.empty;
    const selectedText = hasSelection ? editor.state.doc.textBetween(from, to) : '';
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (hasSelection) {
      editor.chain().focus().setCommentHighlight({ commentId }).run();
    }

    handleApplyCommentHighlight({
      from: hasSelection ? from : from,
      to: hasSelection ? to : from,
      selectedText: selectedText,
      commentId,
    });
  }, [editor, handleApplyCommentHighlight]);

  const handleContextCut = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (!editor.state.selection.empty) {
      const text = editor.state.doc.textBetween(from, to);
      navigator.clipboard.writeText(text);
      editor.chain().focus().deleteSelection().run();
    }
  }, [editor]);

  const handleContextCopy = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (!editor.state.selection.empty) {
      const text = editor.state.doc.textBetween(from, to);
      navigator.clipboard.writeText(text);
    }
  }, [editor]);

  const handleContextPaste = useCallback(async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      editor.chain().focus().insertContent(text).run();
    } catch (err) {
      console.warn('Failed to read clipboard:', err);
    }
  }, [editor]);

  const handleContextAddLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const handleContextHighlight = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleHighlight({ color: '#ffff00' }).run();
  }, [editor]);

  const handleContextFindReplace = useCallback(() => {
    // For now, just show an alert - this would need a proper find/replace dialog
    alert('Find & Replace functionality would be implemented here');
  }, []);

  const handleContextDocumentStats = useCallback(() => {
    if (!editor) return;
    const doc = editor.state.doc;
    const text = doc.textContent;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, '').length;
    const paragraphs = doc.content.childCount;

    alert(`Document Statistics:
Words: ${words}
Characters: ${characters}
Characters (no spaces): ${charactersNoSpaces}
Paragraphs: ${paragraphs}`);
  }, [editor]);

  const handleTriggerAIRefine = useCallback(() => {
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
            "Please review the entire document and provide comprehensive feedback. For EACH specific textual change (e.g., grammar, spelling, clarity, word choice), follow the 'collaboration' output guidelines: provide a NEW unique 'promptId', the EXACT 'originalText' you're targeting, and your 'revisedText'. Also include an 'explanation' for each change. Additionally, provide suggestions for document structure, effectiveness, flow, and overall improvements. If no changes are needed, respond for this promptId with an explanation.",
          originalText: '', // No specific selected text for the main refine task
        },
      ],
      requestType: 'collaboration',
    };

    // REMOVED setComments call that created the initial collaboration comment bubble
    // console.log(`Triggering AI Refine with master promptId: ${collaborationPromptId}`);

    const instructionToLLM = constructAIInstruction(collaborationPayload);
    sendToAI({
      id: `editor-refine-${generateSimpleUUID()}`,
      role: 'user',
      created: Date.now(),
      content: [{ type: 'text', text: instructionToLLM }],
      metadata: {
        requestType: 'collaboration',
        originalCollaborationPromptId: collaborationPromptId, // Keep for context in handleAIBatchResponse if ever needed
      },
    });
  }, [editor, isAiLoading, sendToAI]); // setComments and constructAIInstruction are stable



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
      
      // If inline diff is visible, clean it up first
      if (comments[commentIdToRemove]?.inlineVisible) {
        const c = comments[commentIdToRemove];
        if (c && c.aiSuggestion) {
          // Use mark-based position finding
          const currentRange = findCommentMarkRange(editor, commentIdToRemove);
          if (currentRange) {
            const { from, to } = currentRange;
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
      }

      // Remove comment from state
      setComments((prevComments) => {
        const updatedComments = { ...prevComments };
        delete updatedComments[commentIdToRemove];
        return updatedComments;
      });

      // Use helper to remove mark
      removeCommentMark(editor, commentIdToRemove);

      editor.commands.focus();

      if (activeCommentId === commentIdToRemove) {
        setActiveCommentId(null);
        setCurrentInstructionInput('');
      }
    },
    [editor, comments, activeCommentId]
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
      if (!editor || !c || !c.aiSuggestion) {
        console.warn('Toggle inline guard failed: ', { editor, c });
        return;
      }

      // Always use current mark position
      const currentRange = findCommentMarkRange(editor, commentId);
      if (!currentRange) {
        console.error(`No mark found for comment ${commentId}`);
        return;
      }

      const { from: finalFrom, to: finalTo } = currentRange;

      if (!c.inlineVisible) {
        // Generate smart diff to determine how to display the changes
        const diffResult = generateSmartDiff(c.selectedText, c.aiSuggestion);
        
        console.log('Smart diff result:', diffResult);
        
        if (diffResult.shouldUseGranular && diffResult.segments.length > 1) {
          // Use granular diff - show only the specific changes
          const content = segmentsToEditorContent(diffResult.segments);
          
          editor
            .chain()
            .focus()
            .setTextSelection({ from: finalFrom, to: finalTo })
            .deleteSelection()
            .insertContent(content)
            .run();
        } else {
          // Fall back to full sentence replacement for complex changes
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
        }
        
        setComments((prev) => ({
          ...prev,
          [commentId]: { ...prev[commentId], inlineVisible: true },
        }));
      } else {
        // Hide inline diff - need to restore original text
        // This is more complex with granular diff, so we'll restore the original text
        // and remove any diff marks
        
        // First, find the current range that includes all diff marks
        let diffStart = finalFrom;
        let diffEnd = finalTo;
        
        // Scan for diff marks to find the full range
        editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.marks.some(mark => 
            mark.type.name === 'diffDel' || mark.type.name === 'diffAdd'
          )) {
            diffStart = Math.min(diffStart, pos);
            diffEnd = Math.max(diffEnd, pos + node.textContent.length);
          }
          return true;
        });
        
        // Replace the entire diff range with the original text
        editor
          .chain()
          .focus()
          .setTextSelection({ from: diffStart, to: diffEnd })
          .deleteSelection()
          .insertContent(c.selectedText)
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
        console.warn(
          'Guard condition failed for accepting suggestion.',
          commentToApply
        );
        return;
      }

      // Use mark-based position finding
      const currentRange = findCommentMarkRange(editor, commentIdToAccept);
      if (!currentRange) {
        console.error(`No mark found for comment ${commentIdToAccept}`);
        return;
      }

      let finalFrom = currentRange.from;
      let finalTo = currentRange.to;
      const suggestionText = commentToApply.aiSuggestion;

      if (commentToApply.inlineVisible) {
        // If inline is visible, we need to find and remove all diff marks
        // This handles both granular and full-sentence diffs
        let diffStart = finalFrom;
        let diffEnd = finalTo;
        
        // Scan for diff marks to find the full range
        editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.marks.some(mark => 
            mark.type.name === 'diffDel' || mark.type.name === 'diffAdd'
          )) {
            diffStart = Math.min(diffStart, pos);
            diffEnd = Math.max(diffEnd, pos + node.textContent.length);
          }
          return true;
        });
        
        // Clear the diff display first
        editor
          .chain()
          .focus()
          .setTextSelection({ from: diffStart, to: diffEnd })
          .deleteSelection()
          .run();
          
        // Update the final range for the replacement
        finalTo = finalFrom;
      }

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
          inlineVisible: false,
          textRange: { from: finalFrom, to: finalFrom + suggestionText.length },
          selectedText: suggestionText,
        },
      }));
      
      // IMPORTANT: Sync all comment positions after applying a suggestion
      // This ensures other pending suggestions have accurate positions
      setTimeout(() => {
        syncCommentPositions();
      }, 100);
    },
    [editor, comments, setComments, syncCommentPositions]
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
        onTriggerAIRefine={handleTriggerAIRefine}
        onSendAllToAI={handleTriggerAIBatchProcessing}
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
          <EditorContent 
            editor={editor} 
            className="editor-content-area" 
            onContextMenu={handleContextMenu}
          />
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
            backgroundColor: '#ffffff',
            position: 'relative',
            flexShrink: 0,
            fontFamily: "'Cash Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
      
      {/* Context Menu */}
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        isVisible={contextMenu.visible}
        hasSelection={contextMenu.hasSelection}
        onClose={handleCloseContextMenu}
        onAIRefine={handleContextAIRefine}
        onAIAssist={handleContextAIAssist}
        onCut={handleContextCut}
        onCopy={handleContextCopy}
        onPaste={handleContextPaste}
        onAddLink={handleContextAddLink}
        onHighlight={handleContextHighlight}
        onFindReplace={handleContextFindReplace}
        onDocumentStats={handleContextDocumentStats}
      />
      
      {/* Old interaction panel logic can be removed if bubbles are the sole method */}
      {/* {shouldShowOldInstructionArea && ( ... )} */}
    </div>
  );
};

export default TextEditorView;
