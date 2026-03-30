import { isWindows } from '../../i18n';

interface FlagIconProps {
  flag: string;
  flagSvg: string;
  size?: number;
  className?: string;
}

export default function FlagIcon({ flag, flagSvg, size = 16, className = '' }: FlagIconProps) {
  if (!isWindows) {
    return <span className={className}>{flag}</span>;
  }
  return (
    <img
      src={flagSvg}
      alt={flag}
      width={size}
      height={Math.round(size * 0.75)}
      className={`inline-block rounded-sm ${className}`}
      style={{ verticalAlign: 'middle' }}
    />
  );
}
