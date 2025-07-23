import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentHighlightOptions {
  HTMLAttributes: Record<string, string | number | boolean | undefined>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentHighlight: {
      /**
       * Set a comment highlight mark
       */
      setCommentHighlight: (attributes: { commentId: string }) => ReturnType;
      /**
       * Toggle a comment highlight mark
       */
      toggleCommentHighlight: (attributes: { commentId: string }) => ReturnType;
      /**
       * Unset a comment highlight mark
       */
      unsetCommentHighlight: () => ReturnType;
    };
  }
}

export const CommentHighlightMark = Mark.create<CommentHighlightOptions>({
  name: 'commentHighlight',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'comment-highlight', // Default class for styling
      },
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes) => {
          if (!attributes.commentId) {
            return {};
          }
          return {
            'data-comment-id': attributes.commentId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-id]',
        getAttrs: (element: Node) => {
          // Use Node type, then check if it's an HTMLElement
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          // Check for the presence of the 'data-comment-id' attribute.
          // If it exists (even if empty for this check, addAttributes handles value), rule matches.
          if (element.hasAttribute('data-comment-id')) {
            return null; // Rule matches, let addAttributes handle parsing the actual commentId value.
          }
          return false; // Attribute not present, rule does not match.
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCommentHighlight:
        (attributes) =>
        ({ commands }) => {
          if (!attributes.commentId) {
            return false;
          }
          return commands.setMark(this.type, attributes);
        },
      toggleCommentHighlight:
        (attributes) =>
        ({ commands }) => {
          if (!attributes.commentId) {
            return false; // commentId is required to toggle specific comment
          }
          return commands.toggleMark(this.type, attributes);
        },
      unsetCommentHighlight:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.type);
        },
    };
  },
});

export default CommentHighlightMark;
