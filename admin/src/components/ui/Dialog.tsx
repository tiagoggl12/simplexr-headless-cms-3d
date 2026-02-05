import { ReactNode, createContext, useContext } from 'react';
import { cn } from '@/lib/utils.js';

interface DialogContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('Dialog components must be used within a Dialog');
  }
  return context;
}

interface DialogProps {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Dialog({ children, open, onOpenChange }: DialogProps) {
  return (
    <DialogContext.Provider value={{ isOpen: open, open: () => onOpenChange(true), close: () => onOpenChange(false) }}>
      {children}
    </DialogContext.Provider>
  );
}

interface DialogTriggerProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function DialogTrigger({ children, className, onClick }: DialogTriggerProps) {
  const { open } = useDialog();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onClick?.();
        open();
      }}
    >
      {children}
    </button>
  );
}

interface DialogContentProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function DialogContent({ children, className, title }: DialogContentProps) {
  const { isOpen, close } = useDialog();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={close}
      />

      {/* Content */}
      <div
        className={cn(
          'relative bg-white rounded-xl shadow-lg max-w-md w-full mx-4 max-h-[90vh] overflow-auto',
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={close}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

interface DialogHeaderProps {
  children: ReactNode;
  className?: string;
}

export function DialogHeader({ children, className }: DialogHeaderProps) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div className={cn('flex items-center justify-end gap-3 mt-6', className)}>
      {children}
    </div>
  );
}
