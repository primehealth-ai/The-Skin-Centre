import * as React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
}

export function Card({ className = '', hoverable = false, children, ...props }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm transition-all duration-200 ${
        hoverable ? 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-[1px]' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

Card.Header = function CardHeader({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

Card.Title = function CardTitle({ className = '', children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-base font-semibold text-slate-800 dark:text-slate-100 leading-none tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  )
}

Card.Description = function CardDescription({ className = '', children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-sm text-slate-500 dark:text-slate-400 mt-1.5 ${className}`} {...props}>
      {children}
    </p>
  )
}

Card.Content = function CardContent({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`${className}`} {...props}>{children}</div>
}

Card.Footer = function CardFooter({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`border-t border-slate-100 dark:border-slate-800 pt-3 mt-4 flex items-center justify-end ${className}`} {...props}>
      {children}
    </div>
  )
}
