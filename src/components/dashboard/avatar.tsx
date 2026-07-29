import { hashToIndex, initials } from '@/lib/utils';

// Tints reuse the categorical slots, but as a decorative wash only — an avatar
// never encodes data, so this is not a series assignment.
const AVATAR_TINTS = ['--viz-1', '--viz-2', '--viz-3', '--viz-4', '--viz-5', '--viz-6'];

export function Avatar({
  name,
  email,
  size = 'md',
}: {
  name: string | null;
  email: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tint = AVATAR_TINTS[hashToIndex(email, AVATAR_TINTS.length)]!;
  const dimensions =
    size === 'sm' ? 'size-7 text-[10px]' : size === 'lg' ? 'size-12 text-sm' : 'size-8 text-[11px]';

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${dimensions}`}
      style={{
        backgroundColor: `color-mix(in oklab, var(${tint}) 18%, transparent)`,
        color: `var(${tint})`,
      }}
    >
      {initials(name, email)}
    </span>
  );
}
