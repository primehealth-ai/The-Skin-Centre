'use client'
import * as React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]'
    
    const variants = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 shadow-sm shadow-blue-500/10',
      secondary: 'bg-slate-800 hover:bg-slate-900 text-white focus:ring-slate-500 dark:bg-slate-700 dark:hover:bg-slate-600',
      success: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500 shadow-sm shadow-emerald-500/10',
      danger: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500 shadow-sm shadow-rose-500/10',
      ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
      outline: 'border border-slate-300 hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? 'true' : 'false'}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
