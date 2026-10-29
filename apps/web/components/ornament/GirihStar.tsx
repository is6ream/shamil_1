import { GIRIH_STAR_POINTS } from "./GirihPattern";

type GirihStarProps = {
  className?: string;
};

/** Звезда гириха с точкой в центре — для разделителей. Цвет — currentColor. */
export function GirihStar({ className }: GirihStarProps) {
  return (
    <svg className={className} viewBox="0 0 60 60" aria-hidden="true" focusable="false">
      <polygon points={GIRIH_STAR_POINTS} fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="30" cy="30" r="5" fill="currentColor" />
    </svg>
  );
}
