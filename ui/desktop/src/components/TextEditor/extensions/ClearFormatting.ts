import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    clearFormatting: {
      /**
       * Clear all formatting from the current selection
       */
      clearFormatting: () => ReturnType;
    };
  }
}

export const ClearFormatting = Extension.create({
  name: 'clearFormatting',

  addCommands() {
    return {
      clearFormatting:
        () =>
        ({ chain }) => {
          // Clear all marks from the selection
          return chain()
            .unsetBold()
            .unsetItalic()
            .unsetStrike()
            .unsetUnderline()
            .unsetSuperscript()
            .unsetSubscript()
            .unsetHighlight()
            .unsetTextColor()
            .unsetLink()
            .unsetFontFamily()
            .unsetFontSize()
            .run();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod+\\': () => this.editor.commands.clearFormatting(),
    };
  },
});
