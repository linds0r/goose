import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textTransform: {
      /**
       * Transform text to uppercase
       */
      transformToUppercase: () => ReturnType;
      /**
       * Transform text to lowercase
       */
      transformToLowercase: () => ReturnType;
      /**
       * Transform text to title case
       */
      transformToTitleCase: () => ReturnType;
    };
  }
}

export const TextTransform = Extension.create({
  name: 'textTransform',

  addCommands() {
    return {
      transformToUppercase:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const { from, to } = selection;

          if (from === to) return false;

          const selectedText = state.doc.textBetween(from, to);
          const transformedText = selectedText.toUpperCase();

          if (dispatch) {
            const tr = state.tr.replaceWith(from, to, state.schema.text(transformedText));
            dispatch(tr);
          }

          return true;
        },
      transformToLowercase:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const { from, to } = selection;

          if (from === to) return false;

          const selectedText = state.doc.textBetween(from, to);
          const transformedText = selectedText.toLowerCase();

          if (dispatch) {
            const tr = state.tr.replaceWith(from, to, state.schema.text(transformedText));
            dispatch(tr);
          }

          return true;
        },
      transformToTitleCase:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const { from, to } = selection;

          if (from === to) return false;

          const selectedText = state.doc.textBetween(from, to);
          const transformedText = selectedText.replace(
            /\w\S*/g,
            (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
          );

          if (dispatch) {
            const tr = state.tr.replaceWith(from, to, state.schema.text(transformedText));
            dispatch(tr);
          }

          return true;
        },
    };
  },
});
