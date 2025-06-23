import { type View, type ViewOptions } from '../../App';

export interface Comment {
  id: string;
  textRange: { from: number; to: number };
  selectedText: string;
  instruction?: string; // Now optional to support upcoming features
  status: 'pending' | 'processing' | 'suggestion_ready' | 'applied' | 'error';
  aiSuggestion?: string;
  timestamp: Date;
  errorMessage?: string;
  inlineVisible?: boolean;
}

export interface CommentThread {
  commentId: string;
  position: { top: number; right: number };
  isVisible: boolean;
}

export interface Document {
  id: string;
  title: string;
  content: string; // TipTap JSON content
  comments: Comment[];
  metadata: {
    wordCount: number;
    lastModified: Date;
    autoSaveEnabled: boolean;
    filePath?: string;
  };
}

export interface TextEditorProps {
  onClose: () => void;
  setView: (view: View, viewOptions?: ViewOptions) => void;
  initialDocument?: Document;
}
