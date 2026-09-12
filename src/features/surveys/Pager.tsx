export function Pager({
  page,
  more,
  busy,
  change,
}: {
  page: number;
  more: boolean;
  busy: boolean;
  change: (n: number) => void;
}) {
  return (
    <div className="actions">
      <button
        className="secondary"
        disabled={busy || page === 0}
        onClick={() => change(page - 1)}
      >
        Previous
      </button>
      <span>Page {page + 1}</span>
      <button
        className="secondary"
        disabled={busy || !more}
        onClick={() => change(page + 1)}
      >
        Next 50
      </button>
    </div>
  );
}
