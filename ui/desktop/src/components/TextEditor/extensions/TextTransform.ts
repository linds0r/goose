import { Extension } from '@tiptap/core';

export const TextTransform = Extension.create({
  name: 'textTransform',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          textTransform: {
            default: null,
            parseHTML: element => element.style.textTransform,
            renderHTML: attributes => {
              if (!attributes.textTransform) {
                return {};
              }

              return {
                style: `text-transform: ${attributes.textTransform}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextTransform: (textTransform: string) => ({ chain }) => {
        return chain()
          .setMark('textStyle', { textTransform })
          .run();
      },
      unsetTextTransform: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { textTransform: null })
          .run();
      },
    };
  },
});
