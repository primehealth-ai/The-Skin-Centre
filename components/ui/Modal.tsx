'use client'
import * as React from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const modalRef = React.useRef<HTMLDivElement>(null)

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Escape key handler
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus trap implementation
  React.useEffect(() => {
    if (!isOpen) return

    const modalElement = modalRef.current
    if (!modalElement) return

    // Focus the modal itself or first focusable element
    const focusableElements = modalElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    
    if (focusableElements.length > 0) {
      focusableElements[0].focus()
    } else {
      modalElement.focus()
    }

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusables = modalElement.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      
      if (focusables.length === 0) return

      const firstElement = focusables[0]
      const lastElement = focusables[focusables.length - 1]

      if (e.shiftKey) {
        // Shift + Tab -> Wrap to last
        if (document.activeElement === firstElement) {
          lastElement.focus()
          e.preventDefault()
        }
      } else {
        // Tab -> Wrap to first
        if (document.activeElement === lastElement) {
          firstElement.focus()
          e.preventDefault()
        }
      }
    }

    window.addEventListener('keydown', handleFocusTrap)
    return () => window.removeEventListener('keydown', handleFocusTrap)
  }, [isOpen])

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  // Generate an ID for accessibility referencing
  const titleId = React.useId()

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            ref={modalRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className={`relative w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-10 flex flex-col overflow-hidden outline-none ${sizes[size]}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              {title ? (
                <h3 id={titleId} className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {title}
                </h3>
              ) : (
                <div />
              )}
              <button
                onClick={onClose}
                aria-label="Close modal"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg p-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 px-6 py-5 overflow-y-auto max-h-[75vh]">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
