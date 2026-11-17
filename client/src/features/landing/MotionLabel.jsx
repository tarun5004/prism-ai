export default function MotionLabel({ children }) {
  return (
    <span className="motion-label">
      <span className="motion-label-track">
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
    </span>
  );
}
