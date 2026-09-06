import { useEffect, useRef, type JSX, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

interface LeaveTabModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function LeaveTabModal ({ open, onConfirm, onCancel }: LeaveTabModalProps): JSX.Element | null {
  const cancelBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelBtnRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey (event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  function onOverlayClick (event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) onCancel()
  }

  if (!open) return null

  return createPortal(
    <div
      className="modal-overlay is-open"
      role="dialog"
      aria-labelledby="leave-tab-title"
      aria-modal="true"
      onClick={onOverlayClick}
    >
      <div className="modal-dialog modal-dialog--reference">
        <div className="modal-header">
          <h2 id="leave-tab-title" className="modal-title">Leave this tab?</h2>
        </div>
        <div className="modal-content">
          <p className="leave-tab-message">
            Information on this page will be lost.
          </p>
          <div className="modal-actions">
            <button
              ref={cancelBtnRef}
              type="button"
              className="btn-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-batch-analysis"
              onClick={onConfirm}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
