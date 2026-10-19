export function CreationLoading({
  label,
  skeleton = false,
}: {
  label: string;
  skeleton?: boolean;
}) {
  return (
    <div className="creation-loading" role="status">
      <span className="creation-loading-label">
        <span className="creation-spinner" aria-hidden="true" />
        {label}
      </span>
      {skeleton && (
        <div className="creation-skeleton-group" aria-hidden="true">
          <span className="creation-skeleton" />
          <span className="creation-skeleton" />
          <span className="creation-skeleton" />
        </div>
      )}
    </div>
  );
}
