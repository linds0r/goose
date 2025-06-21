// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/TextEditorView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorToolbar from './EditorToolbar';
import './TextEditor.css';
import { View, ViewOptions } from '../../App';
import AIPromptAnchorMark from './extensions/AIPromptAnchorMark';
import { useMessageStream } from '../../hooks/useMessageStream';
import { getApiUrl } from '../../config';
import type { Message } from '../../types/message'; // Using type import for Message

const generateSimpleUUID = () => `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

interface PendingAIPrompt {
  promptId: string;
  originalText: string;
  instruction: string;
  aiSuggestion?: string;
  status:
    | 'instruction_pending'
    | 'instruction_set'
    | 'processing'
    | 'suggestion_available'
    | 'applied'
    | 'error';
  errorMessage?: string;
}

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

interface TextEditorViewProps {
  setView: (view: View, viewOptions?: ViewOptions) => void;
}

const TextEditorView: React.FC<TextEditorViewProps> = ({ setView }) => {
  const [pendingPrompts, setPendingPrompts] = useState<Record<string, PendingAIPrompt>>({});
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [currentInstructionInput, setCurrentInstructionInput] = useState<string>('');
  const [isInteractionPanelVisible, setIsInteractionPanelVisible] = useState<boolean>(false);

  const editorSessionIdRef = useRef<string>(`text-editor-session-${generateSimpleUUID()}`);

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
      setPendingPrompts((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((promptId) => {
          if (updated[promptId].status === 'processing') {
            updated[promptId].status = 'error';
            updated[promptId].errorMessage =
              `AI response format error (raw text: "${rawTextContent.substring(0, 100)}...") or parse failure.`;
          }
        });
        return updated;
      });
      return;
    }

    setPendingPrompts((prev) => {
      const updatedPrompts = { ...prev };
      parsedResponse!.suggestions.forEach((suggestion) => {
        if (
          updatedPrompts[suggestion.promptId] &&
          updatedPrompts[suggestion.promptId].status === 'processing'
        ) {
          if (suggestion.status === 'success') {
            updatedPrompts[suggestion.promptId].status = 'suggestion_available';
            updatedPrompts[suggestion.promptId].aiSuggestion =
              suggestion.revisedText || 'No revision suggested.';
            updatedPrompts[suggestion.promptId].errorMessage = undefined;
          } else {
            updatedPrompts[suggestion.promptId].status = 'error';
            updatedPrompts[suggestion.promptId].errorMessage =
              suggestion.errorMessage || 'AI processing failed for this item.';
            updatedPrompts[suggestion.promptId].aiSuggestion = undefined;
          }
        } else if (
          updatedPrompts[suggestion.promptId] &&
          updatedPrompts[suggestion.promptId].status !== 'processing'
        ) {
          console.warn(
            `Received suggestion for promptId ${suggestion.promptId} which was not in 'processing' state. Current status: ${updatedPrompts[suggestion.promptId].status}`
          );
        } else if (!updatedPrompts[suggestion.promptId]) {
          console.warn(`Received suggestion for unknown promptId ${suggestion.promptId}.`);
        }
      });
      Object.keys(updatedPrompts).forEach((promptId) => {
        if (
          updatedPrompts[promptId].status === 'processing' &&
          !parsedResponse!.suggestions.find((s) => s.promptId === promptId)
        ) {
          updatedPrompts[promptId].status = 'error';
          updatedPrompts[promptId].errorMessage =
            'AI response received, but this specific item was not included in the suggestions.';
        }
      });
      return updatedPrompts;
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

      setPendingPrompts((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((promptId) => {
          if (updated[promptId].status === 'processing') {
            updated[promptId].status = 'error';
            updated[promptId].errorMessage = errorMessage;
          }
        });
        return updated;
      });
    }
  }, [aiError, setPendingPrompts]);

  const editor = useEditor({
    extensions: [StarterKit, AIPromptAnchorMark],
    content: `<h2>Hi there,</h2><p>this is a <em>basic</em> example of <strong>tiptap</strong>.</p><p>Select some text and click the speech bubble with a plus to add an AI prompt. Then type your instruction in the panel below and save it. You can add multiple prompts. Finally, click "Send to AI" in the toolbar.</p>`,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl m-5 focus:outline-none',
      },
    },
    onSelectionUpdate: ({ editor: currentEditor }: { editor: Editor }) => {
      const { selection } = currentEditor.state;
      const isActiveAnchor = currentEditor.isActive('aiPromptAnchor');
      if (isActiveAnchor && !selection.empty) {
        const attrs = currentEditor.getAttributes('aiPromptAnchor');
        const currentSelectedPromptId = attrs.promptId as string;
        const selectedText = currentEditor.state.doc.textBetween(selection.from, selection.to);
        if (currentSelectedPromptId && selectedText) {
          setActivePromptId(currentSelectedPromptId);
          if (!pendingPrompts[currentSelectedPromptId]) {
            setPendingPrompts((prev) => ({
              ...prev,
              [currentSelectedPromptId]: {
                promptId: currentSelectedPromptId,
                originalText: selectedText,
                instruction: '',
                status: 'instruction_pending',
              },
            }));
            setCurrentInstructionInput('');
          } else {
            setCurrentInstructionInput(pendingPrompts[currentSelectedPromptId].instruction);
          }
          setIsInteractionPanelVisible(true);
        }
      }
    },
  });

  const handleSaveInstruction = () => {
    if (!activePromptId || !editor) return;
    setPendingPrompts((prev) => ({
      ...prev,
      [activePromptId]: {
        ...(prev[activePromptId] || {
          promptId: activePromptId,
          originalText: '',
          status: 'instruction_pending',
        }),
        instruction: currentInstructionInput,
        status: 'instruction_set',
      },
    }));
    console.log(
      'Instruction saved for promptId:',
      activePromptId,
      'Instruction:',
      currentInstructionInput
    );
  };

  const handleCancelInteraction = () => {
    setIsInteractionPanelVisible(false);
    setActivePromptId(null);
    setCurrentInstructionInput('');
    if (editor) editor.chain().focus().run();
  };

  useEffect(() => {
    if (activePromptId && pendingPrompts[activePromptId] && isInteractionPanelVisible) {
      setCurrentInstructionInput(pendingPrompts[activePromptId].instruction || '');
    } else if (!isInteractionPanelVisible) {
      setActivePromptId(null);
      setCurrentInstructionInput('');
    }
  }, [activePromptId, pendingPrompts, isInteractionPanelVisible]);

  const handleTriggerAIBatchProcessing = () => {
    if (!editor || isAiLoading) return;
    const promptsToProcessArray = Object.values(pendingPrompts).filter(
      (p) => p.status === 'instruction_set' && p.instruction.trim() !== ''
    );
    if (promptsToProcessArray.length === 0) {
      console.log('No prompts with instructions set to send to AI.');
      return;
    }

    setPendingPrompts((prev) => {
      const updated = { ...prev };
      promptsToProcessArray.forEach((p) => {
        if (updated[p.promptId]) updated[p.promptId].status = 'processing';
      });
      return updated;
    });

    const fullDocumentContent = editor.getHTML();
    const batchRequestPayload: AIBatchTextRevisionRequest = {
      editorSessionId: editorSessionIdRef.current,
      fullDocumentWithDelineators: fullDocumentContent,
      prompts: promptsToProcessArray.map((p) => ({
        promptId: p.promptId,
        instruction: p.instruction,
        originalText: p.originalText,
      })),
    };

    const stringifiedPayload = JSON.stringify(batchRequestPayload);
    const instructionToLLM = `Please process the following batch request for a text editor.
The details of the request are in the JSON object below, marked with 'BATCH_JSON_START' and 'BATCH_JSON_END'.
The JSON object contains:
1. 'editorSessionId': An ID for this editing session.
2. 'fullDocumentWithDelineators': The complete HTML content of the document. Within this HTML, sections targeted for AI processing are marked by <span data-prompt-id="PROMPT_ID_HERE">...text...</span>. The 'PROMPT_ID_HERE' corresponds to a 'promptId' in the 'prompts' array.
3. 'prompts': An array of objects, where each object has:
   - 'promptId': The unique identifier for a marked section in the 'fullDocumentWithDelineators'.
   - 'instruction': The specific user instruction for what to do with the 'originalText'.
   - 'originalText': The text content of the span identified by 'promptId' (Note: The AI should find the text within the span in 'fullDocumentWithDelineators' using the promptId rather than solely relying on this 'originalText' field if context is important, as 'originalText' might be stale if the document was edited after the anchor was created but before this batch submission).

Your task is to:
For each prompt in the 'prompts' array:
  - Perform the requested 'instruction' on the text associated with its 'promptId' from 'fullDocumentWithDelineators', considering surrounding context.
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
        pendingPrompts={pendingPrompts}
        onSendAllToAI={handleTriggerAIBatchProcessing}
        isAiLoading={isAiLoading}
      />
    );
  };

  return (
    <div className="text-editor-container" style={{ paddingTop: '38px' }}>
      {getToolbar()}
      <EditorContent editor={editor} className="editor-content-area" />
      {isInteractionPanelVisible && activePromptId && pendingPrompts[activePromptId] && (
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
            AI Interaction for: <code>{activePromptId}</code>
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
            Original Text: <strong>"{pendingPrompts[activePromptId]?.originalText}"</strong>
          </div>
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
            disabled={isAiLoading && pendingPrompts[activePromptId]?.status === 'processing'}
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
              (isAiLoading && pendingPrompts[activePromptId]?.status === 'processing')
            }
          >
            Save Instruction
          </button>
          {pendingPrompts[activePromptId]?.status === 'processing' && (
            <span style={{ fontStyle: 'italic' }}>Processing with AI...</span>
          )}

          {pendingPrompts[activePromptId]?.status === 'suggestion_available' &&
            pendingPrompts[activePromptId]?.aiSuggestion && (
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
                  {pendingPrompts[activePromptId]?.aiSuggestion}
                </div>
                {/* TODO: Add "Accept Suggestion" button here */}
              </div>
            )}
          {pendingPrompts[activePromptId]?.status === 'error' && (
            <div style={{ marginTop: '15px', color: 'red' }}>
              Error: {pendingPrompts[activePromptId]?.errorMessage || 'An unknown error occurred.'}
            </div>
          )}
          <p style={{ fontSize: '0.8em', color: '#777', marginTop: '10px', marginBottom: '0' }}>
            Status: {pendingPrompts[activePromptId]?.status}
          </p>
        </div>
      )}
    </div>
  );
};

export default TextEditorView;
