import React from 'react';
import { SeverityLevel, DeliveryStatus, ValidationStatus } from '../../types/security';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'slate' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  className = '',
  icon,
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    rose: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/30',
    slate: 'bg-slate-800 text-slate-300 border border-slate-700',
    outline: 'bg-transparent text-slate-400 border border-slate-700',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md tracking-wide font-mono transition-colors ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
};

export const SeverityBadge: React.FC<{ severity: SeverityLevel }> = ({ severity }) => {
  const map: Record<SeverityLevel, { variant: 'rose' | 'amber' | 'blue' | 'slate'; label: string }> = {
    critical: { variant: 'rose', label: 'CRITICAL' },
    high: { variant: 'rose', label: 'HIGH' },
    medium: { variant: 'amber', label: 'MEDIUM' },
    low: { variant: 'blue', label: 'LOW' },
    info: { variant: 'slate', label: 'INFO' },
  };

  const config = map[severity] || { variant: 'slate', label: severity.toUpperCase() };
  return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
};

export const DeliveryBadge: React.FC<{ status: DeliveryStatus }> = ({ status }) => {
  const map: Record<DeliveryStatus, { variant: 'emerald' | 'amber' | 'rose' | 'purple' | 'slate'; label: string }> = {
    delivered: { variant: 'emerald', label: 'DELIVERED' },
    sent: { variant: 'emerald', label: 'SENT' },
    pending: { variant: 'amber', label: 'PENDING' },
    failed: { variant: 'rose', label: 'FAILED' },
    rejected: { variant: 'rose', label: 'REJECTED' },
    retrying: { variant: 'purple', label: 'RETRYING' },
  };

  const config = map[status] || { variant: 'slate', label: status.toUpperCase() };
  return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
};

export const ValidationBadge: React.FC<{ status: ValidationStatus }> = ({ status }) => {
  const map: Record<ValidationStatus, { variant: 'emerald' | 'amber' | 'rose' | 'slate'; label: string }> = {
    passed: { variant: 'emerald', label: 'PASSED' },
    warning: { variant: 'amber', label: 'WARNING' },
    failed: { variant: 'rose', label: 'FAILED' },
    pending: { variant: 'amber', label: 'EVALUATING' },
    unknown: { variant: 'slate', label: 'UNVERIFIED' },
  };

  const config = map[status] || { variant: 'slate', label: status.toUpperCase() };
  return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
};
