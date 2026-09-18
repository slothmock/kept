import type { ReactNode } from "react";

interface ModalDialogProps {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly className: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly backdropTestId?: string;
}

export function ModalDialog({
  ariaLabel,
  backdropTestId,
  children,
  className,
  closeLabel,
  onClose,
}: ModalDialogProps) {
  return (
    <div
      className="modal-backdrop"
      data-testid={backdropTestId}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section aria-label={ariaLabel} aria-modal="true" className={className} role="dialog">
        <button aria-label={closeLabel} className="modal-close" type="button" onClick={onClose}>×</button>
        {children}
      </section>
    </div>
  );
}
