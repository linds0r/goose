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
  Loader2,
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Highlighter,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Unlink,
  Superscript as SuperscriptIcon,
  Subscript as SubscriptIcon,
  Eraser,
  MessageCircleQuestion,
} from 'lucide-react';

import { Comment } from './DocumentTypes';

// Interface for details passed to the parent when a comment highlight is applied
interface SelectionDetails {
  from: number;
  to: number;
  selectedText: string;
  commentId: string;
}

interface EditorToolbarProps {
  editor: Editor | null;
  setView: (view: View, viewOptions?: ViewOptions) => void;
  comments: Record<string, Comment>;
  onApplyCommentHighlight: (details: SelectionDetails) => void;
  onTriggerAICollaboration: () => void; // New prop to trigger full document-wide feedback // New prop
  onSendAllToAI: () => void;
  onAskGoose: () => void; // NEW: Ask Goose functionality
  isAiLoading: boolean;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  setView,
  comments,
  onApplyCommentHighlight,
  onTriggerAICollaboration, // Fixed: Added missing prop to destructuring
  onSendAllToAI,
  onAskGoose, // NEW: Ask Goose functionality
  isAiLoading,
}) => {
  if (!editor) {
    return null;
  }

  const addCommentHighlight = () => {
    if (!editor || editor.state.selection.empty) {
      return; // Don't do anything if there's no selection or editor isn't available
    }

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; // Unique ID

    // 1. Apply the mark to the editor for visual highlighting
    editor.chain().focus().setCommentHighlight({ commentId }).run();

    // 2. Call the callback to create the comment object in TextEditorView's state
    //    and open the interaction panel.
    onApplyCommentHighlight({
      from,
      to,
      selectedText,
      commentId,
    });
  };

  // Renamed and updated logic to use comments and new status
  const getCommentsToSendCount = () => {
    return Object.values(comments).filter(
      (comment) =>
        comment.status === 'pending' && comment.instruction && comment.instruction.trim() !== ''
    ).length;
  };

  const commentsReadyCount = getCommentsToSendCount(); // Renamed variable
  const canSendToAI = commentsReadyCount > 0;

  // Link management functions
  const setLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const unsetLink = () => {
    editor.chain().focus().unsetLink().run();
  };

  return (
    <div className="editor-toolbar">
      {/* Navigation Buttons */}
      <button onClick={() => setView('chat')} title="Back to Chat" disabled={isAiLoading}>
        <ArrowLeft size={16} />
      </button>
      <button onClick={() => setView('settings')} title="Settings" disabled={isAiLoading}>
        <Settings size={16} />
      </button>

      <span className="toolbar-divider" />

      {/* Undo/Redo */}
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run() || isAiLoading}
        title="Undo (Ctrl+Z)"
      >
        <Undo size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run() || isAiLoading}
        title="Redo (Ctrl+Y)"
      >
        <Redo size={16} />
      </button>

      <span className="toolbar-divider" />

      {/* Font Controls */}
      <select
        onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
        disabled={isAiLoading}
        title="Font Family"
        style={{ marginRight: '4px', padding: '2px 4px', fontSize: '12px' }}
      >
        <option value="">Default Font</option>
        <option value="Arial, sans-serif">Arial</option>
        <option value="'Times New Roman', serif">Times New Roman</option>
        <option value="'Courier New', monospace">Courier New</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="Verdana, sans-serif">Verdana</option>
      </select>

      <select
        onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
        disabled={isAiLoading}
        title="Font Size"
        style={{ marginRight: '4px', padding: '2px 4px', fontSize: '12px' }}
      >
        <option value="">12pt</option>
        <option value="8pt">8pt</option>
        <option value="10pt">10pt</option>
        <option value="11pt">11pt</option>
        <option value="12pt">12pt</option>
        <option value="14pt">14pt</option>
        <option value="16pt">16pt</option>
        <option value="18pt">18pt</option>
        <option value="20pt">20pt</option>
        <option value="24pt">24pt</option>
      </select>

      <span className="toolbar-divider" />

      {/* Text Formatting */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run() || isAiLoading}
        className={editor.isActive('bold') ? 'is-active' : ''}
        title="Bold (Ctrl+B)"
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run() || isAiLoading}
        className={editor.isActive('italic') ? 'is-active' : ''}
        title="Italic (Ctrl+I)"
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().chain().focus().toggleUnderline().run() || isAiLoading}
        className={editor.isActive('underline') ? 'is-active' : ''}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run() || isAiLoading}
        className={editor.isActive('strike') ? 'is-active' : ''}
        title="Strikethrough"
      >
        <Strikethrough size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        disabled={!editor.can().chain().focus().toggleSuperscript().run() || isAiLoading}
        className={editor.isActive('superscript') ? 'is-active' : ''}
        title="Superscript (Ctrl+.)"
      >
        <SuperscriptIcon size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        disabled={!editor.can().chain().focus().toggleSubscript().run() || isAiLoading}
        className={editor.isActive('subscript') ? 'is-active' : ''}
        title="Subscript (Ctrl+,)"
      >
        <SubscriptIcon size={16} />
      </button>

      <span className="toolbar-divider" />

      {/* Clear Formatting */}
      <button
        onClick={() => editor.chain().focus().clearFormatting().run()}
        disabled={isAiLoading}
        title="Clear Formatting (Ctrl+\)"
      >
        <Eraser size={16} />
      </button>

      {/* Text Transform */}
      <select
        onChange={(e) => {
          const value = e.target.value;
          if (value === 'uppercase') {
            editor.chain().focus().transformToUppercase().run();
          } else if (value === 'lowercase') {
            editor.chain().focus().transformToLowercase().run();
          } else if (value === 'titlecase') {
            editor.chain().focus().transformToTitleCase().run();
          }
          // Reset select to default
          e.target.value = '';
        }}
        disabled={isAiLoading || editor.state.selection.empty}
        title="Text Transform"
        style={{ marginLeft: '4px', padding: '2px 4px', fontSize: '12px' }}
      >
        <option value="">Transform</option>
        <option value="uppercase">UPPERCASE</option>
        <option value="lowercase">lowercase</option>
        <option value="titlecase">Title Case</option>
      </select>

      <span className="toolbar-divider" />

      {/* Text Color and Highlighting */}
      <input
        type="color"
        onChange={(e) => editor.chain().focus().setTextColor(e.target.value).run()}
        disabled={isAiLoading}
        title="Text Color"
        style={{ width: '24px', height: '24px', border: 'none', cursor: 'pointer' }}
      />
      <button
        onClick={() => editor.chain().focus().toggleHighlight({ color: '#ffff00' }).run()}
        disabled={isAiLoading}
        className={editor.isActive('highlight') ? 'is-active' : ''}
        title="Highlight"
      >
        <Highlighter size={16} />
      </button>

      <span className="toolbar-divider" />

      {/* Text Alignment */}
      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}
        title="Align Left"
        disabled={isAiLoading}
      >
        <AlignLeft size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}
        title="Align Center"
        disabled={isAiLoading}
      >
        <AlignCenter size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}
        title="Align Right"
        disabled={isAiLoading}
      >
        <AlignRight size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        className={editor.isActive({ textAlign: 'justify' }) ? 'is-active' : ''}
        title="Justify"
        disabled={isAiLoading}
      >
        <AlignJustify size={16} />
      </button>

      {/* Line Spacing */}
      <select
        onChange={(e) => editor.chain().focus().setLineSpacing(e.target.value).run()}
        disabled={isAiLoading}
        title="Line Spacing"
        style={{ marginLeft: '4px', padding: '2px 4px', fontSize: '12px' }}
      >
        <option value="1">Single</option>
        <option value="1.15" selected>
          1.15
        </option>
        <option value="1.5">1.5</option>
        <option value="2">Double</option>
        <option value="2.5">2.5</option>
        <option value="3">Triple</option>
      </select>

      <span className="toolbar-divider" />

      {/* Links */}
      <button
        onClick={setLink}
        className={editor.isActive('link') ? 'is-active' : ''}
        title="Insert Link"
        disabled={isAiLoading}
      >
        <LinkIcon size={16} />
      </button>
      <button
        onClick={unsetLink}
        disabled={!editor.isActive('link') || isAiLoading}
        title="Remove Link"
      >
        <Unlink size={16} />
      </button>

      <span className="toolbar-divider" />

      {/* Paragraph Styles */}
      <button
        onClick={() => editor.chain().focus().setParagraph().run()}
        className={editor.isActive('paragraph') ? 'is-active' : ''}
        title="Paragraph"
        disabled={isAiLoading}
      >
        <Pilcrow size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
        title="Heading 1"
        disabled={isAiLoading}
      >
        <Heading1 size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
        title="Heading 2"
        disabled={isAiLoading}
      >
        <Heading2 size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
        title="Heading 3"
        disabled={isAiLoading}
      >
        <Heading3 size={16} />
      </button>

      <span className="toolbar-divider" />

      {/* Lists and Blocks */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? 'is-active' : ''}
        title="Bullet List"
        disabled={isAiLoading}
      >
        <List size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? 'is-active' : ''}
        title="Ordered List"
        disabled={isAiLoading}
      >
        <ListOrdered size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive('blockquote') ? 'is-active' : ''}
        title="Blockquote"
        disabled={isAiLoading}
      >
        <Quote size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? 'is-active' : ''}
        title="Code Block"
        disabled={isAiLoading}
      >
        <Code size={16} />
      </button>

      <span className="toolbar-divider" />

      {/* AI Features */}
      <button
        onClick={addCommentHighlight}
        disabled={editor.state.selection.empty || isAiLoading}
        title="Add Comment Highlight"
      >
        <MessageSquarePlus size={16} />
      </button>
      <button
        onClick={onAskGoose}
        disabled={isAiLoading}
        title={
          editor.state.selection.empty
            ? "Ask Goose about this document"
            : "Ask Goose about selected text (with document context)"
        }
        style={{
          background: !isAiLoading ? '#9333ea' : undefined,
          color: !isAiLoading ? 'white' : undefined,
        }}
      >
        {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <MessageCircleQuestion size={16} />}
        <span style={{ marginLeft: '4px', fontSize: '12px' }}>
          {isAiLoading ? 'Asking...' : 'Ask Goose'}
        </span>
      </button>
      <button
        onClick={onSendAllToAI}
        disabled={!canSendToAI || isAiLoading}
        title="Send All Pending Instructions to AI"
        style={{
          background: canSendToAI && !isAiLoading ? '#007bff' : undefined,
          color: canSendToAI && !isAiLoading ? 'white' : undefined,
        }}
      >
        {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        <span style={{ marginLeft: '4px', fontSize: '12px' }}>
          {isAiLoading ? 'Sending...' : `Send (${commentsReadyCount})`}
        </span>
      </button>
      <button
        onClick={onTriggerAICollaboration}
        disabled={isAiLoading}
        title="AI Collaboration (Document-Wide Feedback)"
        style={{
          background: !isAiLoading ? '#28a745' : undefined,
          color: !isAiLoading ? 'white' : undefined,
        }}
      >
        {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        <span style={{ marginLeft: '4px', fontSize: '12px' }}>
          {isAiLoading ? 'Processing...' : 'AI Collab'}
        </span>
      </button>
    </div>
  );
};

export default EditorToolbar;
