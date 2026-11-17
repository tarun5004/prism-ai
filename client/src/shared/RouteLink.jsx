export default function RouteLink({ to, onNavigate, children, ...props }) {
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        if (
          onNavigate &&
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          !event.currentTarget.target
        ) {
          event.preventDefault();
          onNavigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}
