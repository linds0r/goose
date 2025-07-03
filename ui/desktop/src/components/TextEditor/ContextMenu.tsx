import React, { useEffect, useRef } from 'react';
import {
  Sparkles,
  MessageSquarePlus,
  Scissors,
  Copy,
  ClipboardPaste,
  Link,
  Highlighter,
  Search,
  BarChart3,
} from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  isVisible: boolean;
  hasSelection: boolean;
  onClose: () => void;
  onAIRefine: () => void;
  onAIAssist: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onAddLink: () => void;
  onHighlight: () => void;
  onFindReplace: () => void;
  onDocumentStats: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  isVisible,
  hasSelection,
  onClose,
  onAIRefine,
  onAIAssist,
  onCut,
  onCopy,
  onPaste,
  onAddLink,
  onHighlight,
  onFindReplace,
  onDocumentStats,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle clicks outside the menu to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isVisible, onClose]);

  // Adjust menu position to stay within viewport
  const adjustPosition = () => {
    if (!menuRef.current) return { x, y };

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // Adjust horizontal position
    if (x + menuRect.width > viewportWidth) {
      adjustedX = viewportWidth - menuRect.width - 10;
    }

    // Adjust vertical position
    if (y + menuRect.height > viewportHeight) {
      adjustedY = viewportHeight - menuRect.height - 10;
    }

    return { x: Math.max(10, adjustedX), y: Math.max(10, adjustedY) };
  };

  const { x: adjustedX, y: adjustedY } = adjustPosition();

  if (!isVisible) return null;

  const handleMenuItemClick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 1000,
      }}
    >
      {/* AI Actions */}
      <div className="context-menu-item" onClick={() => handleMenuItemClick(onAIRefine)}>
        <Sparkles size={16} />
        <span>AI Refine {hasSelection ? 'Selection' : 'Document'}</span>
      </div>
      
      <div className="context-menu-item" onClick={() => handleMenuItemClick(onAIAssist)}>
        <MessageSquarePlus size={16} />
        <span>AI Assist with Comment</span>
      </div>

      <div className="context-menu-divider" />

      {/* Standard editing actions - only show if there's a selection */}
      {hasSelection && (
        <>
          <div className="context-menu-item" onClick={() => handleMenuItemClick(onCut)}>
            <Scissors size={16} />
            <span>Cut</span>
          </div>
          
          <div className="context-menu-item" onClick={() => handleMenuItemClick(onCopy)}>
            <Copy size={16} />
            <span>Copy</span>
          </div>
        </>
      )}

      <div className="context-menu-item" onClick={() => handleMenuItemClick(onPaste)}>
        <ClipboardPaste size={16} />
        <span>Paste</span>
      </div>

      {hasSelection && (
        <>
          <div className="context-menu-divider" />
          
          <div className="context-menu-item" onClick={() => handleMenuItemClick(onAddLink)}>
            <Link size={16} />
            <span>Add Link</span>
          </div>
          
          <div className="context-menu-item" onClick={() => handleMenuItemClick(onHighlight)}>
            <Highlighter size={16} />
            <span>Highlight</span>
          </div>
        </>
      )}

      {/* Document-level actions - only show when no selection */}
      {!hasSelection && (
        <>
          <div className="context-menu-divider" />
          
          <div className="context-menu-item" onClick={() => handleMenuItemClick(onFindReplace)}>
            <Search size={16} />
            <span>Find & Replace</span>
          </div>
          
          <div className="context-menu-item" onClick={() => handleMenuItemClick(onDocumentStats)}>
            <BarChart3 size={16} />
            <span>Document Stats</span>
          </div>
        </>
      )}
    </div>
  );
};

export default ContextMenu;
