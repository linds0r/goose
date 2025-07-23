import { Extension } from '@tiptap/core';

export const LineSpacing = Extension.create({
  name: 'lineSpacing',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: element => element.style.lineHeight,
            renderHTML: attributes => {
              if (!attributes.lineHeight) {
                return {};
              }

              return {
                style: `line-height: ${attributes.lineHeight}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight: (lineHeight: string) => ({ chain }) => {
        return chain()
          .updateAttributes('paragraph', { lineHeight })
          .run();
      },
      unsetLineHeight: () => ({ chain }) => {
        return chain()
          .updateAttributes('paragraph', { lineHeight: null })
          .run();
      },
    };
  },
});
