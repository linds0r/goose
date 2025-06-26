import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

export interface LinkOptions {
  openOnClick: boolean;
  linkOnPaste: boolean;
  autolink: boolean;
  protocols: string[];
  HTMLAttributes: Record<string, unknown>;
  validate?: (url: string) => boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    link: {
      /**
       * Set a link mark
       */
      setLink: (attributes: { href: string; target?: string }) => ReturnType;
      /**
       * Toggle a link mark
       */
      toggleLink: (attributes: { href: string; target?: string }) => ReturnType;
      /**
       * Unset a link mark
       */
      unsetLink: () => ReturnType;
    };
  }
}

export const Link = Mark.create<LinkOptions>({
  name: 'link',

  priority: 1000,

  keepOnSplit: false,

  addOptions() {
    return {
      openOnClick: true,
      linkOnPaste: true,
      autolink: true,
      protocols: [],
      HTMLAttributes: {},
      validate: undefined,
    };
  },

  addAttributes() {
    return {
      href: {
        default: null,
      },
      target: {
        default: this.options.HTMLAttributes.target,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[href]:not([href *= "javascript:" i])' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setLink:
        (attributes) =>
        ({ chain }) => {
          return chain().setMark(this.name, attributes).setMeta('preventAutolink', true).run();
        },

      toggleLink:
        (attributes) =>
        ({ chain }) => {
          return chain()
            .toggleMark(this.name, attributes, { extendEmptyMarkRange: true })
            .setMeta('preventAutolink', true)
            .run();
        },

      unsetLink:
        () =>
        ({ chain }) => {
          return chain()
            .unsetMark(this.name, { extendEmptyMarkRange: true })
            .setMeta('preventAutolink', true)
            .run();
        },
    };
  },

  addProseMirrorPlugins() {
    const plugins = [];

    if (this.options.openOnClick) {
      plugins.push(
        new Plugin({
          key: new PluginKey('handleClickLink'),
          props: {
            handleClick: (_view, _pos, event) => {
              const attrs = this.editor.getAttributes(this.name);
              const link = (event.target as HTMLElement)?.closest('a');

              if (link && attrs.href) {
                window.open(attrs.href, attrs.target);
                return true;
              }

              return false;
            },
          },
        })
      );
    }

    return plugins;
  },
});
