// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/extensions/AIPromptAnchorMark.ts
import { Mark, mergeAttributes } from '@tiptap/core';

export interface AIPromptAnchorOptions {
  HTMLAttributes: Record<string, string | number | boolean | undefined>; // Changed 'any' here
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiPromptAnchor: {
      /**
       * Set an AI prompt anchor mark
       */
      setAIPromptAnchor: (attributes: { promptId: string }) => ReturnType;
      /**
       * Toggle an AI prompt anchor mark
       */
      toggleAIPromptAnchor: (attributes: { promptId: string }) => ReturnType;
      /**
       * Unset an AI prompt anchor mark
       */
      unsetAIPromptAnchor: () => ReturnType;
    };
  }
}

export const AIPromptAnchorMark = Mark.create<AIPromptAnchorOptions>({
  name: 'aiPromptAnchor',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      promptId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-prompt-id'),
        renderHTML: (attributes) => {
          if (!attributes.promptId) {
            return {};
          }
          return {
            'data-prompt-id': attributes.promptId,
          };
        },
      },
      // We can add other attributes later, e.g., for styling or state
      // 'data-ai-comment-active': 'false',
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-prompt-id]',
        // Optionally, add a getAttrs function if more complex parsing is needed
        // getAttrs: element => {
        //   const promptId = (element as HTMLElement).getAttribute('data-prompt-id');
        //   return promptId ? { promptId } : false;
        // },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Merge with any custom HTML attributes defined in options
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setAIPromptAnchor:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleAIPromptAnchor:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetAIPromptAnchor:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

export default AIPromptAnchorMark;
