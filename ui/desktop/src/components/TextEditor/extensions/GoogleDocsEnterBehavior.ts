import { Extension } from '@tiptap/core';

/**
 * Google Docs-like Enter key behavior extension
 * - Single Enter: Creates new paragraph without extra spacing
 * - Double Enter: Creates paragraph with spacing (if desired)
 * - Shift+Enter: Creates line break within paragraph
 */
export const GoogleDocsEnterBehavior = Extension.create({
  name: 'googleDocsEnterBehavior',

  addKeyboardShortcuts() {
    return {
      // Handle Enter key
      'Enter': () => {
        const { state } = this.editor.view;
        const { selection } = state;
        
        // Check if we're at the end of an empty paragraph
        const { $from } = selection;
        const currentNode = $from.node();
        
        if (currentNode.type.name === 'paragraph' && currentNode.content.size === 0) {
          // We're in an empty paragraph, just create a new paragraph
          return this.editor.commands.createParagraphNear();
        }
        
        // Default behavior: create new paragraph
        return this.editor.commands.createParagraphNear();
      },
      
      // Handle Shift+Enter for line breaks (like Google Docs)
      'Shift-Enter': () => {
        return this.editor.commands.setHardBreak();
      },
    };
  },
});
