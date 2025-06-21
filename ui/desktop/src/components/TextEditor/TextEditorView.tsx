// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/TextEditorView.tsx
import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorToolbar from './EditorToolbar';
import './TextEditor.css';
import { View, ViewOptions } from '../../App';
import AIPromptAnchorMark from './extensions/AIPromptAnchorMark'; // Import the new Mark

interface TextEditorViewProps {
  setView: (view: View, viewOptions?: ViewOptions) => void;
}

const TextEditorView: React.FC<TextEditorViewProps> = ({ setView }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      AIPromptAnchorMark, // Add the Mark to the editor extensions
    ],
    content: `
      <h2>
        Hi there,
      </h2>
      <p>
        this is a <em>basic</em> example of <strong>tiptap</strong>. Sure, there are all kind of basic text styles you’d probably expect from a text editor. But wait until you see the lists:
      </p>
      <ul>
        <li>
          That’s a bullet list with one …
        </li>
        <li>
          … or two list items.
        </li>
      </ul>
      <p>
        Isn't that great? And all of that is editable. But wait, there’s more. Let’s try a code block:
      </p>
      <pre><code class="language-css">body {
  display: none;
}</code></pre>
      <p>
        Hope you have fun playing with this.
      </p>
    `,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl m-5 focus:outline-none',
      },
    },
  });

  return (
    <div className="text-editor-container" style={{ paddingTop: '38px' }}>
      <EditorToolbar editor={editor} setView={setView} />
      <EditorContent editor={editor} className="editor-content-area" />
    </div>
  );
};

export default TextEditorView;
