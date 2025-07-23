import { Mark, mergeAttributes } from '@tiptap/core';

export const StrikethroughDiffMark = Mark.create({
  name: 'diffDel',
  parseHTML() {
    return [{ tag: 'del[data-diff-del]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'del',
      mergeAttributes(
        { 'data-diff-del': 'true', style: 'text-decoration: line-through' },
        HTMLAttributes
      ),
      0,
    ];
  },
});

export default StrikethroughDiffMark;
