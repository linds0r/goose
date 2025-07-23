import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textStyle: {
      /**
       * Remove all text styles
       */
      removeEmptyTextStyle: () => ReturnType;
    };
  }
}

export const TextStyle = Extension.create({
  name: 'textStyle',

  addCommands() {
    return {
      removeEmptyTextStyle:
        () =>
        ({ commands }) => {
          const attributes = this.editor.getAttributes('textStyle');
          const hasStyles = Object.entries(attributes).some(([, value]) => !!value);

          if (!hasStyles) {
            return commands.unsetMark('textStyle');
          }

          return false;
        },
    };
  },
});
