// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/EditorToolbar.tsx
import React from 'react';
import { Editor } from '@tiptap/react';
import { View, ViewOptions } from '../../App';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Code,
  ArrowLeft,
  Settings,
  MessageSquarePlus,
  Send,
  Loader2, // Added Loader2 for loading state
} from 'lucide-react';

// Minimal type for what the toolbar needs from pendingPrompts
interface PendingPromptInfo {
  instruction: string;
  status: string;
}

interface EditorToolbarProps {
  editor: Editor | null;
  setView: (view: View, viewOptions?: ViewOptions) => void;
  pendingPrompts: Record<string, PendingPromptInfo>;
  onSendAllToAI: () => void; // Function to trigger AI batch processing
  isAiLoading: boolean; // Loading state for AI requests
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  setView,
  pendingPrompts,
  onSendAllToAI,
  isAiLoading,
}) => {
  if (!editor) {
    return null;
  }

  const addAIPrompt = () => {
    const promptId = `ai-prompt-${Date.now()}`;
    editor.chain().focus().setAIPromptAnchor({ promptId }).run();
  };

  const getPromptsToSendCount = () => {
    return Object.values(pendingPrompts).filter(
      (prompt) => prompt.status === 'instruction_set' && prompt.instruction.trim() !== ''
    ).length;
  };

  const promptsReadyCount = getPromptsToSendCount();
  const canSendToAI = promptsReadyCount > 0;

  return (
    <div className="editor-toolbar">
      {/* Navigation Buttons */}
      <button onClick={() => setView('chat')} title="Back to Chat" disabled={isAiLoading}>
        <ArrowLeft size={18} />
      </button>
      <button onClick={() => setView('settings')} title="Settings" disabled={isAiLoading}>
        <Settings size={18} />
      </button>

      <span className="toolbar-divider" />

      {/* AI Interaction Buttons */}
      <button
        onClick={addAIPrompt}
        disabled={editor.state.selection.empty || isAiLoading}
        title="Add AI Prompt Anchor"
      >
        <MessageSquarePlus size={18} />
      </button>
      <button
        onClick={onSendAllToAI} // Call the prop function
        disabled={!canSendToAI || isAiLoading}
        title="Send All Pending Instructions to AI"
        style={{
          background: canSendToAI && !isAiLoading ? '#007bff' : undefined,
          color: canSendToAI && !isAiLoading ? 'white' : undefined,
        }}
      >
        {isAiLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        <span style={{ marginLeft: '4px' }}>
          {isAiLoading ? 'Sending...' : `Send to AI (${promptsReadyCount})`}
        </span>
      </button>

      <span className="toolbar-divider" />

      {/* Formatting Buttons (disabled while AI is loading) */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run() || isAiLoading}
        className={editor.isActive('bold') ? 'is-active' : ''}
        title="Bold"
      >
        Bold
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run() || isAiLoading}
        className={editor.isActive('italic') ? 'is-active' : ''}
        title="Italic"
      >
        Italic
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run() || isAiLoading}
        className={editor.isActive('strike') ? 'is-active' : ''}
        title="Strike"
      >
        Strike
      </button>

      <span className="toolbar-divider" />

      <button
        onClick={() => editor.chain().focus().setParagraph().run()}
        className={editor.isActive('paragraph') ? 'is-active' : ''}
        title="Paragraph"
        disabled={isAiLoading}
      >
        <Pilcrow size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
        title="Heading 1"
        disabled={isAiLoading}
      >
        <Heading1 size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
        title="Heading 2"
        disabled={isAiLoading}
      >
        <Heading2 size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
        title="Heading 3"
        disabled={isAiLoading}
      >
        <Heading3 size={18} />
      </button>

      <span className="toolbar-divider" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? 'is-active' : ''}
        title="Bullet List"
        disabled={isAiLoading}
      >
        <List size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? 'is-active' : ''}
        title="Ordered List"
        disabled={isAiLoading}
      >
        <ListOrdered size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive('blockquote') ? 'is-active' : ''}
        title="Blockquote"
        disabled={isAiLoading}
      >
        <Quote size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? 'is-active' : ''}
        title="Code Block"
        disabled={isAiLoading}
      >
        <Code size={18} />
      </button>
    </div>
  );
};

export default EditorToolbar;
