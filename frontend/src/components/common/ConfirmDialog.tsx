import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DialogState {
  open: boolean;
  title: string;
  message: string;
  type: 'confirm' | 'alert';
}

export function useDialog() {
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const [state, setState] = useState<DialogState>({
    open: false,
    title: '',
    message: '',
    type: 'alert',
  });

  const showAlert = useCallback((message: string, title = '알림') => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ open: true, title, message, type: 'alert' });
    });
  }, []);

  const showConfirm = useCallback((message: string, title = '확인') => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ open: true, title, message, type: 'confirm' });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  return { dialogState: state, showAlert, showConfirm, handleConfirm, handleCancel };
}

export default function ConfirmDialog({
  open,
  title,
  message,
  type,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  type: 'confirm' | 'alert';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>
        <div className="px-6 pb-6">
          <p className="text-gray-600 whitespace-pre-line text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex border-t border-gray-200">
          {type === 'confirm' && (
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r border-gray-200 transition-colors"
            >
              취소
            </button>
          )}
          <button
            onClick={onConfirm}
            autoFocus
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              type === 'confirm'
                ? 'text-red-600 hover:bg-red-50'
                : 'text-green-700 hover:bg-green-50'
            }`}
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
