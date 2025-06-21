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
  MessageSquarePlus, // Added MessageSquarePlus
} from 'lucide-react';

interface EditorToolbarProps {
  editor: Editor | null;
  setView: (view: View, viewOptions?: ViewOptions) => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor, setView }) => {
  if (!editor) {
    return null;
  }

  const addAIPrompt = () => {
    // Generate a unique ID for the prompt anchor
    const promptId = `ai-prompt-${Date.now()}`;
    editor.chain().focus().setAIPromptAnchor({ promptId }).run();
  };

  return (
    <div className="editor-toolbar">
      {/* Navigation Buttons */}
      <button onClick={() => setView('chat')} title="Back to Chat">
        <ArrowLeft size={18} />
      </button>
      <button onClick={() => setView('settings')} title="Settings">
        <Settings size={18} />
      </button>

      <span className="toolbar-divider" />

      {/* AI Prompt Button */}
      <button
        onClick={addAIPrompt}
        // Disable if nothing is selected or if the mark cannot be applied
        disabled={editor.state.selection.empty}
        title="Add AI Prompt Anchor"
      >
        <MessageSquarePlus size={18} />
      </button>

      <span className="toolbar-divider" />

      {/* Formatting Buttons */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'is-active' : ''}
        title="Bold"
      >
        Bold
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'is-active' : ''}
        title="Italic"
      >
        Italic
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
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
      >
        <Pilcrow size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
        title="Heading 1"
      >
        <Heading1 size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
        title="Heading 2"
      >
        <Heading2 size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
        title="Heading 3"
      >
        <Heading3 size={18} />
      </button>

      <span className="toolbar-divider" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? 'is-active' : ''}
        title="Bullet List"
      >
        <List size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? 'is-active' : ''}
        title="Ordered List"
      >
        <ListOrdered size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive('blockquote') ? 'is-active' : ''}
        title="Blockquote"
      >
        <Quote size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? 'is-active' : ''}
        title="Code Block"
      >
        <Code size={18} />
      </button>
    </div>
  );
};

export default EditorToolbar;
