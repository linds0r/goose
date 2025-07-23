import { Extension } from '@tiptap/core';

export const ClearFormatting = Extension.create({
  name: 'clearFormatting',

  addCommands() {
    return {
      clearFormatting: () => ({ chain }) => {
        return chain()
          .clearNodes()
          .unsetAllMarks()
          .run();
      },
    };
  },
});
