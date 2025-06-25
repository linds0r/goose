// /Users/lindseyf/goose-repo/ui/desktop/src/components/TextEditor/DocumentTypes.ts
import type { View, ViewOptions } from '../../App'; // Assuming ViewOptions might be needed by TextEditorProps

export interface Comment {
  id: string;
  textRange: { from: number; to: number } | null; // Can be null if AI suggestion location not found
  selectedText: string; // Original text for user comments, or AI identified text for collab suggestions
  instruction: string;
  status: 'pending' | 'processing' | 'suggestion_ready' | 'applied' | 'error';
  aiSuggestion?: string;
  timestamp: Date;
  errorMessage?: string;
  inlineVisible?: boolean; // For showing diffs inline
  needsMarkApplied?: boolean; // Flag for useEffect to apply mark for new AI collab suggestions
}

export interface Document {
  // This interface seems more for a standalone document management system
  id: string;
  title: string;
  content: string; // TipTap JSON content or HTML
  comments: Comment[]; // If comments are stored with a document
  metadata: {
    wordCount: number;
    lastModified: Date;
    autoSaveEnabled: boolean;
    filePath?: string;
  };
}

// Props for the TextEditorView component itself
export interface TextEditorProps {
  // onClose: () => void; // onClose was in the original template, but not used in current TextEditorView
  setView: (view: View, viewOptions?: ViewOptions) => void;
  // initialDocument?: Document; // Not currently used by TextEditorView
}
