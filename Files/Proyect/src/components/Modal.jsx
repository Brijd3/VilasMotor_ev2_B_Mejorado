import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Modal accesible: role="dialog", cierre con Escape o clic en el fondo,
 * foco inicial dentro del diálogo, foco atrapado con Tab y restauración del foco al cerrar.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({ title, onClose, children, size = 'md', align = 'top' }) => {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const firstField = panel?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    (firstField || panel)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <div
      className={`modal-backdrop modal-align-${align}`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current(); }}
    >
      <div
        ref={panelRef}
        className={`glass-panel modal-panel modal-${size} animate-fade-in`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar ventana" title="Cerrar">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
