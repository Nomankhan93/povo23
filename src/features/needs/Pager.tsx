export function Pager({
  page,
  more,
  busy,
  onChange,
}: {
  page: number;
  more: boolean;
  busy: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="actions">
      <button
        className="secondary"
        disabled={busy || page === 0}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>Page {page + 1}</span>
      <button
        className="secondary"
        disabled={busy || !more}
        onClick={() => onChange(page + 1)}
      >
        Next 50
      </button>
    </div>
  );
}
