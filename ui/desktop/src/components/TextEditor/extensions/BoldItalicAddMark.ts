import { Mark, mergeAttributes } from '@tiptap/core';

export const BoldItalicAddMark = Mark.create({
  name: 'diffAdd',
  parseHTML() {
    return [{ tag: 'em[data-diff-add]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'em',
      mergeAttributes(
        { 'data-diff-add': 'true', style: 'font-weight:700;font-style:italic' },
        HTMLAttributes
      ),
      0,
    ];
  },
});

export default BoldItalicAddMark;
