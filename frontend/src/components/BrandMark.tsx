import { Link } from 'react-router';
import { LOGO_SRC, PRODUCT_NAME } from '../content/product';

export function BrandMark({
  to = '/',
  size = 40,
  wordmark = PRODUCT_NAME,
}: {
  to?: string | null;
  size?: number;
  wordmark?: string | null;
}) {
  const inner = (
    <>
      <img
        src={LOGO_SRC}
        alt={wordmark ? '' : PRODUCT_NAME}
        width={size}
        height={size}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
      {wordmark ? (
        <span className="font-display text-xl font-bold tracking-tight">
          {wordmark}
        </span>
      ) : null}
    </>
  );

  const className = 'inline-flex items-center gap-2 text-ba-ink';
  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    );
  }
  return <span className={className}>{inner}</span>;
}
