import { Extension } from '@tiptap/core';

export const GoogleDocsEnterBehavior = Extension.create({
  name: 'googleDocsEnterBehavior',

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        // Basic enter behavior - just use default
        return false;
      },
    };
  },
});
